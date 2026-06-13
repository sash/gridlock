import { Rng } from './rng';
import { PIECES, getPiece, rotatePiece } from './pieces';
import {
  BOARD_SIZE,
  CELL,
  applyClears,
  canPlace,
  findCompletedLines,
  idx,
  isFilled,
  place,
  validPlacements,
  type Board,
  type Lines,
} from './board';
import { GEM_BONUS, PERFECT_CLEAR_BONUS, STREAK_MULTIPLIER_CAP, linePoints, streakMultiplier, updateStreak } from './scoring';
import {
  createSpecialsState,
  explodeBomb,
  grantWild,
  spawnOnDeal,
  tickPlacement,
  type SpecialsState,
} from './specials';
import { dealTray } from './generator';

export type Mode = 'classic' | 'daily' | 'rush' | 'zen';
export type PowerUpKind = 'rotate' | 'swap' | 'hammer' | 'undo';

export const RUSH_SECONDS = 90;
const DAILY_PREFILL_CELLS = 10;
const ZEN_DISSOLVE_ROWS = 2;
const MAX_TIME_TARGETS = 3;
const MIN_TARGET_SECONDS = 2;
const MAX_TARGET_SECONDS = 5;

export interface GameState {
  mode: Mode;
  board: Board;
  tray: (string | null)[];
  score: number;
  streak: number;
  misses: number;
  /** Lifetime line clears this game — drives the evolving block skin. */
  totalLines: number;
  seed: number;
  rngState: number;
  dealNumber: number;
  dealsSinceClear: number;
  clearedThisDeal: boolean;
  lastPlacementCleared: boolean;
  aux: SpecialsState;
  used: Record<PowerUpKind, boolean>;
  over: boolean;
  rushTimeLeft: number | null;
}

export interface SerializedGame extends Omit<GameState, 'board'> {
  board: number[];
}

export interface PlaceResult {
  cellPoints: number;
  linesCleared: number;
  lines: Lines;
  linePointsGained: number;
  gemBonus: number;
  clearedCells: number[];
  explodedCells: number[];
  crackedCells: number[];
  perfectClear: boolean;
  gameOver: boolean;
  zenDissolved: boolean;
  /** Rush: bonus seconds banked by clearing time targets. */
  timeGained: number;
  /** Power-ups earned this placement (streak cap, perfect clear). */
  earned: PowerUpKind[];
}

export interface GameOptions {
  mode: Mode;
  seed: number;
}

export class Game {
  state: GameState;
  private rng: Rng;
  private undoSnapshot: GameState | null = null;

  constructor(opts: GameOptions) {
    this.rng = new Rng(opts.seed);
    this.state = {
      mode: opts.mode,
      board: new Uint8Array(BOARD_SIZE * BOARD_SIZE),
      tray: [null, null, null],
      score: 0,
      streak: 0,
      misses: 0,
      totalLines: 0,
      seed: opts.seed,
      rngState: 0,
      dealNumber: 1,
      dealsSinceClear: 0,
      clearedThisDeal: false,
      lastPlacementCleared: false,
      aux: createSpecialsState(),
      used: { rotate: false, swap: false, hammer: false, undo: false },
      over: false,
      rushTimeLeft: opts.mode === 'rush' ? RUSH_SECONDS : null,
    };
    if (opts.mode === 'daily') this.prefillDaily();
    this.state.tray = dealTray(this.state.board, this.rng, 0);
    this.syncRng();
  }

  private prefillDaily(): void {
    const b = this.state.board;
    let placed = 0;
    while (placed < DAILY_PREFILL_CELLS) {
      const i = this.rng.int(b.length);
      if (b[i] === CELL.EMPTY) {
        b[i] = 1 + this.rng.int(8);
        placed++;
      }
    }
  }

  private syncRng(): void {
    this.state.rngState = this.rng.getState();
  }

  canPlaceAt(slot: number, col: number, row: number): boolean {
    const id = this.state.tray[slot];
    if (!id || this.state.over) return false;
    return canPlace(this.state.board, getPiece(id), col, row);
  }

  /** Lines a drop would complete — for the ghost preview glow. Null if invalid. */
  wouldClear(slot: number, col: number, row: number): Lines | null {
    const id = this.state.tray[slot];
    if (!id || !this.canPlaceAt(slot, col, row)) return null;
    const copy = new Uint8Array(this.state.board);
    place(copy, getPiece(id), col, row);
    return findCompletedLines(copy);
  }

  totalValidMoves(): number {
    let n = 0;
    for (const id of this.state.tray) {
      if (id) n += validPlacements(this.state.board, getPiece(id)).length;
    }
    return n;
  }

  place(slot: number, col: number, row: number): PlaceResult | null {
    const s = this.state;
    const id = s.tray[slot];
    if (s.over || !id) return null;
    const piece = getPiece(id);
    if (!canPlace(s.board, piece, col, row)) return null;

    this.undoSnapshot = structuredClone(s);

    const result: PlaceResult = {
      cellPoints: piece.cells.length,
      linesCleared: 0,
      lines: { rows: [], cols: [] },
      linePointsGained: 0,
      gemBonus: 0,
      clearedCells: [],
      explodedCells: [],
      crackedCells: [],
      perfectClear: false,
      gameOver: false,
      zenDissolved: false,
      timeGained: 0,
      earned: [],
    };

    place(s.board, piece, col, row);
    s.score += piece.cells.length;

    const lines = findCompletedLines(s.board);
    result.lines = lines;
    result.linesCleared = lines.rows.length + lines.cols.length;
    s.totalLines += result.linesCleared;
    const clearRes = applyClears(s.board, lines);
    result.clearedCells = clearRes.clearedCells;
    result.crackedCells = clearRes.cracked;

    for (const bombIdx of clearRes.bombs) {
      result.explodedCells.push(...explodeBomb(s.board, s.aux, bombIdx));
      delete s.aux.bombs[bombIdx];
    }

    const cleared = result.linesCleared > 0;
    const multBefore = streakMultiplier(s.streak);
    const next = updateStreak({ streak: s.streak, misses: s.misses }, cleared);
    s.streak = next.streak;
    s.misses = next.misses;
    if (cleared) {
      result.linePointsGained = Math.round(linePoints(result.linesCleared) * streakMultiplier(s.streak));
      s.score += result.linePointsGained;
      s.clearedThisDeal = true;
      if (multBefore < STREAK_MULTIPLIER_CAP && streakMultiplier(s.streak) >= STREAK_MULTIPLIER_CAP) {
        result.earned.push(this.randomPowerUp());
      }
    }
    s.lastPlacementCleared = cleared;
    if (cleared) this.undoSnapshot = null; // undo is disabled after a clear

    result.gemBonus = clearRes.gems.length * GEM_BONUS;
    s.score += result.gemBonus;

    result.perfectClear = s.board.every((v) => v === CELL.EMPTY);
    if (result.perfectClear) {
      s.score += PERFECT_CLEAR_BONUS;
      result.earned.push(this.randomPowerUp());
    }

    if (result.linesCleared >= 3) grantWild(s.board, this.rng);

    tickPlacement(s.board, s.aux);
    this.updateTimeTargets(result);

    s.tray[slot] = null;
    if (s.mode === 'rush') {
      s.tray[slot] = this.dealOne();
    } else if (s.tray.every((t) => t === null)) {
      this.newDeal();
    }

    this.resolveStuckBoard(result);
    this.syncRng();
    return result;
  }

  /** Rush only: bank seconds for cleared targets, then mark a fresh one. */
  private updateTimeTargets(result: PlaceResult): void {
    const s = this.state;
    if (s.mode !== 'rush' || s.rushTimeLeft === null) return;
    for (const i of [...result.clearedCells, ...result.explodedCells]) {
      const seconds = s.aux.times[i];
      if (seconds) {
        result.timeGained += seconds;
        delete s.aux.times[i];
      }
    }
    // a target whose cell is somehow empty (e.g. blast) is stale — drop it
    for (const key of Object.keys(s.aux.times)) {
      if (!isFilled(s.board[Number(key)])) delete s.aux.times[Number(key)];
    }
    if (result.timeGained > 0) {
      s.rushTimeLeft = Math.min(s.rushTimeLeft + result.timeGained, 999);
    }
    if (Object.keys(s.aux.times).length < MAX_TIME_TARGETS) {
      const candidates: number[] = [];
      for (let i = 0; i < s.board.length; i++) {
        if (s.board[i] >= 1 && s.board[i] <= 8 && s.aux.times[i] === undefined) candidates.push(i);
      }
      if (candidates.length > 0) {
        const cell = candidates[this.rng.int(candidates.length)];
        s.aux.times[cell] = MIN_TARGET_SECONDS + this.rng.int(MAX_TARGET_SECONDS - MIN_TARGET_SECONDS + 1);
      }
    }
  }

  private dealOne(): string {
    return this.rng.weightedPick(PIECES, PIECES.map((p) => p.weight)).id;
  }

  private newDeal(): void {
    const s = this.state;
    s.dealNumber++;
    s.dealsSinceClear = s.clearedThisDeal ? 0 : s.dealsSinceClear + 1;
    s.clearedThisDeal = false;
    spawnOnDeal(s.board, s.aux, this.rng, s.dealNumber, s.score);
    s.tray = dealTray(s.board, this.rng, s.dealsSinceClear);
  }

  private hasAnyMove(): boolean {
    return this.totalValidMoves() > 0;
  }

  private resolveStuckBoard(result: PlaceResult): void {
    const s = this.state;
    if (this.hasAnyMove()) return;
    if (s.mode !== 'zen') {
      s.over = true;
      result.gameOver = true;
      return;
    }
    // Zen: the fullest rows dissolve (2 per pass) until something fits again
    for (let pass = 0; pass < 4 && !this.hasAnyMove(); pass++) {
      this.dissolveFullestRows();
      result.zenDissolved = true;
    }
  }

  private dissolveFullestRows(): void {
    const s = this.state;
    const counts = Array.from({ length: BOARD_SIZE }, (_, r) => {
      let n = 0;
      for (let c = 0; c < BOARD_SIZE; c++) if (isFilled(s.board[idx(c, r)])) n++;
      return { r, n };
    });
    counts.sort((a, b) => b.n - a.n || a.r - b.r);
    for (const { r } of counts.slice(0, ZEN_DISSOLVE_ROWS)) {
      for (let c = 0; c < BOARD_SIZE; c++) {
        const i = idx(c, r);
        s.board[i] = CELL.EMPTY;
        delete s.aux.bombs[i];
        delete s.aux.stones[i];
      }
    }
  }

  private randomPowerUp(): PowerUpKind {
    const kinds: PowerUpKind[] = ['rotate', 'swap', 'hammer', 'undo'];
    return kinds[this.rng.int(kinds.length)];
  }

  /** Rush only: count down. Returns true when the game just ended. */
  tickTime(dt: number): boolean {
    const s = this.state;
    if (s.mode !== 'rush' || s.over || s.rushTimeLeft === null) return false;
    s.rushTimeLeft = Math.max(0, s.rushTimeLeft - dt);
    if (s.rushTimeLeft <= 0) {
      s.over = true;
      return true;
    }
    return false;
  }

  // --- Power-ups (max 1 use of each per game) ---

  useRotate(slot: number): boolean {
    const s = this.state;
    const id = s.tray[slot];
    if (s.used.rotate || s.over || !id) return false;
    s.tray[slot] = rotatePiece(id);
    s.used.rotate = true;
    return true;
  }

  useSwap(): boolean {
    const s = this.state;
    if (s.used.swap || s.over) return false;
    s.tray = dealTray(s.board, this.rng, s.dealsSinceClear);
    s.used.swap = true;
    this.syncRng();
    return true;
  }

  useHammer(col: number, row: number): boolean {
    const s = this.state;
    const i = idx(col, row);
    if (s.used.hammer || s.over || !isFilled(s.board[i])) return false;
    s.board[i] = CELL.EMPTY;
    delete s.aux.bombs[i];
    delete s.aux.stones[i];
    delete s.aux.times[i]; // hammering a target forfeits it
    s.used.hammer = true;
    return true;
  }

  useUndo(): boolean {
    const s = this.state;
    if (s.used.undo || s.over || !this.undoSnapshot || s.lastPlacementCleared) return false;
    this.state = this.undoSnapshot;
    this.undoSnapshot = null;
    this.rng.setState(this.state.rngState);
    this.state.used.undo = true;
    return true;
  }

  // --- Persistence ---

  serialize(): SerializedGame {
    this.syncRng();
    const { board, ...rest } = this.state;
    return structuredClone({ ...rest, board: Array.from(board) });
  }

  static deserialize(data: SerializedGame): Game {
    const game = Object.create(Game.prototype) as Game;
    const { board, ...rest } = structuredClone(data);
    // migrate saves from the old one-placement-grace format
    const legacy = rest as { grace?: boolean; misses?: number; totalLines?: number };
    if (legacy.misses === undefined) {
      legacy.misses = legacy.grace ? 1 : 0;
      delete legacy.grace;
    }
    legacy.totalLines ??= 0;
    (rest.aux as { times?: Record<number, number> }).times ??= {};
    game.state = { ...rest, board: new Uint8Array(board) };
    (game as unknown as { rng: Rng }).rng = new Rng(0);
    (game as unknown as { rng: Rng }).rng.setState(data.rngState);
    (game as unknown as { undoSnapshot: GameState | null }).undoSnapshot = null;
    return game;
  }
}
