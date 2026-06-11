/**
 * Piece catalog. 12 logical shapes expand into 27 dealt variants — the player
 * cannot rotate pieces, so each rotation is dealt as a distinct piece.
 * Weights are per logical shape (3×3 rare 0.4, 1×1 common 0.6, mid 1.0) and are
 * split evenly across that shape's variants so rotation count doesn't change
 * how often a logical shape appears.
 */
export type Cell = readonly [number, number]; // [col, row]

export interface Piece {
  readonly id: string;
  readonly shape: string;
  readonly cells: readonly Cell[];
  readonly w: number;
  readonly h: number;
  readonly weight: number;
  readonly color: number; // 1..8, cosmetic
}

function normalize(cells: Cell[]): Cell[] {
  const minC = Math.min(...cells.map(([c]) => c));
  const minR = Math.min(...cells.map(([, r]) => r));
  return cells
    .map(([c, r]) => [c - minC, r - minR] as const)
    .sort(([c1, r1], [c2, r2]) => c1 - c2 || r1 - r2);
}

function rotateCells(cells: readonly Cell[]): Cell[] {
  const h = Math.max(...cells.map(([, r]) => r)) + 1;
  return normalize(cells.map(([c, r]) => [h - 1 - r, c] as const));
}

function key(cells: readonly Cell[]): string {
  return [...cells]
    .map(([c, r]) => `${c},${r}`)
    .sort()
    .join(';');
}

interface ShapeDef {
  shape: string;
  weight: number;
  color: number;
  base: Cell[];
  rotations: number; // distinct rotations dealt (1, 2 or 4)
}

const SHAPE_DEFS: ShapeDef[] = [
  { shape: 'DOT', weight: 0.6, color: 1, base: [[0, 0]], rotations: 1 },
  { shape: 'BAR2', weight: 1.0, color: 2, base: [[0, 0], [1, 0]], rotations: 2 },
  { shape: 'BAR3', weight: 1.0, color: 2, base: [[0, 0], [1, 0], [2, 0]], rotations: 2 },
  { shape: 'BAR4', weight: 1.0, color: 3, base: [[0, 0], [1, 0], [2, 0], [3, 0]], rotations: 2 },
  { shape: 'BAR5', weight: 1.0, color: 3, base: [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0]], rotations: 2 },
  { shape: 'SQ2', weight: 1.0, color: 4, base: [[0, 0], [1, 0], [0, 1], [1, 1]], rotations: 1 },
  {
    shape: 'SQ3',
    weight: 0.4,
    color: 5,
    base: [[0, 0], [1, 0], [2, 0], [0, 1], [1, 1], [2, 1], [0, 2], [1, 2], [2, 2]],
    rotations: 1,
  },
  { shape: 'L3', weight: 1.0, color: 6, base: [[0, 0], [0, 1], [1, 1]], rotations: 4 },
  { shape: 'L4', weight: 1.0, color: 6, base: [[0, 0], [0, 1], [0, 2], [1, 2]], rotations: 4 },
  { shape: 'S', weight: 1.0, color: 7, base: [[1, 0], [2, 0], [0, 1], [1, 1]], rotations: 2 },
  { shape: 'Z', weight: 1.0, color: 7, base: [[0, 0], [1, 0], [1, 1], [2, 1]], rotations: 2 },
  { shape: 'T', weight: 1.0, color: 8, base: [[0, 0], [1, 0], [2, 0], [1, 1]], rotations: 4 },
];

function buildCatalog(): Piece[] {
  const pieces: Piece[] = [];
  for (const def of SHAPE_DEFS) {
    let cells = normalize(def.base);
    for (let rot = 0; rot < def.rotations; rot++) {
      pieces.push({
        id: `${def.shape}_${rot}`,
        shape: def.shape,
        cells,
        w: Math.max(...cells.map(([c]) => c)) + 1,
        h: Math.max(...cells.map(([, r]) => r)) + 1,
        weight: def.weight / def.rotations,
        color: def.color,
      });
      cells = rotateCells(cells);
    }
  }
  return pieces;
}

export const PIECES: readonly Piece[] = buildCatalog();

const BY_ID = new Map(PIECES.map((p) => [p.id, p]));
const BY_KEY = new Map(PIECES.map((p) => [key(p.cells), p]));

export function getPiece(id: string): Piece {
  const p = BY_ID.get(id);
  if (!p) throw new Error(`unknown piece: ${id}`);
  return p;
}

/** Id of the catalog variant equal to this piece rotated 90° clockwise. */
export function rotatePiece(id: string): string {
  const rotated = BY_KEY.get(key(rotateCells(getPiece(id).cells)));
  if (!rotated) throw new Error(`no rotation variant for ${id}`);
  return rotated.id;
}
