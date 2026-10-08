import { Application, Container, Graphics } from 'pixi.js';
import { STONE_LIFETIME, wildAura, type SpecialKind } from '../core/specials';
import { drawBlock } from './views';
import { Game, HOLD_SLOT, LINES_PER_LEVEL, levelFor, type Mode, type PlaceResult, type PowerUpKind, type StuckOutcome } from '../core/game';
import { BOARD_SIZE, CELL } from '../core/board';
import { getPiece } from '../core/pieces';
import { streakMultiplier } from '../core/scoring';
import { dailyKey, dailySeed, shareCard } from '../core/daily';
import { BoardView, ParticleSystem, TrayView } from './views';
import { Hud } from './hud';
import { GameAudio } from './audio';
import { getTheme, type Theme } from './theme';
import * as storage from './storage';
import { screenHeight } from './viewport';

const LIFT_OFFSET = -80; // px above the finger so the thumb doesn't hide the piece
const NEAR_DEATH_MOVES = 2;
const BLAST_SHAKE_S = 0.4;
const RESCUE_SHAKE_S = 0.5;

/** Haptic cues forwarded to the React Native shell (no-op on the web). */
function nativeHaptic(kind: 'place' | 'clear' | 'big-clear' | 'perfect' | 'game-over'): void {
  const bridge = (window as { ReactNativeWebView?: { postMessage(msg: string): void } })
    .ReactNativeWebView;
  bridge?.postMessage(JSON.stringify({ type: 'haptic', kind }));
}

const HOLD_INTRO = '📥 Tip: drag a piece onto HOLD to save it for later';
const UNLOCK_TOAST: Record<SpecialKind, string> = {
  gem: '💎 Gems unlocked — clear their line for +150',
  wild: '🌈 Wild zones unlocked — clear 2 lines at once to earn one',
  cross: '✨ Starbursts unlocked — their clear fires the crossing line too',
  bomb: '💣 Bombs unlocked — clear their line before the counter hits 0',
  prism: '🔮 Prisms unlocked — their clear shatters every block of their colour',
  ice: '🧊 Ice unlocked — it takes two clears',
};

/** Shown when the player taps a special brick on the board. */
const SPECIAL_TAP_INFO: Record<number, string> = {
  [CELL.GEM]: '💎 Gem — clear its row or column for +150 points',
  [CELL.ICE]: '🧊 Ice — needs two clears: first cracks it, second removes it',
  [CELL.CRACKED]: '🧊 Cracked ice — one more clear removes it',
  [CELL.BOMB]: '💣 Bomb — clear its line before the counter reaches 0 to blast a 5×5 area; too late and it turns to stone',
  [CELL.CROSS]: '✨ Starburst — clear its row or column and the crossing line clears too (counts as an extra line)',
  [CELL.PRISM]: '🔮 Prism — clear its line and every block of its colour shatters, +10 each',
  [CELL.STONE]: `🪨 Stone — clear a line through or right beside it to shatter it; otherwise it crumbles after ${STONE_LIFETIME} placements`,
  [CELL.WILD]: '🌈 Wild zone — never blocks your pieces, but its cross counts as filled when completing lines. One clear through it uses it up',
};

interface DragState {
  slot: number;
  pieceId: string;
  gfx: Container;
  col: number;
  row: number;
  valid: boolean;
  /** Finger is over the hold slot — dropping parks the piece there. */
  overHold: boolean;
}

export class GameApp {
  game: Game | null = null;
  private theme: Theme;
  private board: BoardView;
  private tray: TrayView;
  private particles: ParticleSystem;
  private hud: Hud;
  private audio = new GameAudio();
  private stage: Container;
  private drag: DragState | null = null;
  private armed: PowerUpKind | null = null;
  private inventory = storage.getInventory();
  private nearDeathZones = new Set<number>();
  private holdEscapeHinted = false;
  private pulsePhase = 0;
  private shakeLeft = 0;
  private shakeTotal = 0;
  private shakeAmp = 0;
  private boardOrigin = { x: 0, y: 0 };
  private trayOrigin = { x: 0, y: 0 };

  constructor(private app: Application) {
    // theme follows the OS color scheme: light → Paper, otherwise Night
    const lightScheme = window.matchMedia('(prefers-color-scheme: light)');
    this.theme = getTheme(lightScheme.matches ? 'paper' : 'night');
    lightScheme.addEventListener('change', (e) => this.setTheme(e.matches ? 'paper' : 'night'));
    this.stage = app.stage;
    this.board = new BoardView(this.theme);
    this.tray = new TrayView(this.theme);
    this.particles = new ParticleSystem();
    this.board.container.addChild(this.particles.container);
    this.stage.addChild(this.board.container, this.tray.container);

    this.hud = new Hud(document.body, {
      onSelectMode: (m) => this.startMode(m),
      onPowerUp: (k) => this.handlePowerUp(k),
      onMenu: () => this.toMenu(),
      onCloseMenu: () => {
        this.hud.hideOverlays();
        this.refresh();
      },
      onRestart: () => this.restart(),
      onShare: () => this.share(),
    });
    this.hud.applyTheme(this.theme);

    if (storage.applyDailyLoginGrant(dailyKey(new Date()))) {
      this.inventory = storage.getInventory();
    }

    // iOS in the browser (not installed): nudge toward Add to Home Screen
    const isIOS =
      /iPhone|iPad|iPod/.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as unknown as { standalone?: boolean }).standalone === true ||
      // the React Native shell is already an installed app
      typeof (window as { ReactNativeWebView?: unknown }).ReactNativeWebView !== 'undefined';
    if (isIOS && !standalone && !storage.isInstallHintDismissed()) {
      this.hud.showInstallHint(() => storage.dismissInstallHint());
    }

    const canvas = app.canvas as HTMLCanvasElement;
    canvas.addEventListener('pointerdown', (e) => this.onPointerDown(e));
    window.addEventListener('pointermove', (e) => this.onPointerMove(e));
    window.addEventListener('pointerup', (e) => this.onPointerUp(e));
    window.addEventListener('pointercancel', () => this.cancelDrag());
    window.addEventListener('resize', () => {
      this.layout();
      // Pixi's own resizeTo handling is rAF-deferred; re-measure after it ran
      requestAnimationFrame(() => this.layout());
    });
    window.addEventListener('pagehide', () => this.persist());
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') this.persist();
    });

    app.ticker.add(() => this.update(app.ticker.deltaMS / 1000));

    this.layout();
    // web fonts change the HUD height when they land — re-measure
    document.fonts?.ready.then(() => this.layout()).catch(() => undefined);
    this.resumeOrMenu();
  }

  // --- lifecycle ---

  private resumeOrMenu(): void {
    const last = localStorage.getItem('gridlock.lastMode') as Mode | null;
    if (last) {
      const saved = storage.loadGame(last);
      if (saved && !saved.over) {
        this.game = Game.deserialize(saved);
        this.hud.hideOverlays();
        this.refresh();
        return;
      }
    }
    this.toMenu();
  }

  startMode(mode: Mode): void {
    this.audio.unlock();
    if (mode === 'daily') {
      const key = dailyKey(new Date());
      const saved = storage.loadGame('daily');
      const done = storage.getDailyResult(key);
      if (saved && !saved.over && saved.seed === dailySeed(new Date())) {
        this.game = Game.deserialize(saved); // resume today's attempt
      } else if (done) {
        this.hud.showGameOver({
          title: 'Daily done — back tomorrow!',
          score: done.score,
          high: storage.getHighScore('daily'),
          card: done.card,
          shareable: true,
          canRestart: false,
        });
        return;
      } else {
        this.game = new Game({ mode, seed: dailySeed(new Date()) });
      }
    } else {
      const saved = storage.loadGame(mode);
      this.game =
        saved && !saved.over
          ? Game.deserialize(saved)
          : new Game({ mode, seed: (Date.now() ^ (Math.random() * 0xffffffff)) >>> 0 });
    }
    localStorage.setItem('gridlock.lastMode', mode);
    this.hud.hideOverlays();
    this.persist();
    this.refresh();
  }

  restart(): void {
    if (!this.game) return this.toMenu();
    const mode = this.game.state.mode;
    storage.clearSavedGame(mode);
    if (mode === 'daily') return this.toMenu(); // one attempt per day
    this.game = new Game({ mode, seed: (Date.now() ^ (Math.random() * 0xffffffff)) >>> 0 });
    this.hud.hideOverlays();
    this.persist();
    this.refresh();
  }

  private toMenu(): void {
    this.persist();
    this.cancelDrag();
    const g = this.game;
    // Daily is one attempt per day — no mid-game restart there
    const canRestart = !!g && !g.state.over && g.state.mode !== 'daily';
    const closable = !!g && !g.state.over;
    this.hud.showMenu(canRestart ? `🔁 New game (${g!.state.mode})` : null, closable);
  }

  private setTheme(id: string): void {
    this.theme = getTheme(id);
    // the canvas covers the page — its clear color must follow the theme too
    this.app.renderer.background.color = this.theme.background;
    this.board.setTheme(this.theme);
    this.tray.setTheme(this.theme);
    this.hud.applyTheme(this.theme);
    this.layout();
    this.refresh();
  }

  private persist(): void {
    if (this.game && !this.game.state.over) storage.saveGame(this.game.serialize());
  }

  // --- layout ---

  private layout(): void {
    // Window dimensions, not renderer ones: the renderer resize is deferred and
    // can be stale here, and CSS pixels are the space pointer events live in.
    // Height comes from the measured screen so iOS standalone's short layout
    // viewport doesn't squeeze the board and strand a dead strip at the bottom.
    const w = window.innerWidth;
    const h = screenHeight();
    // Measure the real HUD bar: in standalone PWA mode on iPhone the safe-area
    // inset pushes it well below a hardcoded offset, overlapping the board.
    const topBar = this.hud.topBarBottom() + 12;

    this.hud.setLandscape(w > h);
    if (w > h) {
      // landscape: score/menu collapse into a left column; the board owns the
      // full height with the power-up dock and tray flanking it
      const dockW = 58;
      const hudReserve = 150; // left column with ☰/?, score, flame
      // tray column holds 4 slots (3 dealt + hold) along the board's height
      const size = Math.min(h - 24, (w - hudReserve - dockW - 24 - 28 - 20) * 0.8, 520);
      const trayW = size / 4;
      const groupW = dockW + 24 + size + 28 + trayW;
      const x0 = hudReserve + (w - hudReserve - groupW) / 2;
      const boardY = (h - size) / 2;
      this.boardOrigin = { x: x0 + dockW + 24, y: boardY };
      this.trayOrigin = { x: this.boardOrigin.x + size + 28, y: boardY };
      this.board.container.position.set(this.boardOrigin.x, this.boardOrigin.y);
      this.board.resize(size);
      this.tray.container.position.set(this.trayOrigin.x, this.trayOrigin.y);
      this.tray.resize(size, true);
      const dockH = 4 * 58 + 3 * 11;
      this.hud.positionDock('side', x0, boardY + (size - dockH) / 2);
      this.refresh();
      return;
    }
    this.hud.positionDock('bottom');

    const trayH = Math.min(w, 520) / 4 * 0.9;
    const size = Math.min(w - 28, h - topBar - trayH - 110, 520);
    this.boardOrigin = { x: (w - size) / 2, y: topBar };
    this.board.container.position.set(this.boardOrigin.x, this.boardOrigin.y);
    this.board.resize(size);
    this.trayOrigin = { x: (w - size) / 2, y: topBar + size + 24 };
    this.tray.container.position.set(this.trayOrigin.x, this.trayOrigin.y);
    this.tray.resize(size);
    this.refresh();
  }

  // --- rendering ---

  private refresh(): void {
    const g = this.game;
    if (!g) return;
    this.board.render(g.state.board, g.state.aux, this.levelTier());
    this.renderTray();
    this.hud.setLevel(
      levelFor(g.state.totalLines),
      (g.state.totalLines % LINES_PER_LEVEL) / LINES_PER_LEVEL,
    );
    // Zen has no leaderboard per spec §6 — never show or track a best score
    this.hud.setScore(g.state.score, g.state.mode === 'zen' ? 0 : storage.getHighScore(g.state.mode));
    this.hud.setStreak(g.state.streak, g.state.misses, streakMultiplier(g.state.streak));
    this.hud.setRushTime(g.state.rushTimeLeft);
    this.hud.setPowerUps(this.inventory, g.state.used, this.armed, !g.state.over);
    this.updateNearDeath();
  }

  private renderTray(): void {
    const g = this.game;
    if (!g) return;
    this.tray.render([...g.state.tray, g.state.hold], this.drag?.slot ?? null, this.levelTier(), this.drag?.overHold ?? false);
  }

  private updateNearDeath(): void {
    const g = this.game;
    this.nearDeathZones.clear();
    if (!g || g.state.over) return;
    const moves = g.totalValidMoves();
    if (moves === 0 && g.canEscapeByHolding()) {
      if (!this.holdEscapeHinted) {
        this.holdEscapeHinted = true;
        this.hud.toast('📥 Nothing fits — drop it on HOLD for a fresh deal', 3000);
      }
    } else {
      this.holdEscapeHinted = false;
    }
    if (moves > 0 && moves <= NEAR_DEATH_MOVES) {
      for (const slot of [0, 1, 2, HOLD_SLOT]) {
        const id = g.pieceAt(slot);
        if (!id) continue;
        const piece = getPiece(id);
        for (let r = 0; r <= BOARD_SIZE - piece.h; r++) {
          for (let c = 0; c <= BOARD_SIZE - piece.w; c++) {
            if (!g.canPlaceAt(slot, c, r)) continue;
            for (const [pc, pr] of piece.cells) {
              this.nearDeathZones.add((r + pr) * BOARD_SIZE + (c + pc));
            }
          }
        }
      }
    }
  }

  private update(dt: number): void {
    this.particles.update(dt);
    this.pulsePhase += dt;
    this.board.renderNearDeath(this.nearDeathZones.size > 0, this.nearDeathZones, this.pulsePhase);
    this.board.renderBombWarnings(this.game && !this.game.state.over ? this.game.state.aux : null, this.pulsePhase);
    this.updateShake(dt);
    const g = this.game;
    if (g && g.state.mode === 'rush' && !g.state.over && !document.hidden) {
      if (g.tickTime(dt)) this.finishGame();
      else this.hud.setRushTime(g.state.rushTimeLeft);
    }
  }

  private shake(seconds: number, amplitude: number): void {
    this.shakeAmp = this.shakeLeft > 0 ? Math.max(this.shakeAmp, amplitude) : amplitude;
    this.shakeLeft = Math.max(this.shakeLeft, seconds);
    this.shakeTotal = this.shakeLeft;
  }

  /** Jolts the board (and tray with it) — decays over the shake window. */
  private updateShake(dt: number): void {
    if (this.shakeLeft <= 0) return;
    this.shakeLeft = Math.max(0, this.shakeLeft - dt);
    const amp = this.shakeAmp * (this.shakeLeft / this.shakeTotal);
    const dx = (Math.random() * 2 - 1) * amp;
    const dy = (Math.random() * 2 - 1) * amp;
    this.board.container.position.set(this.boardOrigin.x + dx, this.boardOrigin.y + dy);
    this.tray.container.position.set(this.trayOrigin.x + dx * 0.5, this.trayOrigin.y + dy * 0.5);
  }

  // --- input ---

  private onPointerDown(e: PointerEvent): void {
    this.audio.unlock();
    const g = this.game;
    if (!g || g.state.over) return;

    if (this.armed === 'hammer') {
      const cell = this.cellFromEvent(e);
      if (cell && this.useArmedHammer(cell.col, cell.row)) return;
    }

    const tx = e.clientX - this.trayOrigin.x;
    const ty = e.clientY - this.trayOrigin.y;
    const slot = this.tray.slotAt(tx, ty);
    if (slot === null || !g.pieceAt(slot)) {
      // tapping a special brick on the board explains what it does
      const cell = this.cellFromEvent(e);
      if (cell) {
        const cellIdx = cell.row * BOARD_SIZE + cell.col;
        const v = g.state.board[cellIdx];
        let info = SPECIAL_TAP_INFO[v];
        if (!info && g.state.aux.wilds.some((center) => wildAura([center]).has(cellIdx))) {
          info = SPECIAL_TAP_INFO[CELL.WILD];
        }
        if (v === CELL.BOMB) {
          const fuse = g.state.aux.bombs[cell.row * BOARD_SIZE + cell.col];
          if (fuse !== undefined) info = `💣 Bomb — ${fuse} placement${fuse === 1 ? '' : 's'} left to clear its line, or it turns to stone`;
        }
        if (info) this.hud.toast(info, 3600);
      }
      return;
    }

    if (this.armed === 'rotate') {
      this.useArmedRotate(slot);
      return;
    }

    const pieceId = g.pieceAt(slot)!;
    const gfx = new Container();
    const shape = new Graphics();
    gfx.addChild(shape);
    const piece = getPiece(pieceId);
    const cs = this.board.cellSize;
    for (const [c, r] of piece.cells) {
      drawBlock(shape, c * cs, r * cs, cs, this.theme.colors[piece.color - 1], this.levelTier());
    }
    this.stage.addChild(gfx);
    this.drag = { slot, pieceId, gfx, col: -1, row: -1, valid: false, overHold: false };
    this.renderTray();
    this.moveDrag(e);
  }

  private onPointerMove(e: PointerEvent): void {
    if (this.drag) this.moveDrag(e);
  }

  private moveDrag(e: PointerEvent): void {
    const d = this.drag!;
    const g = this.game!;
    const piece = getPiece(d.pieceId);
    const cs = this.board.cellSize;
    const px = e.clientX - (piece.w * cs) / 2;
    const py = e.clientY + LIFT_OFFSET - (piece.h * cs) / 2;
    d.gfx.position.set(px, py);
    const col = Math.round((px - this.boardOrigin.x) / cs);
    const row = Math.round((py - this.boardOrigin.y) / cs);
    d.col = col;
    d.row = row;
    // A valid board spot always wins. Only when the lifted piece itself (not
    // the finger, which rides 80px below it) is centred over the hold box
    // does the drop park it — so aiming at the bottom rows never gets hijacked.
    d.valid = g.canPlaceAt(d.slot, col, row);
    const centerX = px + (piece.w * cs) / 2 - this.trayOrigin.x;
    const centerY = py + (piece.h * cs) / 2 - this.trayOrigin.y;
    const overHold = !d.valid && d.slot !== HOLD_SLOT && this.tray.slotAt(centerX, centerY) === HOLD_SLOT;
    if (overHold !== d.overHold) {
      d.overHold = overHold;
      this.renderTray();
    }
    if (overHold) {
      this.board.clearGhost();
      return;
    }
    this.board.renderGhost(
      d.pieceId,
      col,
      row,
      d.valid,
      d.valid ? g.wouldClear(d.slot, col, row) : null,
    );
  }

  private onPointerUp(e: PointerEvent): void {
    const d = this.drag;
    if (!d) return;
    this.moveDrag(e);
    const { slot, col, row, valid, overHold } = d;
    this.cancelDrag();
    if (overHold) this.holdAt(slot);
    else if (valid) this.placeAt(slot, col, row);
    else if (this.game && !this.game.state.over) this.refresh();
  }

  private cancelDrag(): void {
    if (this.drag) {
      this.drag.gfx.destroy({ children: true });
      this.drag = null;
      this.board.clearGhost();
      this.renderTray();
    }
  }

  private cellFromEvent(e: PointerEvent): { col: number; row: number } | null {
    const cs = this.board.cellSize;
    const col = Math.floor((e.clientX - this.boardOrigin.x) / cs);
    const row = Math.floor((e.clientY - this.boardOrigin.y) / cs);
    if (col < 0 || col >= BOARD_SIZE || row < 0 || row >= BOARD_SIZE) return null;
    return { col, row };
  }

  /** Park a tray piece in the hold slot (swapping with what's there). */
  holdAt(slot: number): boolean {
    const g = this.game;
    const outcome = g?.holdPiece(slot);
    if (!g || !outcome) return false;
    nativeHaptic('place');
    this.audio.place();
    this.rescueFx(outcome);
    this.persist();
    this.refresh();
    if (outcome.gameOver) this.finishGame();
    return true;
  }

  /** Full placement pipeline — also the programmatic entry point used by e2e. */
  placeAt(slot: number, col: number, row: number): PlaceResult | null {
    const g = this.game;
    if (!g) return null;
    const result = g.place(slot, col, row);
    if (!result) {
      this.audio.invalid();
      return null;
    }
    if (result.linesCleared > 0) {
      nativeHaptic(result.linesCleared >= 2 ? 'big-clear' : 'clear');
      this.audio.clear(result.linesCleared, g.state.streak);
      this.audio.cheer(result.linesCleared);
      this.celebrate(result.linesCleared, g.state.streak);
      const before = levelFor(g.state.totalLines - result.linesCleared);
      const after = levelFor(g.state.totalLines);
      if (after > before) {
        const unlocked = result.unlocked;
        setTimeout(() => {
          this.hud.cheer(`LEVEL ${after + 1}!`, unlocked.length ? '✨ something new…' : '✨ your blocks evolve', '#ffd166');
          this.audio.perfectClear();
          this.audio.say(`Level ${after + 1}!`);
          this.refresh();
        }, 750);
        if (unlocked.length) setTimeout(() => this.introduceUnlocked(unlocked), 1600);
      }
      this.particles.burst(
        [...result.clearedCells, ...result.shatteredCells],
        result.lines,
        this.board.cellSize,
        0xffffff,
      );
      if (result.blastCenters.length > 0) this.blastFx(result);
      if (result.starburstCells.length > 0 || result.starburstLines.rows.length + result.starburstLines.cols.length > 0) {
        this.particles.burst(result.starburstCells, result.starburstLines, this.board.cellSize, 0xffd166);
        this.shake(BLAST_SHAKE_S, this.board.cellSize * 0.15);
        this.audio.powerUp();
        const extra = result.starburstLines.rows.length + result.starburstLines.cols.length;
        this.hud.toast(`✨ Starburst! +${extra} line${extra === 1 ? '' : 's'}`, 1500);
      }
      if (result.prismCells.length > 0) {
        this.particles.burst(result.prismCells, { rows: [], cols: [] }, this.board.cellSize, 0xbf5bff);
        this.audio.powerUp();
        this.hud.toast(`🔮 Prism! ${result.prismCells.length} blocks shattered, +${result.prismPoints}`, 1500);
      }
      if (result.shatteredCells.length > 0) this.hud.toast('🪨 Stone shattered!', 1200);
    } else {
      nativeHaptic('place');
      this.audio.place();
    }
    if (result.timeGained > 0) {
      this.hud.toast(`⏱ +${result.timeGained} seconds banked!`, 1400);
      this.audio.powerUp();
    }
    if (result.perfectClear) {
      nativeHaptic('perfect');
      this.audio.perfectClear();
      this.audio.say('Perfect clear!');
      this.hud.toast('✨ Perfect Clear! +300');
    }
    this.rescueFx(result);
    for (const kind of result.earned) {
      this.inventory[kind] += 1;
      this.hud.toast(`Power-up earned: ${kind}`);
      this.audio.powerUp();
    }
    storage.setInventory(this.inventory);
    if (g.state.mode !== 'zen') storage.setHighScore(g.state.mode, g.state.score);
    this.persist();
    this.refresh();
    this.introduceHold();
    if (result.gameOver) this.finishGame();
    return result;
  }

  /** Last chance fired: the cracked-away rows burst and the board jolts. */
  private rescueFx(outcome: StuckOutcome): void {
    if (!outcome.lastChance) return;
    nativeHaptic('big-clear');
    this.audio.boom();
    this.shake(RESCUE_SHAKE_S, this.board.cellSize * 0.3);
    this.particles.burst(
      outcome.dissolvedRows.flatMap((r) => Array.from({ length: BOARD_SIZE }, (_, c) => r * BOARD_SIZE + c)),
      { rows: outcome.dissolvedRows, cols: [] },
      this.board.cellSize,
      0xffd166,
    );
    this.hud.cheer('LAST CHANCE!', '🛟 stuck — a row cracked away. Next time it’s game over', '#ffd166');
    this.audio.say('Last chance!');
  }

  /** Bomb went off: flash ring + debris per bomb, board shake, thump. */
  private blastFx(result: PlaceResult): void {
    const cs = this.board.cellSize;
    for (const center of result.blastCenters) this.particles.blast(center, cs);
    this.particles.burst(result.explodedCells, { rows: [], cols: [] }, cs, 0xffd166);
    this.shake(BLAST_SHAKE_S, cs * (0.22 + 0.08 * Math.min(result.blastCenters.length - 1, 3)));
    this.audio.boom();
    nativeHaptic('big-clear');
    const chain = result.blastCenters.length;
    this.hud.toast(chain > 1 ? `💥 CHAIN REACTION ×${chain}!` : `💥 BOOM! ${result.explodedCells.length} blocks blasted`, 1600);
  }

  private levelTier(): number {
    const lines = this.game?.state.totalLines ?? 0;
    return Math.min(4, Math.floor(lines / LINES_PER_LEVEL));
  }

  /** Big on-screen praise scaled to the size of the clear — shown and spoken. */
  private celebrate(lines: number, streak: number): void {
    // word buckets escalate with the size of the clear; pick varies per clear
    const buckets: Array<{ words: string[]; color: string }> = [
      { words: ['Nice!', 'Good one!', 'Sweet!', 'Clean!', 'Smooth!'], color: '#7ee787' },
      {
        words: ['Great! Double clear!', 'Awesome double!', 'Two at once!', 'Slick double!'],
        color: '#4cc9f0',
      },
      {
        words: ['Amazing! Triple!', 'Spectacular!', 'Triple strike!', 'Masterful!'],
        color: '#bf5bff',
      },
      {
        words: ['INCREDIBLE!', 'LEGENDARY!', 'UNSTOPPABLE!', 'ABSOLUTELY EPIC!'],
        color: '#ffd166',
      },
    ];
    const bucket = buckets[Math.min(lines, 4) - 1];
    const text = bucket.words[Math.floor(Math.random() * bucket.words.length)];
    const sub = streak >= 2 ? `🔥 streak ×${streakMultiplier(streak)}` : '';
    this.hud.cheer(text, sub, bucket.color);
    this.audio.say(text.replace(/!+/g, '!'));
  }

  /**
   * A level-up just unlocked new specials: the first time ever on this device
   * each gets a lesson card (one after another); later games get a toast.
   */
  private introduceUnlocked(kinds: SpecialKind[]): void {
    const [kind, ...rest] = kinds;
    if (!kind) return;
    const next = () => this.introduceUnlocked(rest);
    if (storage.markIntroSeen(kind)) {
      this.cancelDrag();
      this.audio.powerUp();
      this.hud.showIntro(kind, () => {
        this.refresh();
        next();
      });
    } else {
      this.hud.toast(UNLOCK_TOAST[kind], 3000);
      next();
    }
  }

  /** One-time tip once the player has seen a second deal. */
  private introduceHold(): void {
    const g = this.game;
    if (!g || g.state.dealNumber < 2) return;
    if (storage.markIntroSeen('hold')) this.hud.toast(HOLD_INTRO, 3200);
  }

  private finishGame(): void {
    const g = this.game!;
    g.state.over = true;
    nativeHaptic('game-over');
    this.audio.gameOver();
    if (g.state.mode !== 'zen') storage.setHighScore(g.state.mode, g.state.score);
    storage.clearSavedGame(g.state.mode);
    let card: string | undefined;
    if (g.state.mode === 'daily') {
      const key = dailyKey(new Date());
      card = shareCard(g.state, new Date());
      storage.setDailyResult(key, g.state.score, card);
    }
    this.hud.showGameOver({
      title: g.state.mode === 'rush' ? "Time's up!" : 'Game Over',
      score: g.state.score,
      high: storage.getHighScore(g.state.mode),
      card,
      shareable: g.state.mode === 'daily',
      canRestart: g.state.mode !== 'daily',
    });
    this.refresh();
  }

  private share(): void {
    const g = this.game;
    const key = dailyKey(new Date());
    const stored = storage.getDailyResult(key);
    const text = stored?.card ?? (g ? shareCard(g.state, new Date()) : '');
    if (!text) return;
    if (navigator.share) {
      void navigator.share({ text }).catch(() => this.copyToClipboard(text));
    } else {
      this.copyToClipboard(text);
    }
  }

  private copyToClipboard(text: string): void {
    void navigator.clipboard?.writeText(text).then(
      () => this.hud.toast('Copied to clipboard'),
      () => undefined,
    );
  }

  // --- power-ups ---

  private handlePowerUp(kind: PowerUpKind): void {
    const g = this.game;
    if (!g || g.state.over || g.usesLeft(kind) <= 0 || this.inventory[kind] <= 0) return;
    switch (kind) {
      case 'swap':
        if (g.useSwap()) this.consumePowerUp('swap');
        break;
      case 'undo':
        if (g.useUndo()) this.consumePowerUp('undo');
        else this.hud.toast('Undo unavailable');
        break;
      case 'rotate':
      case 'hammer':
        this.armed = this.armed === kind ? null : kind;
        this.hud.toast(this.armed ? (kind === 'rotate' ? 'Tap a tray piece' : 'Tap a filled cell') : '');
        break;
    }
    this.refresh();
  }

  private useArmedRotate(slot: number): boolean {
    const g = this.game!;
    if (g.useRotate(slot)) {
      this.armed = null;
      this.consumePowerUp('rotate');
      return true;
    }
    return false;
  }

  private useArmedHammer(col: number, row: number): boolean {
    const g = this.game!;
    if (g.useHammer(col, row)) {
      this.armed = null;
      this.consumePowerUp('hammer');
      return true;
    }
    return false;
  }

  private consumePowerUp(kind: PowerUpKind): void {
    this.inventory[kind] -= 1;
    storage.setInventory(this.inventory);
    this.audio.powerUp();
    this.persist();
    this.refresh();
  }
}
