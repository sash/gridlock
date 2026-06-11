import { describe, expect, test } from 'vitest';
import { Rng } from '../src/core/rng';
import { idx, type Board } from '../src/core/board';
import { getPiece } from '../src/core/pieces';
import { dealTray, isSetPlaceable, canCompleteAlmostFullLine } from '../src/core/generator';

function board(fill: (c: number, r: number) => boolean): Board {
  const b = new Uint8Array(64);
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) if (fill(c, r)) b[idx(c, r)] = 1;
  return b;
}

describe('isSetPlaceable', () => {
  test('any set fits on an empty board', () => {
    const b = board(() => false);
    expect(isSetPlaceable(b, ['SQ3_0', 'BAR5_0', 'T_0'])).toBe(true);
  });

  test('false when board is full except one cell and set needs more room', () => {
    const b = board((c, r) => !(c === 7 && r === 0));
    expect(isSetPlaceable(b, ['SQ2_0', 'SQ2_0', 'SQ2_0'])).toBe(false);
  });

  test('true when a clear along the way frees space (ordering matters)', () => {
    // Only (7,0) free. DOT completes row 0 + col 7 → 15 cells open → BAR2 fits.
    const b = board((c, r) => !(c === 7 && r === 0));
    expect(isSetPlaceable(b, ['BAR2_0', 'DOT_0', 'DOT_0'])).toBe(true);
  });
});

describe('dealTray', () => {
  test('returns 3 valid piece ids, deterministic for a given rng state', () => {
    const b = board(() => false);
    const t1 = dealTray(b, new Rng(123), 0);
    const t2 = dealTray(b, new Rng(123), 0);
    expect(t1).toEqual(t2);
    expect(t1.length).toBe(3);
    for (const id of t1) expect(() => getPiece(id)).not.toThrow();
  });

  test('board <40% full → dealt set is always fully placeable', () => {
    // 24 filled cells = 37.5%, awkward comb pattern
    const b = board((c, r) => r < 6 && c % 2 === 0 && r % 2 === 0 ? false : r < 3);
    for (let seed = 0; seed < 200; seed++) {
      const tray = dealTray(b, new Rng(seed), 0);
      expect(isSetPlaceable(b, tray), `seed ${seed}`).toBe(true);
    }
  });

  test('board ≥40% full → unplaceable deals are allowed (no rigged wins)', () => {
    // checkerboard: 50% full, only DOT fits anywhere
    const b = board((c, r) => (c + r) % 2 === 0);
    let sawUnplaceable = false;
    for (let seed = 0; seed < 60 && !sawUnplaceable; seed++) {
      const tray = dealTray(b, new Rng(seed), 0);
      if (!isSetPlaceable(b, tray)) sawUnplaceable = true;
    }
    expect(sawUnplaceable).toBe(true);
  });

  test('weights: 3×3 appears less often than a mid logical shape over many deals', () => {
    const b = board(() => false);
    const rng = new Rng(7);
    let sq3 = 0;
    let bar3 = 0;
    for (let i = 0; i < 3000; i++) {
      for (const id of dealTray(b, rng, 0)) {
        const shape = getPiece(id).shape;
        if (shape === 'SQ3') sq3++;
        if (shape === 'BAR3') bar3++;
      }
    }
    expect(sq3).toBeGreaterThan(0);
    expect(sq3).toBeLessThan(bar3 * 0.7);
  });

  test('pity rule: after 4 clear-less deals, set contains a piece completing an almost-full line', () => {
    // row 5 missing exactly 2 cells at (6,5) and (7,5) → BAR2_0 completes it
    const b = board((c, r) => r === 5 && c < 6);
    for (let seed = 0; seed < 100; seed++) {
      const tray = dealTray(b, new Rng(seed), 4);
      const hasCompleter = tray.some((id) => canCompleteAlmostFullLine(b, getPiece(id)));
      expect(hasCompleter, `seed ${seed}`).toBe(true);
    }
  });
});

describe('canCompleteAlmostFullLine', () => {
  test('detects a piece that fills the gap of a line missing ≤2 cells', () => {
    const b = board((c, r) => r === 5 && c < 6);
    expect(canCompleteAlmostFullLine(b, getPiece('BAR2_0'))).toBe(true);
    expect(canCompleteAlmostFullLine(b, getPiece('DOT_0'))).toBe(false); // fills 1 of 2 — no completion
  });

  test('no almost-full line → false for everything', () => {
    const b = board(() => false);
    expect(canCompleteAlmostFullLine(b, getPiece('BAR5_0'))).toBe(false);
  });
});
