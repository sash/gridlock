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

const PITY_DEALS = 2;
/** Above this fullness the pity rule applies even if lines were cleared recently. */
const PITY_FULLNESS = 0.6;
/** From this fullness on, small pieces are dealt more often and big ones less. */
const CROWDED_FULLNESS = 0.5;
const CROWDED_SMALL_BOOST = 1.6; // ≤3 cells
const CROWDED_BIG_DAMP = 0.6; // ≥5 cells

/**
 * Rerolls spent hunting for a fully placeable set. Generous on an open board,
 * a single retry on a crowded one — fewer cheap mid-game deaths while a truly
 * jammed board still ends the game.
 */
function rerollBudget(fullness: number): number {
  if (fullness < 0.4) return 5;
  if (fullness < 0.6) return 3;
  return 1;
}

function fullness(board: Board): number {
  return filledCount(board) / board.length;
}

/** Deal weights, shifted toward small pieces when the board is crowded. */
function dealWeights(fill: number): number[] {
  return PIECES.map((p) => {
    if (fill < CROWDED_FULLNESS) return p.weight;
    if (p.cells.length <= 3) return p.weight * CROWDED_SMALL_BOOST;
    if (p.cells.length >= 5) return p.weight * CROWDED_BIG_DAMP;
    return p.weight;
  });
}

/**
 * Can the 3 pieces be placed in some order (clears along the way free space)?
 * Brute force over orderings × positions — tiny search space per spec §9.
 */
export function isSetPlaceable(board: Board, pieceIds: readonly string[]): boolean {
  return placeableRec(board, pieceIds.map(getPiece));
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

function rollSet(rng: Rng, weights: number[]): string[] {
  return Array.from({ length: 3 }, () => rng.weightedPick(PIECES, weights).id);
}

/**
 * Deal 3 pieces per spec §2: weighted bag (small-leaning when crowded),
 * rerolled toward a fully placeable set with a budget that shrinks as the
 * board fills — legitimately unplaceable deals still go through. After 2
 * clear-less deals, or whenever the board is ≥60% full, bias toward a piece
 * that can complete an almost-full line.
 */
export function dealTray(board: Board, rng: Rng, dealsSinceClear: number): string[] {
  const fill = fullness(board);
  const weights = dealWeights(fill);
  let set = rollSet(rng, weights);
  let placeable = isSetPlaceable(board, set);
  for (let i = 0; i < rerollBudget(fill) && !placeable; i++) {
    set = rollSet(rng, weights);
    placeable = isSetPlaceable(board, set);
  }

  const pity = dealsSinceClear >= PITY_DEALS || fill >= PITY_FULLNESS;
  if (pity && !set.some((id) => canCompleteAlmostFullLine(board, getPiece(id)))) {
    const completers = PIECES.filter((p) => canCompleteAlmostFullLine(board, p));
    if (completers.length > 0) {
      const replacement = completers[rng.int(completers.length)].id;
      const slot = rng.int(3);
      const candidate = [...set];
      candidate[slot] = replacement;
      // never trade a placeable set for an unplaceable one
      if (!placeable || isSetPlaceable(board, candidate)) set = candidate;
    }
  }
  return set;
}

/**
 * Rush refill: one piece at a time, rerolled (≤5) until it fits somewhere on
 * the current board so the instant refill never hands over a dead piece.
 */
export function dealSingle(board: Board, rng: Rng): string {
  const weights = dealWeights(fullness(board));
  let piece = rng.weightedPick(PIECES, weights);
  for (let i = 0; i < 5 && !anyFit(board, piece); i++) piece = rng.weightedPick(PIECES, weights);
  return piece.id;
}
