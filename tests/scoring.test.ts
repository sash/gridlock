import { describe, expect, test } from 'vitest';
import {
  linePoints,
  streakMultiplier,
  updateStreak,
  PERFECT_CLEAR_BONUS,
  GEM_BONUS,
} from '../src/core/scoring';

describe('line points table', () => {
  test('matches the spec table', () => {
    expect(linePoints(0)).toBe(0);
    expect(linePoints(1)).toBe(80);
    expect(linePoints(2)).toBe(200);
    expect(linePoints(3)).toBe(450);
    expect(linePoints(4)).toBe(800);
    expect(linePoints(5)).toBe(1000); // 800 + 200 per extra line
    expect(linePoints(6)).toBe(1200);
  });
});

describe('streak multiplier', () => {
  test('1 + 0.5 × streak, capped at ×5', () => {
    expect(streakMultiplier(0)).toBe(1);
    expect(streakMultiplier(1)).toBe(1.5);
    expect(streakMultiplier(4)).toBe(3);
    expect(streakMultiplier(8)).toBe(5);
    expect(streakMultiplier(20)).toBe(5); // capped
  });
});

describe('streak state machine (with one-placement grace)', () => {
  test('clear increments streak and resets grace', () => {
    expect(updateStreak({ streak: 0, grace: false }, true)).toEqual({ streak: 1, grace: false });
    expect(updateStreak({ streak: 3, grace: true }, true)).toEqual({ streak: 4, grace: false });
  });

  test('first non-clearing placement enters grace, streak survives', () => {
    expect(updateStreak({ streak: 3, grace: false }, false)).toEqual({ streak: 3, grace: true });
  });

  test('second consecutive non-clearing placement kills the streak', () => {
    expect(updateStreak({ streak: 3, grace: true }, false)).toEqual({ streak: 0, grace: false });
  });

  test('no streak and no clear stays at zero', () => {
    expect(updateStreak({ streak: 0, grace: false }, false)).toEqual({ streak: 0, grace: false });
  });
});

describe('bonuses', () => {
  test('constants match the spec', () => {
    expect(PERFECT_CLEAR_BONUS).toBe(300);
    expect(GEM_BONUS).toBe(150);
  });
});
