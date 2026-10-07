/**
 * Balance simulator — not a correctness test. A greedy bot plays Classic (no
 * specials) against candidate piece catalogs and reports how long games last.
 *
 *   SIM=1 npx vitest run tests/sim.test.ts
 *   SIM=1 SIM_GAMES=2000 SIM_ONLY=dealer SIM_OUT=/tmp/sim.txt npx vitest run tests/sim.test.ts
 */
import { describe, expect, test } from 'vitest';
import { Rng } from '../src/core/rng';
import {
  BOARD_SIZE,
  applyClears,
  canPlace,
  findCompletedLines,
  idx,
  isFilled,
  place,
  type Board,
} from '../src/core/board';
import { SHAPE_DEFS, buildCatalog, type Piece, type ShapeDef } from '../src/core/pieces';
import { DEFAULT_TUNING, dealTray, type DealerTuning } from '../src/core/generator';

const GAMES = Number(import.meta.env.SIM_GAMES ?? 600);

// --- candidate catalogs ---------------------------------------------------

const DIAG3: ShapeDef = { shape: 'DIAG3', weight: 0.5, color: 4, base: [[0, 0], [1, 1], [2, 2]], rotations: 2 };

function withWeights(defs: readonly ShapeDef[], w: Record<string, number>): ShapeDef[] {
  return defs.map((d) => (d.shape in w ? { ...d, weight: w[d.shape] } : d));
}
function without(defs: readonly ShapeDef[], ...shapes: string[]): ShapeDef[] {
  return defs.filter((d) => !shapes.includes(d.shape));
}

/**
 * The shipped set is 'current'; the others undo one tuning decision each so a
 * rerun shows what every decision is worth. Measured 2026-10-07, 1000 games:
 *   current 76.9 pieces/game · without J 66–74 · flat weights 74 · with DIAG3 72
 */
const CANDIDATES: Record<string, ShapeDef[]> = {
  current: [...SHAPE_DEFS],
  'without J': without(SHAPE_DEFS, 'J'),
  'without DIAG2': without(SHAPE_DEFS, 'DIAG2'),
  'with DIAG3 back': [...SHAPE_DEFS, DIAG3],
  'flat mid weights (BAR3/L3/S/Z/T 1.0)': withWeights(SHAPE_DEFS, { BAR3: 1.0, L3: 1.0, S: 1.0, Z: 1.0, T: 1.0 }),
};

// --- greedy bot ------------------------------------------------------------

/** Empty cells with at most one empty orthogonal neighbour — the holes that kill games. */
function deadPockets(board: Board): number {
  let n = 0;
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      if (isFilled(board[idx(c, r)])) continue;
      let open = 0;
      if (c > 0 && !isFilled(board[idx(c - 1, r)])) open++;
      if (c < BOARD_SIZE - 1 && !isFilled(board[idx(c + 1, r)])) open++;
      if (r > 0 && !isFilled(board[idx(c, r - 1)])) open++;
      if (r < BOARD_SIZE - 1 && !isFilled(board[idx(c, r + 1)])) open++;
      if (open <= 1) n++;
    }
  }
  return n;
}

function filled(board: Board): number {
  let n = 0;
  for (let i = 0; i < board.length; i++) if (isFilled(board[i])) n++;
  return n;
}

interface Move {
  slot: number;
  col: number;
  row: number;
  score: number;
}

function bestMove(board: Board, tray: (Piece | null)[]): Move | null {
  let best: Move | null = null;
  tray.forEach((piece, slot) => {
    if (!piece) return;
    for (let r = 0; r <= BOARD_SIZE - piece.h; r++) {
      for (let c = 0; c <= BOARD_SIZE - piece.w; c++) {
        if (!canPlace(board, piece, c, r)) continue;
        const copy = new Uint8Array(board);
        place(copy, piece, c, r);
        const lines = findCompletedLines(copy);
        applyClears(copy, lines);
        const cleared = lines.rows.length + lines.cols.length;
        const score = cleared * 60 - filled(copy) - deadPockets(copy) * 4;
        if (!best || score > best.score) best = { slot, col: c, row: r, score };
      }
    }
  });
  return best;
}

/** One Classic game with the real dealer, no specials. Returns pieces placed and lines cleared. */
function playGame(
  catalog: readonly Piece[],
  seed: number,
  tuning: DealerTuning = DEFAULT_TUNING,
): { placed: number; lines: number } {
  const byId = new Map(catalog.map((p) => [p.id, p]));
  const rng = new Rng(seed);
  const board: Board = new Uint8Array(BOARD_SIZE * BOARD_SIZE);
  let dealsSinceClear = 0;
  let clearedThisDeal = false;
  let tray = dealTray(board, rng, 0, catalog, tuning).map((id) => byId.get(id)!) as (Piece | null)[];
  let placed = 0;
  let lines = 0;
  for (;;) {
    const move = bestMove(board, tray);
    if (!move) return { placed, lines };
    const piece = tray[move.slot]!;
    place(board, piece, move.col, move.row);
    const done = findCompletedLines(board);
    applyClears(board, done);
    const n = done.rows.length + done.cols.length;
    lines += n;
    if (n > 0) clearedThisDeal = true;
    placed++;
    tray[move.slot] = null;
    if (tray.every((t) => t === null)) {
      dealsSinceClear = clearedThisDeal ? 0 : dealsSinceClear + 1;
      clearedThisDeal = false;
      tray = dealTray(board, rng, dealsSinceClear, catalog, tuning).map((id) => byId.get(id)!);
    }
    if (placed > 5000) return { placed, lines }; // the bot found a perpetual loop — cap it
  }
}

function summarize(values: number[]): { mean: number; median: number; p10: number } {
  const sorted = [...values].sort((a, b) => a - b);
  const q = (p: number) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
  return { mean: values.reduce((a, b) => a + b, 0) / values.length, median: q(0.5), p10: q(0.1) };
}

function measure(name: string, catalog: readonly Piece[], tuning: DealerTuning): string {
  const placed: number[] = [];
  const lines: number[] = [];
  const t0 = Date.now();
  for (let g = 0; g < GAMES; g++) {
    const r = playGame(catalog, 1000 + g, tuning);
    placed.push(r.placed);
    lines.push(r.lines);
  }
  const p = summarize(placed);
  const l = summarize(lines);
  return `${name.padEnd(44)} pieces/game mean ${p.mean.toFixed(1).padStart(6)}  median ${String(p.median).padStart(4)}  p10 ${String(p.p10).padStart(4)}   lines mean ${l.mean.toFixed(1).padStart(6)}   (${((Date.now() - t0) / 1000).toFixed(0)}s)`;
}

async function emit(title: string, rows: string[]): Promise<void> {
  const report = `${GAMES} games each, greedy bot, Classic rules without specials — ${title}\n` + rows.join('\n') + '\n';
  console.log(report);
  // the runner may swallow console output — also append the report to SIM_OUT when set
  const out = import.meta.env.SIM_OUT as string | undefined;
  if (out) {
    const fs = (await import(/* @vite-ignore */ 'node:' + 'fs')) as { appendFileSync(p: string, d: string): void };
    fs.appendFileSync(out, report + '\n');
  }
}

const t = (patch: Partial<DealerTuning>): DealerTuning => ({ ...DEFAULT_TUNING, ...patch });

/**
 * Dealer knobs: the shipped tuning plus one-change variants around it.
 * Measured 2026-10-07, 600 games: no rerolls 50 · previous (5/3/1, pity 2, crowded 50% ×1.6/0.6) 76 ·
 * shipped (pity 1, crowded 40% ×2.0/0.5) 98 · pity every deal + same 119 (rejected: rigged-feeling).
 */
const TUNINGS: Record<string, DealerTuning> = {
  current: DEFAULT_TUNING,
  'previous (pity 2, crowded 50% ×1.6/0.6)': t({ pityDeals: 2, crowdedFullness: 0.5, smallBoost: 1.6, bigDamp: 0.6 }),
  'no rerolls (control)': t({ rerolls: [0, 0, 0] }),
  'rerolls 5/5/3': t({ rerolls: [5, 5, 3] }),
  'rerolls 8/5/2': t({ rerolls: [8, 5, 2] }),
  'rerolls 8/8/5': t({ rerolls: [8, 8, 5] }),
  'no pity (control)': t({ pityDeals: 99, pityFullness: 2 }),
  'pity every deal': t({ pityDeals: 0 }),
  'pity from 50% full': t({ pityFullness: 0.5 }),
  'no crowded weighting (control)': t({ crowdedFullness: 2 }),
  'crowded from 40%': t({ crowdedFullness: 0.4 }),
  'crowded ×2.0 / ×0.5': t({ smallBoost: 2.0, bigDamp: 0.5 }),
  'crowded ×2.5 / ×0.4': t({ smallBoost: 2.5, bigDamp: 0.4 }),
  // combinations of the winners above
  'pity 1 deal + crowded 40%': t({ pityDeals: 1, crowdedFullness: 0.4 }),
  'pity 1 deal + crowded 40% ×2.0/0.5': t({ pityDeals: 1, crowdedFullness: 0.4, smallBoost: 2.0, bigDamp: 0.5 }),
  'pity 50% + crowded 40% ×2.0/0.5': t({ pityFullness: 0.5, crowdedFullness: 0.4, smallBoost: 2.0, bigDamp: 0.5 }),
  'pity every + crowded 40%': t({ pityDeals: 0, crowdedFullness: 0.4 }),
  'pity every + crowded 40% ×2.0/0.5': t({ pityDeals: 0, crowdedFullness: 0.4, smallBoost: 2.0, bigDamp: 0.5 }),
};

describe.skipIf(!import.meta.env.SIM)('balance simulation', () => {
  test.skipIf(import.meta.env.SIM_ONLY && import.meta.env.SIM_ONLY !== 'pieces')('piece catalogs', async () => {
    const rows = Object.entries(CANDIDATES).map(([name, defs]) => measure(name, buildCatalog(defs), DEFAULT_TUNING));
    await emit('piece catalogs', rows);
    expect(rows.length).toBe(Object.keys(CANDIDATES).length);
  }, 1_800_000);

  test.skipIf(import.meta.env.SIM_ONLY && import.meta.env.SIM_ONLY !== 'dealer')('dealer tuning', async () => {
    const catalog = buildCatalog(SHAPE_DEFS);
    const rows = Object.entries(TUNINGS).map(([name, tuning]) => measure(name, catalog, tuning));
    await emit('dealer tuning', rows);
    expect(rows.length).toBe(Object.keys(TUNINGS).length);
  }, 1_800_000);
});
