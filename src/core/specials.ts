import type { Rng } from './rng';
import { BOARD_SIZE, CELL, isFilled, type Board } from './board';

export const BOMB_FUSE = 9; // placements before a bomb petrifies
export const STONE_LIFETIME = 15; // placements before a stone crumbles
export const GEM_EVERY_DEALS = 3;
export const ICE_EVERY_DEALS = 5;
export const ICE_MIN_SCORE = 2000;
export const BOMB_EVERY_DEALS = 10;

/** Per-cell counters that don't fit in the board bytes. Keys are cell indices. */
export interface SpecialsState {
  bombs: Record<number, number>;
  stones: Record<number, number>;
}

export function createSpecialsState(): SpecialsState {
  return { bombs: {}, stones: {} };
}

function randomCellWhere(board: Board, rng: Rng, pred: (v: number) => boolean): number {
  const candidates: number[] = [];
  for (let i = 0; i < board.length; i++) if (pred(board[i])) candidates.push(i);
  if (candidates.length === 0) return -1;
  return candidates[rng.int(candidates.length)];
}

/** Spawn gem / ice / bomb at the start of a deal, per spec §5 spawn rules. */
export function spawnOnDeal(
  board: Board,
  aux: SpecialsState,
  rng: Rng,
  dealNumber: number,
  score: number,
): void {
  if (dealNumber > 0 && dealNumber % GEM_EVERY_DEALS === 0) {
    const i = randomCellWhere(board, rng, (v) => v === CELL.EMPTY);
    if (i >= 0) board[i] = CELL.GEM;
  }
  if (score >= ICE_MIN_SCORE && dealNumber > 0 && dealNumber % ICE_EVERY_DEALS === 0) {
    // freeze a plain filled cell (not a special)
    const i = randomCellWhere(board, rng, (v) => v >= 1 && v <= 8);
    if (i >= 0) board[i] = CELL.ICE;
  }
  if (dealNumber > 0 && dealNumber % BOMB_EVERY_DEALS === 0) {
    const i = randomCellWhere(board, rng, (v) => v === CELL.EMPTY);
    if (i >= 0) {
      board[i] = CELL.BOMB;
      aux.bombs[i] = BOMB_FUSE;
    }
  }
}

/** After every placement: bomb fuses burn down (0 → stone), stones crumble. */
export function tickPlacement(board: Board, aux: SpecialsState): void {
  for (const key of Object.keys(aux.bombs)) {
    const i = Number(key);
    aux.bombs[i]--;
    if (aux.bombs[i] <= 0) {
      delete aux.bombs[i];
      board[i] = CELL.STONE;
      aux.stones[i] = STONE_LIFETIME;
    }
  }
  for (const key of Object.keys(aux.stones)) {
    const i = Number(key);
    aux.stones[i]--;
    if (aux.stones[i] <= 0) {
      delete aux.stones[i];
      board[i] = CELL.EMPTY;
    }
  }
}

/** Bomb cleared in time: empty the 3×3 area around it. Stones survive. */
export function explodeBomb(board: Board, aux: SpecialsState, center: number): number[] {
  const cc = center % BOARD_SIZE;
  const cr = Math.floor(center / BOARD_SIZE);
  const cleared: number[] = [];
  for (let r = cr - 1; r <= cr + 1; r++) {
    for (let c = cc - 1; c <= cc + 1; c++) {
      if (c < 0 || c >= BOARD_SIZE || r < 0 || r >= BOARD_SIZE) continue;
      const i = r * BOARD_SIZE + c;
      if (board[i] === CELL.STONE) continue;
      if (isFilled(board[i])) cleared.push(i);
      delete aux.bombs[i];
      board[i] = CELL.EMPTY;
    }
  }
  return cleared;
}

/** Reward for a 3+ line clear: a wild cell that helps complete row and column. */
export function grantWild(board: Board, rng: Rng): void {
  const i = randomCellWhere(board, rng, (v) => v === CELL.EMPTY);
  if (i >= 0) board[i] = CELL.WILD;
}
