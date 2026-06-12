import { Application, Container, Graphics } from 'pixi.js';
import { Game, type Mode, type PlaceResult, type PowerUpKind } from '../core/game';
import { BOARD_SIZE, CELL } from '../core/board';
import { getPiece } from '../core/pieces';
import { streakMultiplier } from '../core/scoring';
import { dailyKey, dailySeed, shareCard } from '../core/daily';
import { BoardView, ParticleSystem, TrayView } from './views';
import { Hud } from './hud';
import { GameAudio } from './audio';
import { getTheme, type Theme } from './theme';
import * as storage from './storage';

const LIFT_OFFSET = -80; // px above the finger so the thumb doesn't hide the piece
const NEAR_DEATH_MOVES = 2;

/** Haptic cues forwarded to the React Native shell (no-op on the web). */
function nativeHaptic(kind: 'place' | 'clear' | 'big-clear' | 'perfect' | 'game-over'): void {
  const bridge = (window as { ReactNativeWebView?: { postMessage(msg: string): void } })
    .ReactNativeWebView;
  bridge?.postMessage(JSON.stringify({ type: 'haptic', kind }));
}

/** Shown once, the first time each special cell ever appears on the board. */
const SPECIAL_INTROS: Array<[number, string]> = [
  [CELL.GEM, '💎 A gem! Clear its line for +150'],
  [CELL.ICE, '🧊 Ice! It takes two clears to remove'],
  [CELL.BOMB, '💣 A bomb! Clear its line before the counter hits 0'],
  [CELL.STONE, '🪨 Petrified! Stone can’t be cleared for 15 placements'],
  [CELL.WILD, '🌈 Wild earned! It completes both its row and column'],
];

/** Shown when the player taps a special brick on the board. */
const SPECIAL_TAP_INFO: Record<number, string> = {
  [CELL.GEM]: '💎 Gem — clear its row or column for +150 points',
  [CELL.ICE]: '🧊 Ice — needs two clears: first cracks it, second removes it',
  [CELL.CRACKED]: '🧊 Cracked ice — one more clear removes it',
  [CELL.BOMB]: '💣 Bomb — clear its line before the counter reaches 0 to blast a 3×3 area; too late and it turns to stone',
  [CELL.STONE]: '🪨 Stone — can’t be cleared; it crumbles on its own after 15 placements',
  [CELL.WILD]: '🌈 Wild — counts as filled for both its row and its column',
};

interface DragState {
  slot: number;
  pieceId: string;
  gfx: Graphics;
  col: number;
  row: number;
  valid: boolean;
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
  private pulsePhase = 0;
  private boardOrigin = { x: 0, y: 0 };
  private trayOrigin = { x: 0, y: 0 };

  constructor(private app: Application) {
    this.theme = getTheme(storage.getThemeId());
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
      onRestart: () => this.restart(),
      onShare: () => this.share(),
      onTheme: (id) => this.setTheme(id),
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
    this.hud.showMenu(canRestart ? `🔁 New game (${g!.state.mode})` : null);
  }

  private setTheme(id: string): void {
    storage.setThemeId(id);
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
    const w = window.innerWidth;
    const h = window.innerHeight;
    // Measure the real HUD bar: in standalone PWA mode on iPhone the safe-area
    // inset pushes it well below a hardcoded offset, overlapping the board.
    const topBar = this.hud.topBarBottom() + 12;

    if (w > h) {
      // landscape: board sized by height, tray as a vertical column beside it
      const size = Math.min(h - topBar - 88, w * 0.5, 520);
      const trayLen = size; // 3 stacked slots, each size/3 tall
      const trayW = size / 3;
      const totalW = size + 28 + trayW;
      const x0 = (w - totalW) / 2;
      this.boardOrigin = { x: x0, y: topBar };
      this.trayOrigin = { x: x0 + size + 28, y: topBar };
      this.board.container.position.set(this.boardOrigin.x, this.boardOrigin.y);
      this.board.resize(size);
      this.tray.container.position.set(this.trayOrigin.x, this.trayOrigin.y);
      this.tray.resize(trayLen, true);
      this.refresh();
      return;
    }

    const trayH = Math.min(w, 520) / 3 * 0.9;
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
    this.board.render(g.state.board, g.state.aux);
    this.tray.render(g.state.tray, this.drag?.slot ?? null);
    // Zen has no leaderboard per spec §6 — never show or track a best score
    this.hud.setScore(g.state.score, g.state.mode === 'zen' ? 0 : storage.getHighScore(g.state.mode));
    this.hud.setStreak(g.state.streak, g.state.grace, streakMultiplier(g.state.streak));
    this.hud.setRushTime(g.state.rushTimeLeft);
    this.hud.setPowerUps(this.inventory, g.state.used, this.armed, !g.state.over);
    this.updateNearDeath();
  }

  private updateNearDeath(): void {
    const g = this.game;
    this.nearDeathZones.clear();
    if (!g || g.state.over) return;
    const moves = g.totalValidMoves();
    if (moves > 0 && moves <= NEAR_DEATH_MOVES) {
      for (let slot = 0; slot < 3; slot++) {
        const id = g.state.tray[slot];
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
    const g = this.game;
    if (g && g.state.mode === 'rush' && !g.state.over && !document.hidden) {
      if (g.tickTime(dt)) this.finishGame();
      else this.hud.setRushTime(g.state.rushTimeLeft);
    }
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
    if (slot === null || !g.state.tray[slot]) {
      // tapping a special brick on the board explains what it does
      const cell = this.cellFromEvent(e);
      if (cell) {
        const v = g.state.board[cell.row * BOARD_SIZE + cell.col];
        let info = SPECIAL_TAP_INFO[v];
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

    const pieceId = g.state.tray[slot]!;
    const gfx = new Graphics();
    const piece = getPiece(pieceId);
    const cs = this.board.cellSize;
    for (const [c, r] of piece.cells) {
      gfx
        .roundRect(c * cs + 2, r * cs + 2, cs - 4, cs - 4, cs * 0.18)
        .fill(this.theme.colors[piece.color - 1]);
    }
    this.stage.addChild(gfx);
    this.drag = { slot, pieceId, gfx, col: -1, row: -1, valid: false };
    this.tray.render(g.state.tray, slot);
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
    d.valid = g.canPlaceAt(d.slot, col, row);
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
    const { slot, col, row, valid } = d;
    this.cancelDrag();
    if (valid) this.placeAt(slot, col, row);
    else if (this.game && !this.game.state.over) this.refresh();
  }

  private cancelDrag(): void {
    if (this.drag) {
      this.drag.gfx.destroy();
      this.drag = null;
      this.board.clearGhost();
      if (this.game) this.tray.render(this.game.state.tray, null);
    }
  }

  private cellFromEvent(e: PointerEvent): { col: number; row: number } | null {
    const cs = this.board.cellSize;
    const col = Math.floor((e.clientX - this.boardOrigin.x) / cs);
    const row = Math.floor((e.clientY - this.boardOrigin.y) / cs);
    if (col < 0 || col >= BOARD_SIZE || row < 0 || row >= BOARD_SIZE) return null;
    return { col, row };
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
      this.particles.burst(
        [...result.clearedCells, ...result.explodedCells],
        result.lines,
        this.board.cellSize,
        0xffffff,
      );
    } else {
      nativeHaptic('place');
      this.audio.place();
    }
    if (result.perfectClear) {
      nativeHaptic('perfect');
      this.audio.perfectClear();
      this.audio.say('Perfect clear!');
      this.hud.toast('✨ Perfect Clear! +300');
    }
    for (const kind of result.earned) {
      this.inventory[kind] += 1;
      this.hud.toast(`Power-up earned: ${kind}`);
      this.audio.powerUp();
    }
    storage.setInventory(this.inventory);
    if (g.state.mode !== 'zen') storage.setHighScore(g.state.mode, g.state.score);
    this.persist();
    this.refresh();
    this.introduceSpecials();
    if (result.gameOver) this.finishGame();
    return result;
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

  /** One-time explainer toast when a special cell type shows up for the first time. */
  private introduceSpecials(): void {
    const g = this.game;
    if (!g) return;
    let seen: number[];
    try {
      seen = JSON.parse(localStorage.getItem('gridlock.seenSpecials') ?? '[]') as number[];
    } catch {
      seen = [];
    }
    for (const [cell, message] of SPECIAL_INTROS) {
      if (seen.includes(cell) || !g.state.board.includes(cell)) continue;
      this.hud.toast(message, 3200);
      seen.push(cell);
      try {
        localStorage.setItem('gridlock.seenSpecials', JSON.stringify(seen));
      } catch {
        // storage unavailable — they'll see the toast again next time
      }
      break; // one lesson at a time
    }
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
    if (!g || g.state.over || g.state.used[kind] || this.inventory[kind] <= 0) return;
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
