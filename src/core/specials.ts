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
  /** Rush only: cells whose clear banks bonus seconds. */
  times: Record<number, number>;
  /** Wild zone centers: plus-shaped auras that help complete lines. */
  wilds: number[];
}

export function createSpecialsState(): SpecialsState {
  return { bombs: {}, stones: {}, times: {}, wilds: [] };
}

/** Plus-shaped aura of one or more wild centers, clipped at board edges. */
export function wildAura(centers: readonly number[]): Set<number> {
  const aura = new Set<number>();
  for (const center of centers) {
    const c = center % BOARD_SIZE;
    const r = Math.floor(center / BOARD_SIZE);
    aura.add(center);
    if (c > 0) aura.add(center - 1);
    if (c < BOARD_SIZE - 1) aura.add(center + 1);
    if (r > 0) aura.add(center - BOARD_SIZE);
    if (r < BOARD_SIZE - 1) aura.add(center + BOARD_SIZE);
  }
  return aura;
}

/** Cells never built on this game are 3× likelier special spawn spots. */
const VIRGIN_WEIGHT = 3;

function randomCellWhere(
  board: Board,
  rng: Rng,
  pred: (v: number) => boolean,
  touched?: Uint8Array | null,
): number {
  const candidates: number[] = [];
  const weights: number[] = [];
  for (let i = 0; i < board.length; i++) {
    if (!pred(board[i])) continue;
    candidates.push(i);
    weights.push(touched && !touched[i] ? VIRGIN_WEIGHT : 1);
  }
  if (candidates.length === 0) return -1;
  return rng.weightedPick(candidates, weights);
}

/** Spawn gem / ice / bomb at the start of a deal, per spec §5 spawn rules. */
export function spawnOnDeal(
  board: Board,
  aux: SpecialsState,
  rng: Rng,
  dealNumber: number,
  score: number,
  touched?: Uint8Array | null,
): void {
  if (dealNumber > 0 && dealNumber % GEM_EVERY_DEALS === 0) {
    const i = randomCellWhere(board, rng, (v) => v === CELL.EMPTY, touched);
    if (i >= 0) board[i] = CELL.GEM;
  }
  if (score >= ICE_MIN_SCORE && dealNumber > 0 && dealNumber % ICE_EVERY_DEALS === 0) {
    // freeze a plain filled cell (not a special)
    const i = randomCellWhere(board, rng, (v) => v >= 1 && v <= 8);
    if (i >= 0) board[i] = CELL.ICE;
  }
  if (dealNumber > 0 && dealNumber % BOMB_EVERY_DEALS === 0) {
    const i = randomCellWhere(board, rng, (v) => v === CELL.EMPTY, touched);
    if (i >= 0) {
      board[i] = CELL.BOMB;
      aux.bombs[i] = BOMB_FUSE;
    }
  }
}

/** After every placement: bomb fuses burn down (0 → stone), stones crumble. */
export function tickPlacement(board: Board, aux: SpecialsState): void {
  // snapshot first so a bomb petrifying this tick doesn't also lose a stone turn
  const stoneKeys = Object.keys(aux.stones);
  for (const key of Object.keys(aux.bombs)) {
    const i = Number(key);
    aux.bombs[i]--;
    if (aux.bombs[i] <= 0) {
      delete aux.bombs[i];
      board[i] = CELL.STONE;
      aux.stones[i] = STONE_LIFETIME;
    }
  }
  for (const key of stoneKeys) {
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

/**
 * Reward for a 3+ line clear: a wild zone. Its plus-shaped aura counts as
 * filled for line completion but never blocks placement; one clear through
 * the zone consumes it.
 */
export function grantWild(
  board: Board,
  rng: Rng,
  touched: Uint8Array | null | undefined,
  aux: SpecialsState,
): void {
  const i = randomCellWhere(board, rng, (v) => v === CELL.EMPTY, touched);
  if (i >= 0) aux.wilds.push(i);
}
