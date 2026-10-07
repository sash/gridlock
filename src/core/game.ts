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
  shatterStones,
  spawnOnDeal,
  tickPlacement,
  wildAura,
  type SpecialsState,
} from './specials';
import { dealSingle, dealTray } from './generator';

export type Mode = 'classic' | 'daily' | 'rush' | 'zen';
export type PowerUpKind = 'rotate' | 'swap' | 'hammer' | 'undo';

export const RUSH_SECONDS = 90;
const DAILY_PREFILL_CELLS = 10;
const ZEN_DISSOLVE_ROWS = 2;
const MAX_TIME_TARGETS = 3;
const MIN_TARGET_SECONDS = 2;
const MAX_TARGET_SECONDS = 5;
/** Tray index that addresses the hold slot (the 3 dealt pieces are 0..2). */
export const HOLD_SLOT = 3;
/** Uses of each power-up allowed per game. */
export const MAX_POWERUP_USES = 2;
/** A random power-up is earned every this many cleared lines. */
export const POWERUP_EVERY_LINES = 15;
/** Clearing at least this many lines at once grants a wild zone. */
export const WILD_MIN_LINES = 2;

export interface GameState {
  mode: Mode;
  board: Board;
  /** 1 where a block has ever been placed this game — specials prefer virgin cells. */
  touched: Uint8Array;
  tray: (string | null)[];
  /** Parked piece — placeable any time, doesn't count toward the next deal. */
  hold: string | null;
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
  /** Power-up uses this game (max MAX_POWERUP_USES each). */
  used: Record<PowerUpKind, number>;
  /** The once-per-game last-chance rescue has been spent. */
  rescued: boolean;
  over: boolean;
  rushTimeLeft: number | null;
}

export interface SerializedGame extends Omit<GameState, 'board' | 'touched'> {
  board: number[];
  touched: number[];
}

export interface PlaceResult {
  cellPoints: number;
  linesCleared: number;
  lines: Lines;
  linePointsGained: number;
  gemBonus: number;
  clearedCells: number[];
  explodedCells: number[];
  /** Bombs that went off this placement (chain reactions included) — for the blast FX. */
  blastCenters: number[];
  crackedCells: number[];
  /** Stones shattered early by a clear touching them. */
  shatteredCells: number[];
  perfectClear: boolean;
  gameOver: boolean;
  zenDissolved: boolean;
  /** The once-per-game rescue fired: rows cracked away instead of game over. */
  lastChance: boolean;
  /** Rows the rescue (or Zen) dissolved. */
  dissolvedRows: number[];
  /** Rush: bonus seconds banked by clearing time targets. */
  timeGained: number;
  /** Power-ups earned this placement (streak cap, perfect clear). */
  earned: PowerUpKind[];
}

/** How a move that can leave the board stuck resolved it. */
export type StuckOutcome = Pick<PlaceResult, 'gameOver' | 'zenDissolved' | 'lastChance' | 'dissolvedRows'>;

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
      touched: new Uint8Array(BOARD_SIZE * BOARD_SIZE),
      tray: [null, null, null],
      hold: null,
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
      used: { rotate: 0, swap: 0, hammer: 0, undo: 0 },
      rescued: false,
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
        this.state.touched[i] = 1;
        placed++;
      }
    }
  }

  private syncRng(): void {
    this.state.rngState = this.rng.getState();
  }

  /** Piece in a tray slot, or the held piece for HOLD_SLOT. */
  pieceAt(slot: number): string | null {
    return slot === HOLD_SLOT ? this.state.hold : (this.state.tray[slot] ?? null);
  }

  canPlaceAt(slot: number, col: number, row: number): boolean {
    const id = this.pieceAt(slot);
    if (!id || this.state.over) return false;
    return canPlace(this.state.board, getPiece(id), col, row);
  }

  /** Lines a drop would complete — for the ghost preview glow. Null if invalid. */
  wouldClear(slot: number, col: number, row: number): Lines | null {
    const id = this.pieceAt(slot);
    if (!id || !this.canPlaceAt(slot, col, row)) return null;
    const copy = new Uint8Array(this.state.board);
    place(copy, getPiece(id), col, row);
    return findCompletedLines(copy, wildAura(this.state.aux.wilds));
  }

  totalValidMoves(): number {
    let n = 0;
    for (const id of [...this.state.tray, this.state.hold]) {
      if (id) n += validPlacements(this.state.board, getPiece(id)).length;
    }
    return n;
  }

  /**
   * Park a tray piece in the hold slot. If something is already held, the two
   * trade places. Parking the last tray piece triggers the next deal, so
   * pieces are never discarded — just postponed.
   */
  holdPiece(slot: number): StuckOutcome | null {
    const s = this.state;
    const id = s.tray[slot];
    if (s.over || slot === HOLD_SLOT || !id) return null;
    s.tray[slot] = s.hold;
    s.hold = id;
    if (s.tray[slot] === null) {
      if (s.mode === 'rush') s.tray[slot] = this.dealOne();
      else if (s.tray.every((t) => t === null)) this.newDeal();
    }
    // a fresh deal can leave nothing placeable, same as a placement can
    const outcome: StuckOutcome = { gameOver: false, zenDissolved: false, lastChance: false, dissolvedRows: [] };
    this.resolveStuckBoard(outcome);
    this.syncRng();
    return outcome;
  }

  place(slot: number, col: number, row: number): PlaceResult | null {
    const s = this.state;
    const id = this.pieceAt(slot);
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
      blastCenters: [],
      crackedCells: [],
      shatteredCells: [],
      perfectClear: false,
      gameOver: false,
      zenDissolved: false,
      lastChance: false,
      dissolvedRows: [],
      timeGained: 0,
      earned: [],
    };

    place(s.board, piece, col, row);
    for (const [c, r] of piece.cells) s.touched[idx(col + c, row + r)] = 1;
    s.score += piece.cells.length;

    const aura = wildAura(s.aux.wilds);
    const lines = findCompletedLines(s.board, aura);
    result.lines = lines;
    result.linesCleared = lines.rows.length + lines.cols.length;
    s.totalLines += result.linesCleared;
    const clearRes = applyClears(s.board, lines);
    result.clearedCells = clearRes.clearedCells;
    result.crackedCells = clearRes.cracked;

    const lineCells = new Set<number>();
    for (const r of lines.rows) for (let c = 0; c < BOARD_SIZE; c++) lineCells.add(idx(c, r));
    for (const c of lines.cols) for (let r = 0; r < BOARD_SIZE; r++) lineCells.add(idx(c, r));
    // a clear through a wild zone consumes that wild
    if (result.linesCleared > 0 && s.aux.wilds.length > 0) {
      s.aux.wilds = s.aux.wilds.filter(
        (center) => ![...wildAura([center])].some((cell) => lineCells.has(cell)),
      );
    }
    if (result.linesCleared > 0) result.shatteredCells = shatterStones(s.board, s.aux, lineCells);

    let blastGems = 0;
    for (const bombIdx of clearRes.bombs) {
      if (result.blastCenters.includes(bombIdx)) continue; // already chained
      const blast = explodeBomb(s.board, s.aux, bombIdx);
      result.explodedCells.push(...blast.cleared);
      result.blastCenters.push(...blast.centers);
      blastGems += blast.gems.length;
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

    const milestonesBefore = Math.floor((s.totalLines - result.linesCleared) / POWERUP_EVERY_LINES);
    if (Math.floor(s.totalLines / POWERUP_EVERY_LINES) > milestonesBefore) {
      result.earned.push(this.randomPowerUp());
    }

    result.gemBonus = (clearRes.gems.length + blastGems) * GEM_BONUS;
    s.score += result.gemBonus;

    result.perfectClear = s.board.every((v) => v === CELL.EMPTY);
    if (result.perfectClear) {
      s.score += PERFECT_CLEAR_BONUS;
      result.earned.push(this.randomPowerUp());
    }

    if (result.linesCleared >= WILD_MIN_LINES) grantWild(s.board, this.rng, s.touched, s.aux);

    tickPlacement(s.board, s.aux);
    this.updateTimeTargets(result);

    if (slot === HOLD_SLOT) {
      s.hold = null;
    } else {
      s.tray[slot] = null;
      if (s.mode === 'rush') {
        s.tray[slot] = this.dealOne();
      } else if (s.tray.every((t) => t === null)) {
        this.newDeal();
      }
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
    return dealSingle(this.state.board, this.rng);
  }

  private newDeal(): void {
    const s = this.state;
    s.dealNumber++;
    s.dealsSinceClear = s.clearedThisDeal ? 0 : s.dealsSinceClear + 1;
    s.clearedThisDeal = false;
    spawnOnDeal(s.board, s.aux, this.rng, s.dealNumber, s.score, s.touched);
    s.tray = dealTray(s.board, this.rng, s.dealsSinceClear);
  }

  private hasAnyMove(): boolean {
    return this.totalValidMoves() > 0;
  }

  private resolveStuckBoard(result: StuckOutcome): void {
    const s = this.state;
    if (this.hasAnyMove()) return;
    if (s.mode === 'zen') {
      // Zen: the fullest rows dissolve (2 per pass) until something fits again
      for (let pass = 0; pass < 4 && !this.hasAnyMove(); pass++) {
        result.dissolvedRows.push(...this.dissolveFullestRows(ZEN_DISSOLVE_ROWS));
        result.zenDissolved = true;
      }
      return;
    }
    if (!s.rescued) {
      // last chance, once per game: the fullest rows crack away one at a time
      // until a piece fits again
      s.rescued = true;
      for (let pass = 0; pass < BOARD_SIZE && !this.hasAnyMove(); pass++) {
        result.dissolvedRows.push(...this.dissolveFullestRows(1));
      }
      result.lastChance = true;
      return;
    }
    s.over = true;
    result.gameOver = true;
  }

  private dissolveFullestRows(n: number): number[] {
    const s = this.state;
    const counts = Array.from({ length: BOARD_SIZE }, (_, r) => {
      let n = 0;
      for (let c = 0; c < BOARD_SIZE; c++) if (isFilled(s.board[idx(c, r)])) n++;
      return { r, n };
    });
    counts.sort((a, b) => b.n - a.n || a.r - b.r);
    const rows = counts.slice(0, n).map(({ r }) => r);
    for (const r of rows) {
      for (let c = 0; c < BOARD_SIZE; c++) {
        const i = idx(c, r);
        s.board[i] = CELL.EMPTY;
        delete s.aux.bombs[i];
        delete s.aux.stones[i];
        delete s.aux.times[i];
      }
    }
    return rows;
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

  /** Uses of this power-up left in the current game. */
  usesLeft(kind: PowerUpKind): number {
    return MAX_POWERUP_USES - this.state.used[kind];
  }

  useRotate(slot: number): boolean {
    const s = this.state;
    const id = this.pieceAt(slot);
    if (this.usesLeft('rotate') <= 0 || s.over || !id) return false;
    if (slot === HOLD_SLOT) s.hold = rotatePiece(id);
    else s.tray[slot] = rotatePiece(id);
    s.used.rotate++;
    return true;
  }

  useSwap(): boolean {
    const s = this.state;
    if (this.usesLeft('swap') <= 0 || s.over) return false;
    s.tray = dealTray(s.board, this.rng, s.dealsSinceClear);
    s.used.swap++;
    this.syncRng();
    return true;
  }

  useHammer(col: number, row: number): boolean {
    const s = this.state;
    const i = idx(col, row);
    if (this.usesLeft('hammer') <= 0 || s.over || !isFilled(s.board[i])) return false;
    s.board[i] = CELL.EMPTY;
    delete s.aux.bombs[i];
    delete s.aux.stones[i];
    delete s.aux.times[i]; // hammering a target forfeits it
    s.used.hammer++;
    return true;
  }

  useUndo(): boolean {
    const s = this.state;
    if (this.usesLeft('undo') <= 0 || s.over || !this.undoSnapshot || s.lastPlacementCleared) return false;
    // power-ups spent since the snapshot stay spent
    const used = { ...s.used, undo: s.used.undo + 1 };
    this.state = this.undoSnapshot;
    this.undoSnapshot = null;
    this.rng.setState(this.state.rngState);
    this.state.used = used;
    return true;
  }

  // --- Persistence ---

  serialize(): SerializedGame {
    this.syncRng();
    const { board, touched, ...rest } = this.state;
    return structuredClone({ ...rest, board: Array.from(board), touched: Array.from(touched) });
  }

  static deserialize(data: SerializedGame): Game {
    const game = Object.create(Game.prototype) as Game;
    const { board, touched, ...rest } = structuredClone(data);
    // migrate saves from the old one-placement-grace format
    const legacy = rest as { grace?: boolean; misses?: number; totalLines?: number };
    if (legacy.misses === undefined) {
      legacy.misses = legacy.grace ? 1 : 0;
      delete legacy.grace;
    }
    legacy.totalLines ??= 0;
    const migrated = rest as { hold?: string | null; rescued?: boolean; used: Record<PowerUpKind, number | boolean> };
    migrated.hold ??= null;
    migrated.rescued ??= false;
    // pieces retired from the catalog (e.g. the 3-cell diagonal) become dots
    const known = (id: string | null) => (id && PIECES.some((p) => p.id === id) ? id : null);
    rest.tray = rest.tray.map((id) => (id === null ? null : known(id) ?? 'DOT_0'));
    migrated.hold = known(migrated.hold);
    // saves from the one-use-per-game era stored booleans
    for (const k of Object.keys(migrated.used) as PowerUpKind[]) migrated.used[k] = Number(migrated.used[k]);
    const aux = rest.aux as { times?: Record<number, number>; wilds?: number[] };
    aux.times ??= {};
    aux.wilds ??= [];
    // legacy saves stored wilds as board cells — lift them into zones
    for (let i = 0; i < board.length; i++) {
      if (board[i] === CELL.WILD) {
        board[i] = CELL.EMPTY;
        aux.wilds.push(i);
      }
    }
    game.state = {
      ...rest,
      board: new Uint8Array(board),
      // legacy saves: treat currently-filled cells as touched
      touched: touched ? new Uint8Array(touched) : new Uint8Array(board.map((v) => (v ? 1 : 0))),
    };
    (game as unknown as { rng: Rng }).rng = new Rng(0);
    (game as unknown as { rng: Rng }).rng.setState(data.rngState);
    (game as unknown as { undoSnapshot: GameState | null }).undoSnapshot = null;
    return game;
  }
}
