import type { Piece } from './pieces';

export const BOARD_SIZE = 8;

/**
 * Cell encoding inside the Uint8Array(64) board:
 * 0 = empty, 1..8 = filled (value is the cosmetic color index),
 * 16+ = special states. Anything non-zero blocks placement and counts as
 * filled for line-completion checks.
 */
export const CELL = {
  EMPTY: 0,
  GEM: 16,
  ICE: 17,
  CRACKED: 18,
  BOMB: 19,
  STONE: 20,
  WILD: 21,
} as const;

export type Board = Uint8Array;

export function idx(col: number, row: number): number {
  return row * BOARD_SIZE + col;
}

export function isFilled(v: number): boolean {
  return v !== CELL.EMPTY;
}

export function canPlace(board: Board, piece: Piece, col: number, row: number): boolean {
  for (const [c, r] of piece.cells) {
    const cc = col + c;
    const rr = row + r;
    if (cc < 0 || cc >= BOARD_SIZE || rr < 0 || rr >= BOARD_SIZE) return false;
    if (isFilled(board[idx(cc, rr)])) return false;
  }
  return true;
}

export function place(board: Board, piece: Piece, col: number, row: number): void {
  for (const [c, r] of piece.cells) {
    board[idx(col + c, row + r)] = piece.color;
  }
}

export interface Lines {
  rows: number[];
  cols: number[];
}

/**
 * Cells in `aura` (wild zones) count as filled for completion even when empty —
 * they help finish lines without ever blocking placement.
 */
export function findCompletedLines(board: Board, aura?: ReadonlySet<number>): Lines {
  const counts = (i: number) => isFilled(board[i]) || (aura?.has(i) ?? false);
  const rows: number[] = [];
  const cols: number[] = [];
  for (let r = 0; r < BOARD_SIZE; r++) {
    let full = true;
    for (let c = 0; c < BOARD_SIZE; c++) {
      if (!counts(idx(c, r))) {
        full = false;
        break;
      }
    }
    if (full) rows.push(r);
  }
  for (let c = 0; c < BOARD_SIZE; c++) {
    let full = true;
    for (let r = 0; r < BOARD_SIZE; r++) {
      if (!counts(idx(c, r))) {
        full = false;
        break;
      }
    }
    if (full) cols.push(c);
  }
  return { rows, cols };
}

export interface ClearResult {
  /** Indices that became empty (each shared row/col cell appears once). */
  clearedCells: number[];
  /** Gem cells that were cleared (bonus points). */
  gems: number[];
  /** Bomb cells that were cleared in time (trigger 3×3 explosion). */
  bombs: number[];
  /** Ice cells that cracked on this clear (stay filled). */
  cracked: number[];
}

/** Empties every cell of the completed lines, honoring special-cell rules. */
export function applyClears(board: Board, lines: Lines): ClearResult {
  const targets = new Set<number>();
  for (const r of lines.rows) for (let c = 0; c < BOARD_SIZE; c++) targets.add(idx(c, r));
  for (const c of lines.cols) for (let r = 0; r < BOARD_SIZE; r++) targets.add(idx(c, r));

  const result: ClearResult = { clearedCells: [], gems: [], bombs: [], cracked: [] };
  for (const i of targets) {
    const v = board[i];
    switch (v) {
      case CELL.STONE:
        break; // survives clears
      case CELL.ICE:
        board[i] = CELL.CRACKED;
        result.cracked.push(i);
        break;
      case CELL.GEM:
        result.gems.push(i);
        board[i] = CELL.EMPTY;
        result.clearedCells.push(i);
        break;
      case CELL.BOMB:
        result.bombs.push(i);
        board[i] = CELL.EMPTY;
        result.clearedCells.push(i);
        break;
      default:
        board[i] = CELL.EMPTY;
        result.clearedCells.push(i);
    }
  }
  result.clearedCells.sort((a, b) => a - b);
  result.gems.sort((a, b) => a - b);
  result.bombs.sort((a, b) => a - b);
  return result;
}

export function validPlacements(board: Board, piece: Piece): Array<[number, number]> {
  const spots: Array<[number, number]> = [];
  for (let r = 0; r <= BOARD_SIZE - piece.h; r++) {
    for (let c = 0; c <= BOARD_SIZE - piece.w; c++) {
      if (canPlace(board, piece, c, r)) spots.push([c, r]);
    }
  }
  return spots;
}

export function anyFit(board: Board, piece: Piece): boolean {
  for (let r = 0; r <= BOARD_SIZE - piece.h; r++) {
    for (let c = 0; c <= BOARD_SIZE - piece.w; c++) {
      if (canPlace(board, piece, c, r)) return true;
    }
  }
  return false;
}

export function filledCount(board: Board): number {
  let n = 0;
  for (let i = 0; i < board.length; i++) if (isFilled(board[i])) n++;
  return n;
}
