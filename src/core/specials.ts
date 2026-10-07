import type { Rng } from './rng';
import { BOARD_SIZE, CELL, isFilled, type Board } from './board';

export const BOMB_FUSE = 12; // placements before a bomb petrifies
/** Fuse value from which the board pulses a warning on the bomb. */
export const BOMB_WARN_AT = 3;
export const STONE_LIFETIME = 8; // placements before a stone crumbles
export const GEM_EVERY_DEALS = 3;
export const ICE_EVERY_DEALS = 5;
export const ICE_MIN_SCORE = 4000;
/** Ice only forms in a row or column with at least this many filled cells. */
const ICE_MIN_LINE_FILL = BOARD_SIZE / 2;
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
  pred: (v: number, i: number) => boolean,
  touched?: Uint8Array | null,
): number {
  const candidates: number[] = [];
  const weights: number[] = [];
  for (let i = 0; i < board.length; i++) {
    if (!pred(board[i], i)) continue;
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
    // freeze a plain filled cell (not a special) in a line that's already
    // half built, so the ice is a target worth chasing rather than a dead weight
    const rowFill = new Array<number>(BOARD_SIZE).fill(0);
    const colFill = new Array<number>(BOARD_SIZE).fill(0);
    for (let i = 0; i < board.length; i++) {
      if (!isFilled(board[i])) continue;
      rowFill[Math.floor(i / BOARD_SIZE)]++;
      colFill[i % BOARD_SIZE]++;
    }
    const i = randomCellWhere(
      board,
      rng,
      (v, cell) =>
        v >= 1 &&
        v <= 8 &&
        (rowFill[Math.floor(cell / BOARD_SIZE)] >= ICE_MIN_LINE_FILL ||
          colFill[cell % BOARD_SIZE] >= ICE_MIN_LINE_FILL),
    );
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

/**
 * A clear that touches a stone — passing through it or clearing a cell right
 * beside it — shatters the stone early. Returns the shattered cells.
 */
export function shatterStones(board: Board, aux: SpecialsState, clearedLineCells: ReadonlySet<number>): number[] {
  const shattered: number[] = [];
  for (const key of Object.keys(aux.stones)) {
    const i = Number(key);
    const c = i % BOARD_SIZE;
    const touching =
      clearedLineCells.has(i) ||
      (c > 0 && clearedLineCells.has(i - 1)) ||
      (c < BOARD_SIZE - 1 && clearedLineCells.has(i + 1)) ||
      clearedLineCells.has(i - BOARD_SIZE) ||
      clearedLineCells.has(i + BOARD_SIZE);
    if (!touching) continue;
    delete aux.stones[i];
    board[i] = CELL.EMPTY;
    shattered.push(i);
  }
  return shattered;
}

/** Blast reach in cells from the bomb — 2 makes a 5×5 square. */
export const BOMB_RADIUS = 2;

export interface BlastResult {
  /** Every cell the blast emptied (stones and ice included). */
  cleared: number[];
  /** Bomb centers that went off — the cleared bomb plus any it chained into. */
  centers: number[];
  /** Gems caught in the blast — they pay out like a line-cleared gem. */
  gems: number[];
}

/**
 * Bomb cleared in time: empty the 5×5 area around it. Nothing survives — not
 * even stone — and any bomb caught in the blast goes off too (chain reaction).
 */
export function explodeBomb(board: Board, aux: SpecialsState, center: number): BlastResult {
  const result: BlastResult = { cleared: [], centers: [], gems: [] };
  const queue = [center];
  const queued = new Set(queue);
  while (queue.length > 0) {
    const bomb = queue.shift()!;
    result.centers.push(bomb);
    delete aux.bombs[bomb];
    const cc = bomb % BOARD_SIZE;
    const cr = Math.floor(bomb / BOARD_SIZE);
    for (let r = cr - BOMB_RADIUS; r <= cr + BOMB_RADIUS; r++) {
      for (let c = cc - BOMB_RADIUS; c <= cc + BOMB_RADIUS; c++) {
        if (c < 0 || c >= BOARD_SIZE || r < 0 || r >= BOARD_SIZE) continue;
        const i = r * BOARD_SIZE + c;
        const v = board[i];
        if (v === CELL.BOMB && !queued.has(i)) {
          queue.push(i);
          queued.add(i);
        }
        if (v === CELL.GEM) result.gems.push(i);
        if (isFilled(v)) result.cleared.push(i);
        delete aux.stones[i];
        board[i] = CELL.EMPTY;
      }
    }
  }
  return result;
}

/**
 * Reward for a 2+ line clear: a wild zone. Its plus-shaped aura counts as
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
