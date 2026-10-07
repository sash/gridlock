import type { Rng } from './rng';
import { PIECES, getPiece, type Piece } from './pieces';
import {
  BOARD_SIZE,
  anyFit,
  applyClears,
  canPlace,
  filledCount,
  findCompletedLines,
  idx,
  isFilled,
  place,
  type Board,
} from './board';

/** The dealer's anti-frustration knobs. Tuned with tests/sim.test.ts. */
export interface DealerTuning {
  /** Rerolls spent hunting for a fully placeable set, by board fullness band: <40%, <60%, above. */
  rerolls: readonly [number, number, number];
  /** Clear-less deals before the pity rule kicks in. */
  pityDeals: number;
  /** Above this fullness the pity rule applies even if lines were cleared recently. */
  pityFullness: number;
  /** From this fullness on, small pieces are dealt more often and big ones less. */
  crowdedFullness: number;
  smallBoost: number; // ≤3 cells
  bigDamp: number; // ≥5 cells
}

/**
 * Measured with the simulator (600 games each, greedy bot): rerolls are the
 * single biggest assist (none: 50 pieces/game → 5/3/1: 76) and saturate there;
 * pity after one deal and the stronger crowded weighting from 40% add +28%
 * on top (76 → 98). Pity on every deal would add another +20% but makes the
 * dealer feel rigged, so it stays at one clear-less deal.
 */
export const DEFAULT_TUNING: DealerTuning = {
  rerolls: [5, 3, 1],
  pityDeals: 1,
  pityFullness: 0.6,
  crowdedFullness: 0.4,
  smallBoost: 2.0,
  bigDamp: 0.5,
};

/**
 * Rerolls spent hunting for a fully placeable set. Generous on an open board,
 * fewer on a crowded one — fewer cheap mid-game deaths while a truly jammed
 * board still ends the game.
 */
function rerollBudget(fullness: number, t: DealerTuning): number {
  if (fullness < 0.4) return t.rerolls[0];
  if (fullness < 0.6) return t.rerolls[1];
  return t.rerolls[2];
}

function fullness(board: Board): number {
  return filledCount(board) / board.length;
}

/** Deal weights, shifted toward small pieces when the board is crowded. */
function dealWeights(fill: number, catalog: readonly Piece[], t: DealerTuning): number[] {
  return catalog.map((p) => {
    if (fill < t.crowdedFullness) return p.weight;
    if (p.cells.length <= 3) return p.weight * t.smallBoost;
    if (p.cells.length >= 5) return p.weight * t.bigDamp;
    return p.weight;
  });
}

/**
 * Can the 3 pieces be placed in some order (clears along the way free space)?
 * Brute force over orderings × positions — tiny search space per spec §9.
 */
export function isSetPlaceable(
  board: Board,
  pieceIds: readonly string[],
  catalog: readonly Piece[] = PIECES,
): boolean {
  return placeableRec(board, pieceIds.map((id) => lookup(catalog, id)));
}

/** Piece by id within a catalog (the default catalog's fast path is getPiece). */
function lookup(catalog: readonly Piece[], id: string): Piece {
  if (catalog === PIECES) return getPiece(id);
  const p = catalog.find((c) => c.id === id);
  if (!p) throw new Error(`unknown piece: ${id}`);
  return p;
}

function placeableRec(board: Board, pieces: Piece[]): boolean {
  if (pieces.length === 0) return true;
  for (let i = 0; i < pieces.length; i++) {
    const piece = pieces[i];
    const rest = pieces.filter((_, j) => j !== i);
    for (let r = 0; r <= BOARD_SIZE - piece.h; r++) {
      for (let c = 0; c <= BOARD_SIZE - piece.w; c++) {
        if (!canPlace(board, piece, c, r)) continue;
        const copy = new Uint8Array(board);
        place(copy, piece, c, r);
        applyClears(copy, findCompletedLines(copy));
        if (placeableRec(copy, rest)) return true;
      }
    }
  }
  return false;
}

/** Lines missing ≤2 cells, as lists of their missing cell indices. */
function almostFullLineGaps(board: Board): number[][] {
  const gaps: number[][] = [];
  for (let r = 0; r < BOARD_SIZE; r++) {
    const missing: number[] = [];
    for (let c = 0; c < BOARD_SIZE; c++) if (!isFilled(board[idx(c, r)])) missing.push(idx(c, r));
    if (missing.length >= 1 && missing.length <= 2) gaps.push(missing);
  }
  for (let c = 0; c < BOARD_SIZE; c++) {
    const missing: number[] = [];
    for (let r = 0; r < BOARD_SIZE; r++) if (!isFilled(board[idx(c, r)])) missing.push(idx(c, r));
    if (missing.length >= 1 && missing.length <= 2) gaps.push(missing);
  }
  return gaps;
}

/** True if some placement of the piece completes a line that is missing ≤2 cells. */
export function canCompleteAlmostFullLine(board: Board, piece: Piece): boolean {
  const gaps = almostFullLineGaps(board);
  if (gaps.length === 0) return false;
  for (let r = 0; r <= BOARD_SIZE - piece.h; r++) {
    for (let c = 0; c <= BOARD_SIZE - piece.w; c++) {
      if (!canPlace(board, piece, c, r)) continue;
      const covered = new Set(piece.cells.map(([pc, pr]) => idx(c + pc, r + pr)));
      if (gaps.some((gap) => gap.every((i) => covered.has(i)))) return true;
    }
  }
  return false;
}

function rollSet(rng: Rng, weights: number[], catalog: readonly Piece[]): string[] {
  return Array.from({ length: 3 }, () => rng.weightedPick(catalog, weights).id);
}

/**
 * Deal 3 pieces per spec §2: weighted bag (small-leaning when crowded),
 * rerolled toward a fully placeable set with a budget that shrinks as the
 * board fills — legitimately unplaceable deals still go through. After a
 * clear-less deal, or whenever the board is ≥60% full, bias toward a piece
 * that can complete an almost-full line.
 */
export function dealTray(
  board: Board,
  rng: Rng,
  dealsSinceClear: number,
  catalog: readonly Piece[] = PIECES,
  tuning: DealerTuning = DEFAULT_TUNING,
): string[] {
  const fill = fullness(board);
  const weights = dealWeights(fill, catalog, tuning);
  let set = rollSet(rng, weights, catalog);
  let placeable = isSetPlaceable(board, set, catalog);
  for (let i = 0; i < rerollBudget(fill, tuning) && !placeable; i++) {
    set = rollSet(rng, weights, catalog);
    placeable = isSetPlaceable(board, set, catalog);
  }

  const pity = dealsSinceClear >= tuning.pityDeals || fill >= tuning.pityFullness;
  if (pity && !set.some((id) => canCompleteAlmostFullLine(board, lookup(catalog, id)))) {
    const completers = catalog.filter((p) => canCompleteAlmostFullLine(board, p));
    if (completers.length > 0) {
      const replacement = completers[rng.int(completers.length)].id;
      const slot = rng.int(3);
      const candidate = [...set];
      candidate[slot] = replacement;
      // never trade a placeable set for an unplaceable one
      if (!placeable || isSetPlaceable(board, candidate, catalog)) set = candidate;
    }
  }
  return set;
}

/**
 * Rush refill: one piece at a time, rerolled (≤5) until it fits somewhere on
 * the current board so the instant refill never hands over a dead piece.
 */
export function dealSingle(board: Board, rng: Rng, catalog: readonly Piece[] = PIECES): string {
  const weights = dealWeights(fullness(board), catalog, DEFAULT_TUNING);
  let piece = rng.weightedPick(catalog, weights);
  for (let i = 0; i < 5 && !anyFit(board, piece); i++) piece = rng.weightedPick(catalog, weights);
  return piece.id;
}
