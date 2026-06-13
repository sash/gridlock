export const PERFECT_CLEAR_BONUS = 300;
export const GEM_BONUS = 150;
export const STREAK_MULTIPLIER_CAP = 5;

const LINE_POINTS = [0, 80, 200, 450];

export function linePoints(lines: number): number {
  if (lines < LINE_POINTS.length) return LINE_POINTS[lines];
  return 800 + 200 * (lines - 4);
}

export function streakMultiplier(streak: number): number {
  return Math.min(1 + 0.5 * streak, STREAK_MULTIPLIER_CAP);
}

/** Non-clearing placements a streak survives; it dies on the next one. */
export const STREAK_GRACE = 2;

export interface StreakState {
  streak: number;
  /** Consecutive non-clearing placements since the last clear. */
  misses: number;
}

export function updateStreak(state: StreakState, cleared: boolean): StreakState {
  if (cleared) return { streak: state.streak + 1, misses: 0 };
  if (state.streak === 0 || state.misses >= STREAK_GRACE) return { streak: 0, misses: 0 };
  return { streak: state.streak, misses: state.misses + 1 };
}
