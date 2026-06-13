import { describe, expect, test } from 'vitest';
import { Game } from '../src/core/game';
import { CELL, idx } from '../src/core/board';
import { getPiece } from '../src/core/pieces';

function fillRowExcept(game: Game, row: number, ...except: number[]) {
  for (let c = 0; c < 8; c++) {
    if (!except.includes(c)) game.state.board[idx(c, row)] = 1;
  }
}

describe('new game', () => {
  test('starts with 3 tray pieces, zero score, not over', () => {
    const g = new Game({ mode: 'classic', seed: 1 });
    expect(g.state.tray.filter(Boolean).length).toBe(3);
    expect(g.state.score).toBe(0);
    expect(g.state.over).toBe(false);
  });

  test('same seed produces the same first tray', () => {
    const a = new Game({ mode: 'classic', seed: 42 });
    const b = new Game({ mode: 'classic', seed: 42 });
    expect(a.state.tray).toEqual(b.state.tray);
  });
});

describe('placement', () => {
  test('scores 1 point per cell and consumes the tray slot', () => {
    const g = new Game({ mode: 'classic', seed: 1 });
    g.state.tray = ['SQ3_0', 'DOT_0', 'DOT_0'];
    const res = g.place(0, 0, 0);
    expect(res).not.toBeNull();
    expect(g.state.score).toBe(9);
    expect(g.state.tray[0]).toBeNull();
  });

  test('rejects invalid placement and leaves state untouched', () => {
    const g = new Game({ mode: 'classic', seed: 1 });
    g.state.tray = ['SQ3_0', 'DOT_0', 'DOT_0'];
    g.state.board[idx(0, 0)] = 1;
    expect(g.place(0, 0, 0)).toBeNull();
    expect(g.state.score).toBe(0);
    expect(g.state.tray[0]).toBe('SQ3_0');
  });

  test('clearing one line scores 80 × 1.5 (streak 1) plus cell points', () => {
    const g = new Game({ mode: 'classic', seed: 1 });
    g.state.tray = ['DOT_0', 'DOT_0', 'DOT_0'];
    fillRowExcept(g, 0, 7);
    g.state.board[idx(0, 7)] = 1; // avoid a perfect clear
    const res = g.place(0, 7, 0)!;
    expect(res.linesCleared).toBe(1);
    expect(res.lines.rows).toEqual([0]); // direction info for clear particles
    expect(g.state.streak).toBe(1);
    expect(g.state.score).toBe(1 + 120); // 1 cell + 80 × 1.5
    expect(g.state.board[idx(0, 0)]).toBe(CELL.EMPTY);
  });

  test('streak survives two non-clearing placements, dies on the third', () => {
    const g = new Game({ mode: 'classic', seed: 1 });
    g.state.tray = ['DOT_0', 'DOT_0', 'DOT_0'];
    g.state.streak = 2;
    g.place(0, 3, 3);
    expect(g.state.streak).toBe(2);
    g.place(1, 4, 4);
    expect(g.state.streak).toBe(2);
    g.place(2, 5, 5);
    expect(g.state.streak).toBe(0);
  });

  test('a new tray of 3 is dealt after all 3 are placed', () => {
    const g = new Game({ mode: 'classic', seed: 1 });
    g.state.tray = ['DOT_0', 'DOT_0', 'DOT_0'];
    const dealBefore = g.state.dealNumber;
    g.place(0, 0, 0);
    g.place(1, 2, 0);
    expect(g.state.tray.filter(Boolean).length).toBe(1);
    g.place(2, 4, 0);
    expect(g.state.tray.filter(Boolean).length).toBe(3);
    expect(g.state.dealNumber).toBe(dealBefore + 1);
  });

  test('game over when no remaining tray piece fits', () => {
    const g = new Game({ mode: 'classic', seed: 1 });
    // full board except a 2-wide diagonal band: every row/col keeps ≥1 empty
    // cell after the dot placement (no accidental clears), no 3×3 hole exists
    for (let i = 0; i < 64; i++) g.state.board[i] = 1;
    for (let k = 0; k < 8; k++) {
      g.state.board[idx(k, k)] = CELL.EMPTY;
      g.state.board[idx((k + 1) % 8, k)] = CELL.EMPTY;
    }
    g.state.tray = ['DOT_0', 'SQ3_0', null];
    const res = g.place(0, 0, 0)!;
    expect(res.linesCleared).toBe(0);
    expect(res.gameOver).toBe(true);
    expect(g.state.over).toBe(true);
  });

  test('perfect clear awards +300', () => {
    const g = new Game({ mode: 'classic', seed: 1 });
    g.state.tray = ['BAR2_0', 'DOT_0', 'DOT_0'];
    fillRowExcept(g, 0, 6, 7);
    const res = g.place(0, 6, 0)!;
    expect(res.perfectClear).toBe(true);
    // 2 cells + 80×1.5 + 300
    expect(g.state.score).toBe(2 + 120 + 300);
  });

  test('cleared gem pays +150 flat', () => {
    const g = new Game({ mode: 'classic', seed: 1 });
    g.state.tray = ['DOT_0', 'DOT_0', 'DOT_0'];
    fillRowExcept(g, 0, 7);
    g.state.board[idx(3, 0)] = CELL.GEM;
    g.state.board[idx(0, 7)] = 1; // avoid a perfect clear
    g.place(0, 7, 0);
    expect(g.state.score).toBe(1 + 120 + 150);
  });

  test('cleared bomb explodes a 3×3 area', () => {
    const g = new Game({ mode: 'classic', seed: 1 });
    g.state.tray = ['DOT_0', 'DOT_0', 'DOT_0'];
    fillRowExcept(g, 0, 7);
    g.state.board[idx(3, 0)] = CELL.BOMB;
    g.state.aux.bombs[idx(3, 0)] = 5;
    g.state.board[idx(3, 1)] = 1; // in blast radius
    g.place(0, 7, 0);
    expect(g.state.board[idx(3, 1)]).toBe(CELL.EMPTY);
    expect(g.state.aux.bombs[idx(3, 0)]).toBeUndefined();
  });

  test('3+ line clear grants a wild cell', () => {
    const g = new Game({ mode: 'classic', seed: 1 });
    g.state.tray = ['SQ3_0', 'DOT_0', 'DOT_0'];
    for (const r of [0, 1, 2]) fillRowExcept(g, r, 0, 1, 2);
    const res = g.place(0, 0, 0)!;
    expect(res.linesCleared).toBe(3);
    expect([...g.state.board].filter((v) => v === CELL.WILD).length).toBe(1);
  });
});

describe('ghost preview helpers', () => {
  test('wouldClear reports the lines a drop would complete', () => {
    const g = new Game({ mode: 'classic', seed: 1 });
    g.state.tray = ['DOT_0', 'DOT_0', 'DOT_0'];
    fillRowExcept(g, 2, 5);
    const lines = g.wouldClear(0, 5, 2)!;
    expect(lines.rows).toEqual([2]);
    expect(g.wouldClear(0, 5, 3)!.rows).toEqual([]);
  });

  test('totalValidMoves counts placements for remaining pieces', () => {
    const g = new Game({ mode: 'classic', seed: 1 });
    g.state.tray = ['DOT_0', null, null];
    for (let i = 0; i < 64; i++) g.state.board[i] = 1;
    g.state.board[idx(4, 4)] = CELL.EMPTY;
    g.state.board[idx(5, 5)] = CELL.EMPTY;
    expect(g.totalValidMoves()).toBe(2);
  });
});

describe('power-ups', () => {
  test('rotate turns a tray piece into its 90° variant, once per game', () => {
    const g = new Game({ mode: 'classic', seed: 1 });
    g.state.tray = ['BAR3_0', 'DOT_0', 'DOT_0'];
    expect(g.useRotate(0)).toBe(true);
    expect(getPiece(g.state.tray[0]!).w).toBe(1);
    expect(getPiece(g.state.tray[0]!).h).toBe(3);
    expect(g.useRotate(0)).toBe(false);
  });

  test('swap replaces the whole tray, once per game', () => {
    const g = new Game({ mode: 'classic', seed: 1 });
    g.state.tray = ['DOT_0', null, 'DOT_0'];
    expect(g.useSwap()).toBe(true);
    expect(g.state.tray.filter(Boolean).length).toBe(3);
    expect(g.useSwap()).toBe(false);
  });

  test('hammer deletes one filled cell, once per game', () => {
    const g = new Game({ mode: 'classic', seed: 1 });
    g.state.board[idx(2, 2)] = 1;
    expect(g.useHammer(2, 2)).toBe(true);
    expect(g.state.board[idx(2, 2)]).toBe(CELL.EMPTY);
    expect(g.useHammer(2, 2)).toBe(false); // already used (and empty anyway)
  });

  test('hammer on an empty cell does not consume the use', () => {
    const g = new Game({ mode: 'classic', seed: 1 });
    expect(g.useHammer(3, 3)).toBe(false);
    g.state.board[idx(2, 2)] = 1;
    expect(g.useHammer(2, 2)).toBe(true);
  });

  test('undo reverts the last placement but is disabled after a clear', () => {
    const g = new Game({ mode: 'classic', seed: 1 });
    g.state.tray = ['DOT_0', 'DOT_0', 'DOT_0'];
    g.place(0, 3, 3);
    expect(g.useUndo()).toBe(true);
    expect(g.state.board[idx(3, 3)]).toBe(CELL.EMPTY);
    expect(g.state.tray[0]).toBe('DOT_0');
    expect(g.state.score).toBe(0);
  });

  test('undo blocked after a clearing placement', () => {
    const g = new Game({ mode: 'classic', seed: 1 });
    g.state.tray = ['DOT_0', 'DOT_0', 'DOT_0'];
    fillRowExcept(g, 0, 7);
    g.place(0, 7, 0);
    expect(g.useUndo()).toBe(false);
  });

  test('undo only once per game', () => {
    const g = new Game({ mode: 'classic', seed: 1 });
    g.state.tray = ['DOT_0', 'DOT_0', 'DOT_0'];
    g.place(0, 3, 3);
    expect(g.useUndo()).toBe(true);
    g.place(0, 3, 3);
    expect(g.useUndo()).toBe(false);
  });
});

describe('modes', () => {
  test('zen: stuck board dissolves the fullest rows instead of game over', () => {
    const g = new Game({ mode: 'zen', seed: 1 });
    for (let i = 0; i < 64; i++) g.state.board[i] = 1;
    for (let k = 0; k < 8; k++) {
      g.state.board[idx(k, k)] = CELL.EMPTY;
      g.state.board[idx((k + 1) % 8, k)] = CELL.EMPTY;
    }
    g.state.tray = ['DOT_0', 'SQ3_0', null];
    const res = g.place(0, 0, 0)!;
    expect(res.gameOver).toBe(false);
    expect(g.state.over).toBe(false);
    // dissolves happened (2 rows per pass until something fits again)
    let emptyCount = 0;
    for (let i = 0; i < 64; i++) if (g.state.board[i] === CELL.EMPTY) emptyCount++;
    expect(emptyCount).toBeGreaterThanOrEqual(16);
    // the stuck piece must now fit
    expect(g.totalValidMoves()).toBeGreaterThan(0);
  });

  test('rush: tray slot refills immediately after each placement', () => {
    const g = new Game({ mode: 'rush', seed: 1 });
    g.place(0, 0, 0);
    expect(g.state.tray.filter(Boolean).length).toBe(3);
  });

  test('rush: time runs out → game over', () => {
    const g = new Game({ mode: 'rush', seed: 1 });
    expect(g.state.rushTimeLeft).toBe(90);
    g.tickTime(89.5);
    expect(g.state.over).toBe(false);
    g.tickTime(1);
    expect(g.state.over).toBe(true);
  });

  test('daily: prefilled cells from seed, deterministic', () => {
    const a = new Game({ mode: 'daily', seed: 20260611 });
    const b = new Game({ mode: 'daily', seed: 20260611 });
    expect([...a.state.board]).toEqual([...b.state.board]);
    expect([...a.state.board].some((v) => v !== 0)).toBe(true);
  });
});

describe('serialization', () => {
  test('round-trips mid-game state and continues identically', () => {
    const g = new Game({ mode: 'classic', seed: 9 });
    const slot = g.state.tray.findIndex(Boolean);
    g.place(slot, 0, 0);
    const restored = Game.deserialize(g.serialize());
    expect(restored.state).toEqual(g.state);
    // both must deal identical future trays
    g.state.tray = ['DOT_0', 'DOT_0', 'DOT_0'];
    restored.state.tray = ['DOT_0', 'DOT_0', 'DOT_0'];
    g.place(0, 0, 5);
    g.place(1, 2, 5);
    g.place(2, 4, 5);
    restored.place(0, 0, 5);
    restored.place(1, 2, 5);
    restored.place(2, 4, 5);
    expect(restored.state.tray).toEqual(g.state.tray);
  });
});
