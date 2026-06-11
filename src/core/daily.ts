import { BOARD_SIZE, CELL, idx } from './board';
import type { GameState } from './game';

/** Everyone gets the same seed for the same calendar day (local time). */
export function dailySeed(date: Date): number {
  return date.getFullYear() * 10000 + (date.getMonth() + 1) * 100 + date.getDate();
}

/** Stable key for the one-attempt-per-day lock. */
export function dailyKey(date: Date): string {
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${m}-${d}`;
}

const EMOJI: Record<number, string> = {
  [CELL.GEM]: '💎',
  [CELL.ICE]: '🧊',
  [CELL.CRACKED]: '🧊',
  [CELL.BOMB]: '💣',
  [CELL.STONE]: '🪨',
  [CELL.WILD]: '🌈',
};

/** Wordle-style shareable result: header + score + final board as emoji. */
export function shareCard(state: GameState, date: Date): string {
  const lines = [`GridLock Daily ${dailyKey(date)}`, `Score: ${state.score}`];
  for (let r = 0; r < BOARD_SIZE; r++) {
    let row = '';
    for (let c = 0; c < BOARD_SIZE; c++) {
      const v = state.board[idx(c, r)];
      row += EMOJI[v] ?? (v === CELL.EMPTY ? '⬛' : '🟦');
    }
    lines.push(row);
  }
  return lines.join('\n');
}
