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

export interface StreakState {
  streak: number;
  /** True after one non-clearing placement — the streak survives exactly one. */
  grace: boolean;
}

export function updateStreak(state: StreakState, cleared: boolean): StreakState {
  if (cleared) return { streak: state.streak + 1, grace: false };
  if (state.grace || state.streak === 0) return { streak: 0, grace: false };
  return { streak: state.streak, grace: true };
}
