import { describe, expect, test } from 'vitest';
import {
  BOARD_SIZE,
  CELL,
  Board,
  idx,
  canPlace,
  place,
  findCompletedLines,
  applyClears,
  anyFit,
  validPlacements,
  isFilled,
} from '../src/core/board';
import { getPiece } from '../src/core/pieces';

function emptyBoard(): Board {
  return new Uint8Array(64);
}

describe('cell predicates', () => {
  test('empty is not filled; every special state is filled', () => {
    expect(isFilled(CELL.EMPTY)).toBe(false);
    for (const v of [1, 5, CELL.GEM, CELL.ICE, CELL.CRACKED, CELL.BOMB, CELL.STONE, CELL.WILD]) {
      expect(isFilled(v)).toBe(true);
    }
  });
});

describe('canPlace / place', () => {
  test('places a piece on empty cells', () => {
    const b = emptyBoard();
    const p = getPiece('SQ2_0');
    expect(canPlace(b, p, 3, 3)).toBe(true);
    place(b, p, 3, 3);
    expect(b[idx(3, 3)]).toBe(p.color);
    expect(b[idx(4, 3)]).toBe(p.color);
    expect(b[idx(3, 4)]).toBe(p.color);
    expect(b[idx(4, 4)]).toBe(p.color);
  });

  test('rejects overlap with any filled cell', () => {
    const b = emptyBoard();
    b[idx(4, 4)] = CELL.STONE;
    expect(canPlace(b, getPiece('SQ2_0'), 3, 3)).toBe(false);
    expect(canPlace(b, getPiece('SQ2_0'), 5, 5)).toBe(true);
  });

  test('rejects out-of-bounds placement', () => {
    const b = emptyBoard();
    const bar5 = getPiece('BAR5_0'); // 5 wide horizontal
    expect(canPlace(b, bar5, 4, 0)).toBe(false); // cols 4..8 — col 8 out
    expect(canPlace(b, bar5, 3, 0)).toBe(true);
    expect(canPlace(b, bar5, -1, 0)).toBe(false);
    expect(canPlace(b, bar5, 0, 8)).toBe(false);
  });
});

describe('line detection and clearing', () => {
  test('detects a full row and a full column', () => {
    const b = emptyBoard();
    for (let c = 0; c < BOARD_SIZE; c++) b[idx(c, 2)] = 1;
    for (let r = 0; r < BOARD_SIZE; r++) b[idx(5, r)] = 1;
    const lines = findCompletedLines(b);
    expect(lines.rows).toEqual([2]);
    expect(lines.cols).toEqual([5]);
  });

  test('row + column sharing a cell counts as 2 lines, intersection consumed once', () => {
    const b = emptyBoard();
    for (let c = 0; c < BOARD_SIZE; c++) b[idx(c, 2)] = 1;
    for (let r = 0; r < BOARD_SIZE; r++) b[idx(5, r)] = 1;
    const lines = findCompletedLines(b);
    expect(lines.rows.length + lines.cols.length).toBe(2);
    const result = applyClears(b, lines);
    expect(result.clearedCells.length).toBe(15); // 8 + 8 - 1 shared
    for (let c = 0; c < BOARD_SIZE; c++) expect(b[idx(c, 2)]).toBe(CELL.EMPTY);
    for (let r = 0; r < BOARD_SIZE; r++) expect(b[idx(5, r)]).toBe(CELL.EMPTY);
  });

  test('multiple lines clear simultaneously', () => {
    const b = emptyBoard();
    for (let c = 0; c < BOARD_SIZE; c++) {
      b[idx(c, 0)] = 1;
      b[idx(c, 7)] = 2;
    }
    const lines = findCompletedLines(b);
    expect(lines.rows).toEqual([0, 7]);
    applyClears(b, lines);
    expect([...b].every((v) => v === CELL.EMPTY)).toBe(true);
  });

  test('wild cells count as filled for line checks', () => {
    const b = emptyBoard();
    for (let c = 0; c < 7; c++) b[idx(c, 3)] = 1;
    b[idx(7, 3)] = CELL.WILD;
    expect(findCompletedLines(b).rows).toEqual([3]);
  });

  test('stone counts as filled for line checks but survives a clear', () => {
    const b = emptyBoard();
    for (let c = 0; c < 7; c++) b[idx(c, 3)] = 1;
    b[idx(7, 3)] = CELL.STONE;
    const lines = findCompletedLines(b);
    expect(lines.rows).toEqual([3]);
    applyClears(b, lines);
    expect(b[idx(7, 3)]).toBe(CELL.STONE);
    expect(b[idx(0, 3)]).toBe(CELL.EMPTY);
  });

  test('ice cracks on first clear and empties on second', () => {
    const b = emptyBoard();
    for (let c = 0; c < 7; c++) b[idx(c, 3)] = 1;
    b[idx(7, 3)] = CELL.ICE;
    applyClears(b, findCompletedLines(b));
    expect(b[idx(7, 3)]).toBe(CELL.CRACKED);
    // refill the row and clear again
    for (let c = 0; c < 7; c++) b[idx(c, 3)] = 1;
    applyClears(b, findCompletedLines(b));
    expect(b[idx(7, 3)]).toBe(CELL.EMPTY);
  });

  test('reports cleared specials (gem, bomb) for scoring/effects', () => {
    const b = emptyBoard();
    for (let c = 0; c < 6; c++) b[idx(c, 0)] = 1;
    b[idx(6, 0)] = CELL.GEM;
    b[idx(7, 0)] = CELL.BOMB;
    const result = applyClears(b, findCompletedLines(b));
    expect(result.gems).toEqual([idx(6, 0)]);
    expect(result.bombs).toEqual([idx(7, 0)]);
  });
});

describe('fit checks', () => {
  test('anyFit true on empty board, false when nothing fits', () => {
    const b = emptyBoard();
    expect(anyFit(b, getPiece('SQ3_0'))).toBe(true);
    // checkerboard leaves no 2x2 hole
    for (let r = 0; r < 8; r++)
      for (let c = 0; c < 8; c++) if ((r + c) % 2 === 0) b[idx(c, r)] = 1;
    expect(anyFit(b, getPiece('SQ2_0'))).toBe(false);
    expect(anyFit(b, getPiece('DOT_0'))).toBe(true);
  });

  test('validPlacements counts all anchor positions', () => {
    const b = emptyBoard();
    expect(validPlacements(b, getPiece('DOT_0')).length).toBe(64);
    expect(validPlacements(b, getPiece('SQ3_0')).length).toBe(36);
  });
});
