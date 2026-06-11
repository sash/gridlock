import type { Rng } from './rng';
import { PIECES, getPiece, type Piece } from './pieces';
import {
  BOARD_SIZE,
  applyClears,
  canPlace,
  filledCount,
  findCompletedLines,
  idx,
  isFilled,
  place,
  type Board,
} from './board';

const FULLNESS_GUARANTEE_THRESHOLD = 0.4;
const MAX_REROLLS = 5;
const PITY_DEALS = 4;

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

function rollSet(rng: Rng): string[] {
  const weights = PIECES.map((p) => p.weight);
  return Array.from({ length: 3 }, () => rng.weightedPick(PIECES, weights).id);
}

/**
 * Deal 3 pieces per spec §2: weighted bag; if the board is <40% full the set
 * is guaranteed fully placeable (≤5 rerolls); above that, legitimately
 * unplaceable deals go through. After 4 clear-less deals, bias toward a piece
 * that can complete an almost-full line.
 */
export function dealTray(board: Board, rng: Rng, dealsSinceClear: number): string[] {
  const guarantee = filledCount(board) / board.length < FULLNESS_GUARANTEE_THRESHOLD;
  let set = rollSet(rng);
  if (guarantee) {
    for (let i = 0; i < MAX_REROLLS && !isSetPlaceable(board, set); i++) {
      set = rollSet(rng);
    }
  }

  if (dealsSinceClear >= PITY_DEALS && !set.some((id) => canCompleteAlmostFullLine(board, getPiece(id)))) {
    const completers = PIECES.filter((p) => canCompleteAlmostFullLine(board, p));
    if (completers.length > 0) {
      const replacement = completers[rng.int(completers.length)].id;
      const slot = rng.int(3);
      const candidate = [...set];
      candidate[slot] = replacement;
      // keep the early-game guarantee intact
      if (!guarantee || isSetPlaceable(board, candidate)) set = candidate;
    }
  }
  return set;
}
