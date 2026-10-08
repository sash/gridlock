import type { Rng } from './rng';
import { BOARD_SIZE, CELL, isFilled, type Board } from './board';

export const BOMB_FUSE = 12; // placements before a bomb petrifies
/** Fuse value from which the board pulses a warning on the bomb. */
export const BOMB_WARN_AT = 3;
export const STONE_LIFETIME = 8; // placements before a stone crumbles
export const GEM_EVERY_DEALS = 3;
export const ICE_EVERY_DEALS = 5;
export const CROSS_EVERY_DEALS = 6;
export const PRISM_EVERY_DEALS = 8;
/** How far a wild zone's cross reaches from its centre. */
export const WILD_REACH = 2;

export type SpecialKind = 'gem' | 'wild' | 'cross' | 'bomb' | 'prism' | 'ice';
/** Specials arrive one at a time with the level ladder (a level is LINES_PER_LEVEL cleared lines). */
export const UNLOCK_LEVEL: Record<SpecialKind, number> = { gem: 2, wild: 3, cross: 4, bomb: 5, prism: 6, ice: 8 };
export const SPECIAL_ORDER: readonly SpecialKind[] = ['gem', 'wild', 'cross', 'bomb', 'prism', 'ice'];

/** Specials whose unlock level lies in (before, after]. */
export function unlockedBetween(levelBefore: number, levelAfter: number): SpecialKind[] {
  return SPECIAL_ORDER.filter((k) => UNLOCK_LEVEL[k] > levelBefore && UNLOCK_LEVEL[k] <= levelAfter);
}
/** Ice only forms in a row or column with at least this many filled cells. */
const ICE_MIN_LINE_FILL = BOARD_SIZE / 2;
export const BOMB_EVERY_DEALS = 10;

/** Per-cell counters that don't fit in the board bytes. Keys are cell indices. */
export interface SpecialsState {
  bombs: Record<number, number>;
  stones: Record<number, number>;
  /** Rush only: cells whose clear banks bonus seconds. */
  times: Record<number, number>;
  /** Wild zone centers: cross-shaped auras that help complete lines. */
  wilds: number[];
  /** Prism cells → the colour they took over (what their clear shatters). */
  prisms: Record<number, number>;
  /** Special cell → colour of the player's block it took over (drawn underneath it). */
  under: Record<number, number>;
}

export function createSpecialsState(): SpecialsState {
  return { bombs: {}, stones: {}, times: {}, wilds: [], prisms: {}, under: {} };
}

/** Cross-shaped aura (arms WILD_REACH long) of one or more wild centers, clipped at board edges. */
export function wildAura(centers: readonly number[]): Set<number> {
  const aura = new Set<number>();
  for (const center of centers) {
    const c = center % BOARD_SIZE;
    const r = Math.floor(center / BOARD_SIZE);
    aura.add(center);
    for (let d = 1; d <= WILD_REACH; d++) {
      if (c - d >= 0) aura.add(center - d);
      if (c + d < BOARD_SIZE) aura.add(center + d);
      if (r - d >= 0) aura.add(center - d * BOARD_SIZE);
      if (r + d < BOARD_SIZE) aura.add(center + d * BOARD_SIZE);
    }
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

/** A plain placed block — the only kind a special may take over. */
const plainBlock = (v: number) => v >= 1 && v <= 8;

/**
 * Spawn gem / ice / bomb at the start of a deal, per spec §5 spawn rules,
 * each only once the player's level has unlocked it. Specials take over
 * blocks the player has already placed rather than empty cells, so they
 * never eat free space; `touched` is unused here and kept for the wild
 * zones, which do spawn on (non-blocking) empty cells.
 */
export function spawnOnDeal(
  board: Board,
  aux: SpecialsState,
  rng: Rng,
  dealNumber: number,
  level: number,
  touched?: Uint8Array | null,
): void {
  void touched;
  const takeOver = (i: number, cell: number) => {
    aux.under[i] = board[i];
    board[i] = cell;
  };
  if (level >= UNLOCK_LEVEL.gem && dealNumber > 0 && dealNumber % GEM_EVERY_DEALS === 0) {
    const i = randomCellWhere(board, rng, plainBlock);
    if (i >= 0) takeOver(i, CELL.GEM);
  }
  if (level >= UNLOCK_LEVEL.ice && dealNumber > 0 && dealNumber % ICE_EVERY_DEALS === 0) {
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
        plainBlock(v) &&
        (rowFill[Math.floor(cell / BOARD_SIZE)] >= ICE_MIN_LINE_FILL ||
          colFill[cell % BOARD_SIZE] >= ICE_MIN_LINE_FILL),
    );
    if (i >= 0) takeOver(i, CELL.ICE);
  }
  if (level >= UNLOCK_LEVEL.cross && dealNumber > 0 && dealNumber % CROSS_EVERY_DEALS === 0) {
    const i = randomCellWhere(board, rng, plainBlock);
    if (i >= 0) takeOver(i, CELL.CROSS);
  }
  if (level >= UNLOCK_LEVEL.prism && dealNumber > 0 && dealNumber % PRISM_EVERY_DEALS === 0) {
    const i = randomCellWhere(board, rng, plainBlock);
    if (i >= 0) {
      aux.prisms[i] = board[i];
      takeOver(i, CELL.PRISM);
    }
  }
  if (level >= UNLOCK_LEVEL.bomb && dealNumber > 0 && dealNumber % BOMB_EVERY_DEALS === 0) {
    const i = randomCellWhere(board, rng, plainBlock);
    if (i >= 0) {
      takeOver(i, CELL.BOMB);
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
        delete aux.prisms[i];
        delete aux.under[i];
        board[i] = CELL.EMPTY;
      }
    }
  }
  return result;
}

/** Special cells that live on top of a player's block (stone is petrified, not a takeover). */
export const TAKEOVER_CELLS: ReadonlySet<number> = new Set([CELL.GEM, CELL.ICE, CELL.CRACKED, CELL.BOMB, CELL.CROSS, CELL.PRISM]);

/** Drop `under` entries whose cell is no longer a takeover special. */
export function pruneUnder(board: Board, aux: SpecialsState): void {
  for (const key of Object.keys(aux.under)) {
    if (!TAKEOVER_CELLS.has(board[Number(key)])) delete aux.under[Number(key)];
  }
}

/** Empties one cell of any kind, dropping whatever per-cell state it carried. */
function wipe(board: Board, aux: SpecialsState, i: number): boolean {
  const was = isFilled(board[i]);
  board[i] = CELL.EMPTY;
  delete aux.bombs[i];
  delete aux.stones[i];
  delete aux.prisms[i];
  delete aux.under[i];
  return was;
}

/**
 * Starburst cleared: its row and column both go, stone included. Lines the
 * clear already took are skipped; the rest count as extra cleared lines.
 */
export function starburst(
  board: Board,
  aux: SpecialsState,
  center: number,
  already: { rows: readonly number[]; cols: readonly number[] },
): { cells: number[]; extraLines: number; rows: number[]; cols: number[] } {
  const c = center % BOARD_SIZE;
  const r = Math.floor(center / BOARD_SIZE);
  const out = { cells: [] as number[], extraLines: 0, rows: [] as number[], cols: [] as number[] };
  if (!already.rows.includes(r)) {
    out.rows.push(r);
    out.extraLines++;
    for (let cc = 0; cc < BOARD_SIZE; cc++) if (wipe(board, aux, r * BOARD_SIZE + cc)) out.cells.push(r * BOARD_SIZE + cc);
  }
  if (!already.cols.includes(c)) {
    out.cols.push(c);
    out.extraLines++;
    for (let rr = 0; rr < BOARD_SIZE; rr++) if (wipe(board, aux, rr * BOARD_SIZE + c)) out.cells.push(rr * BOARD_SIZE + c);
  }
  return out;
}

/** Prism cleared: every plain block of the colour it took over shatters. */
export function prismShatter(board: Board, aux: SpecialsState, center: number): number[] {
  const color = aux.prisms[center];
  delete aux.prisms[center];
  const cells: number[] = [];
  if (!color) return cells;
  for (let i = 0; i < board.length; i++) {
    if (board[i] === color) {
      board[i] = CELL.EMPTY;
      cells.push(i);
    }
  }
  return cells;
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
