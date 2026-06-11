import { describe, expect, test } from 'vitest';
import { PIECES, getPiece, rotatePiece } from '../src/core/pieces';

function cellKey(cells: ReadonlyArray<readonly [number, number]>): string {
  return [...cells]
    .map(([c, r]) => `${c},${r}`)
    .sort()
    .join(';');
}

describe('piece catalog', () => {
  test('every variant has normalized cells (touching col 0 and row 0, non-negative)', () => {
    for (const p of PIECES) {
      const cols = p.cells.map(([c]) => c);
      const rows = p.cells.map(([, r]) => r);
      expect(Math.min(...cols)).toBe(0);
      expect(Math.min(...rows)).toBe(0);
      expect(p.w).toBe(Math.max(...cols) + 1);
      expect(p.h).toBe(Math.max(...rows) + 1);
    }
  });

  test('no duplicate variants', () => {
    const keys = PIECES.map((p) => cellKey(p.cells));
    expect(new Set(keys).size).toBe(PIECES.length);
  });

  test('contains all bars including vertical variants', () => {
    for (const n of [2, 3, 4, 5]) {
      const h = PIECES.find((p) => p.w === n && p.h === 1 && p.cells.length === n);
      const v = PIECES.find((p) => p.w === 1 && p.h === n && p.cells.length === n);
      expect(h, `1x${n} horizontal`).toBeDefined();
      expect(v, `1x${n} vertical`).toBeDefined();
    }
  });

  test('contains dot, 2x2 and 3x3 squares', () => {
    expect(PIECES.find((p) => p.cells.length === 1)).toBeDefined();
    expect(PIECES.find((p) => p.w === 2 && p.h === 2 && p.cells.length === 4)).toBeDefined();
    expect(PIECES.find((p) => p.w === 3 && p.h === 3 && p.cells.length === 9)).toBeDefined();
  });

  test('L-tromino and L-tetromino have 4 rotations each', () => {
    expect(PIECES.filter((p) => p.shape === 'L3').length).toBe(4);
    expect(PIECES.filter((p) => p.shape === 'L4').length).toBe(4);
  });

  test('S and Z have 2 rotations, T has 4', () => {
    expect(PIECES.filter((p) => p.shape === 'S').length).toBe(2);
    expect(PIECES.filter((p) => p.shape === 'Z').length).toBe(2);
    expect(PIECES.filter((p) => p.shape === 'T').length).toBe(4);
  });

  test('every piece has a positive weight and a color index', () => {
    for (const p of PIECES) {
      expect(p.weight).toBeGreaterThan(0);
      expect(p.color).toBeGreaterThanOrEqual(1);
      expect(p.color).toBeLessThanOrEqual(8);
    }
  });

  test('3x3 is rarer and 1x1 more common than mid pieces (per logical shape)', () => {
    const weightOf = (shape: string) =>
      PIECES.filter((p) => p.shape === shape).reduce((s, p) => s + p.weight, 0);
    expect(weightOf('SQ3')).toBeCloseTo(0.4);
    expect(weightOf('DOT')).toBeCloseTo(0.6);
    expect(weightOf('BAR3')).toBeCloseTo(1.0);
    expect(weightOf('T')).toBeCloseTo(1.0);
  });

  test('getPiece returns the variant by id', () => {
    const p = PIECES[0];
    expect(getPiece(p.id)).toBe(p);
  });

  test('rotatePiece maps every variant to a valid catalog variant', () => {
    for (const p of PIECES) {
      const r = rotatePiece(p.id);
      const rotated = getPiece(r);
      // rotating cells 90° cw: (c, r) -> (h - 1 - r, c), then normalize
      const cells = p.cells.map(([c, row]) => [p.h - 1 - row, c] as const);
      expect(cellKey(rotated.cells)).toBe(cellKey(cells));
    }
  });

  test('rotating a bar 4 times returns to the original', () => {
    const bar = PIECES.find((p) => p.w === 4 && p.h === 1)!;
    let id = bar.id;
    for (let i = 0; i < 4; i++) id = rotatePiece(id);
    expect(id).toBe(bar.id);
  });
});
