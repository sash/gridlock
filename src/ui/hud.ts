import type { Mode, PowerUpKind } from '../core/game';
import { THEMES, type Theme } from './theme';
import type { Inventory } from './storage';

const CSS = `
  :root {
    --gl-amber: #ffd166; --gl-cyan: #4cc9f0; --gl-coral: #ff7849;
    --gl-mint: #00bb88; --gl-violet: #9b5de5; --gl-pink: #f15bb5; --gl-blue: #4895ef;
    --gl-ink: #0b0e16; --gl-panel: #151a26; --gl-edge: rgba(255,255,255,0.07);
  }
  .gl-hud { position: fixed; inset: 0; pointer-events: none; font-family: 'Quicksand', -apple-system, system-ui, sans-serif; color: var(--gl-text);
    --gl-panel: var(--gl-theme-panel, #151a26); --gl-edge: var(--gl-theme-edge, rgba(255,255,255,0.07)); --gl-shadow: var(--gl-theme-shadow, rgba(0,0,0,0.4)); }
  /* overlays keep the dark Night-Arcade identity in every theme (their text is fixed light) */
  .gl-overlay { --gl-panel: #151a26; --gl-edge: rgba(255,255,255,0.07); --gl-shadow: rgba(0,0,0,0.4); }

  /* ---------- top bar ---------- */
  .gl-top { position: absolute; top: env(safe-area-inset-top, 0); left: 0; right: 0; display: flex; align-items: center; justify-content: space-between; padding: 10px 14px; }
  .gl-score-wrap { text-align: center; }
  .gl-score { font-family: 'Bungee', 'Quicksand', sans-serif; font-size: 28px; line-height: 1; letter-spacing: 1px; text-shadow: 0 3px 0 var(--gl-shadow); }
  .gl-high { font-size: 11px; font-weight: 700; letter-spacing: 2px; text-transform: uppercase; opacity: 0.55; margin-top: 3px; }
  .gl-flame { font-size: 14px; font-weight: 700; min-width: 64px; text-align: center; transition: opacity 0.4s; pointer-events: auto;
    background: linear-gradient(180deg, rgba(255,120,73,0.22), rgba(255,209,102,0.12)); border: 1px solid rgba(255,150,80,0.35);
    border-radius: 999px; padding: 5px 11px; }
  .gl-flame:empty { background: none; border-color: transparent; }
  .gl-btn { pointer-events: auto; font-family: inherit; background: var(--gl-panel); color: inherit; border: 1px solid var(--gl-edge);
    border-radius: 12px; padding: 8px 13px; font-size: 15px; font-weight: 700;
    box-shadow: 0 3px 0 var(--gl-shadow); transition: transform 0.06s, box-shadow 0.06s; }
  .gl-btn:active { transform: translateY(2px); box-shadow: 0 1px 0 var(--gl-shadow); }
  .gl-timer { position: absolute; top: 0; left: 0; height: 5px; background: linear-gradient(90deg, var(--gl-coral), var(--gl-amber)); border-radius: 0 3px 3px 0; transition: width 0.2s linear; box-shadow: 0 0 12px rgba(255,120,73,0.7); }

  /* ---------- power-up dock ---------- */
  .gl-powerups { position: absolute; bottom: calc(env(safe-area-inset-bottom, 0px) + 10px); left: 0; right: 0; display: flex; justify-content: center; gap: 11px; }
  .gl-pu { pointer-events: auto; position: relative; font-family: inherit; background: var(--gl-panel); border: 1px solid var(--gl-edge);
    border-radius: 14px; width: 58px; height: 58px; font-size: 21px; color: inherit;
    box-shadow: 0 4px 0 var(--gl-shadow); transition: transform 0.06s, box-shadow 0.06s; }
  .gl-pu:active { transform: translateY(2px); box-shadow: 0 2px 0 var(--gl-shadow); }
  .gl-pu[disabled] { opacity: 0.32; box-shadow: 0 2px 0 rgba(0,0,0,0.3); }
  .gl-pu.armed { outline: 2px solid var(--gl-amber); box-shadow: 0 4px 0 var(--gl-shadow), 0 0 16px rgba(255,209,102,0.45); }
  .gl-pu .pu-name { display: block; font-size: 9px; font-weight: 700; letter-spacing: 0.6px; text-transform: uppercase; opacity: 0.7; margin-top: -1px; }
  .gl-pu .count { position: absolute; top: -6px; right: -6px; background: var(--gl-amber); color: #1d1500; font-size: 11px; font-weight: 800; border-radius: 9px; min-width: 18px; height: 18px; line-height: 18px; box-shadow: 0 2px 0 rgba(0,0,0,0.35); }

  /* ---------- overlays ---------- */
  .gl-overlay { position: fixed; inset: 0; height: 100vh; height: 100lvh; height: var(--gl-screen-h, 100lvh); /* full physical screen in iOS standalone */
    display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 13px;
    color: #f2f5ff; pointer-events: auto; padding: 24px; text-align: center;
    background:
      radial-gradient(110% 60% at 50% -5%, rgba(72,149,239,0.16), transparent 60%),
      radial-gradient(90% 50% at 50% 108%, rgba(155,93,229,0.13), transparent 60%),
      repeating-linear-gradient(0deg, transparent 0 35px, rgba(255,255,255,0.022) 35px 36px),
      repeating-linear-gradient(90deg, transparent 0 35px, rgba(255,255,255,0.022) 35px 36px),
      rgba(9, 11, 18, 0.94);
    backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px); }
  .gl-overlay h2 { font-family: 'Bungee', sans-serif; font-size: 24px; font-weight: 400; margin: 0; letter-spacing: 1px; }
  .gl-overlay pre { font-size: 13px; line-height: 1.15; margin: 0; }

  /* logo built from game-block tiles */
  .gl-logo { display: flex; flex-direction: column; align-items: center; gap: 6px; margin-bottom: 8px; }
  .gl-logo .row { display: flex; gap: 6px; }
  .gl-logo .row:last-child { transform: translateX(14px); }
  .gl-logo .tile { font-family: 'Bungee', sans-serif; font-size: 26px; line-height: 1; color: #10131a; width: 44px; height: 44px;
    display: flex; align-items: center; justify-content: center; border-radius: 11px;
    box-shadow: 0 4px 0 rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.35);
    animation: gl-tile-drop 0.5s cubic-bezier(0.2, 1.6, 0.4, 1) backwards; }
  .gl-logo .tile:nth-child(1) { animation-delay: 0.03s; } .gl-logo .tile:nth-child(2) { animation-delay: 0.09s; }
  .gl-logo .tile:nth-child(3) { animation-delay: 0.15s; } .gl-logo .tile:nth-child(4) { animation-delay: 0.21s; }
  .gl-logo .row:last-child .tile:nth-child(1) { animation-delay: 0.27s; } .gl-logo .row:last-child .tile:nth-child(2) { animation-delay: 0.33s; }
  .gl-logo .row:last-child .tile:nth-child(3) { animation-delay: 0.39s; } .gl-logo .row:last-child .tile:nth-child(4) { animation-delay: 0.45s; }
  @keyframes gl-tile-drop { from { opacity: 0; transform: translateY(-34px) scale(0.6); } to { opacity: 1; transform: translateY(0) scale(1); } }
  .gl-tagline { font-size: 12px; font-weight: 700; letter-spacing: 4px; text-transform: uppercase; opacity: 0.5; margin-bottom: 6px; }

  /* mode tiles */
  .gl-overlay .gl-btn { font-size: 17px; padding: 13px 18px; width: min(320px, 86vw); background: var(--gl-panel); }
  .gl-themes .gl-btn, #gl-help-close { width: auto; }
  .gl-overlay .gl-btn.primary { text-align: left; display: flex; flex-direction: column; gap: 2px; position: relative; padding-left: 26px; overflow: hidden; }
  .gl-overlay .gl-btn.primary::before { content: ''; position: absolute; left: 10px; top: 12px; bottom: 12px; width: 6px; border-radius: 4px; background: var(--accent, var(--gl-blue)); box-shadow: 0 0 10px var(--accent, var(--gl-blue)); }
  .gl-overlay .gl-btn.primary > b { font-family: 'Bungee', sans-serif; font-weight: 400; font-size: 16px; letter-spacing: 0.5px; }
  [data-mode="classic"] { --accent: var(--gl-amber); }
  [data-mode="daily"] { --accent: var(--gl-cyan); }
  [data-mode="rush"] { --accent: var(--gl-coral); }
  [data-mode="zen"] { --accent: var(--gl-mint); }
  .gl-mode-desc { display: block; font-size: 12px; font-weight: 600; opacity: 0.6; }

  /* help panel */
  #gl-overlay-help { justify-content: flex-start; padding-top: max(7vh, env(safe-area-inset-top, 0px)); }
  .gl-help-body { max-width: 360px; max-height: 64vh; overflow-y: auto; text-align: left; font-size: 14px; font-weight: 600; line-height: 1.5;
    background: var(--gl-panel); border: 1px solid var(--gl-edge); border-radius: 18px; padding: 16px 18px;
    box-shadow: 0 8px 30px rgba(0,0,0,0.5); }
  .gl-help-body h3 { font-family: 'Bungee', sans-serif; font-weight: 400; margin: 16px 0 6px; font-size: 13px; letter-spacing: 1px; color: var(--gl-amber); }
  .gl-help-body h3 span { font-family: 'Quicksand', sans-serif; letter-spacing: 0; text-transform: none; color: #f2f5ff; }
  .gl-help-body p, .gl-help-body li { margin: 5px 0; opacity: 0.92; }
  .gl-help-body ul { margin: 0; padding-left: 4px; list-style: none; }

  .gl-themes { display: flex; gap: 8px; margin-top: 4px; }
  .gl-themes .gl-btn { min-width: 0; font-size: 14px; }
  .gl-themes .gl-btn.active { outline: 2px solid var(--gl-amber); }

  /* ---------- feedback ---------- */
  .gl-glow { position: fixed; inset: 0; height: 100vh; height: 100lvh; height: var(--gl-screen-h, 100lvh); pointer-events: none; opacity: 0; transition: opacity 0.5s; box-shadow: inset 0 0 70px 14px var(--gl-coral); }
  .gl-toast { position: fixed; top: 17%; left: 50%; transform: translateX(-50%); background: rgba(17,21,32,0.95); color: #f2f5ff;
    border: 1px solid var(--gl-edge); border-left: 4px solid var(--gl-amber);
    padding: 11px 18px; border-radius: 14px; font-weight: 700; font-size: 14px; opacity: 0; transition: opacity 0.3s; pointer-events: none;
    max-width: 80vw; text-align: left; z-index: 5; box-shadow: 0 6px 24px rgba(0,0,0,0.45); }
  .gl-cheer { position: fixed; top: 26%; left: 0; right: 0; text-align: center; font-family: 'Bungee', sans-serif; font-size: 38px;
    letter-spacing: 1px; pointer-events: none; opacity: 0; text-shadow: 0 4px 0 rgba(0,0,0,0.4), 0 0 30px rgba(255,255,255,0.25); }
  .gl-cheer .sub { display: block; font-family: 'Quicksand', sans-serif; font-size: 16px; font-weight: 700; opacity: 0.9; margin-top: 4px; }
  .gl-cheer.pop { animation: gl-cheer-pop 1.1s ease-out; }
  @keyframes gl-cheer-pop {
    0% { opacity: 0; transform: scale(0.5) rotate(-3deg); }
    18% { opacity: 1; transform: scale(1.12) rotate(1.5deg); }
    30% { transform: scale(1) rotate(0deg); }
    75% { opacity: 1; transform: scale(1) translateY(0); }
    100% { opacity: 0; transform: scale(1) translateY(-26px); }
  }
  /* add-to-home-screen hint (iOS Safari, browser mode only) */
  .gl-install { position: fixed; left: 50%; transform: translateX(-50%); bottom: calc(env(safe-area-inset-bottom, 0px) + 84px);
    width: min(340px, 88vw); background: var(--gl-panel); border: 1px solid var(--gl-edge); border-radius: 16px;
    padding: 12px 14px; display: flex; gap: 10px; align-items: center; pointer-events: auto; z-index: 6;
    box-shadow: 0 8px 28px rgba(0,0,0,0.45); font-size: 13px; font-weight: 600; line-height: 1.45; text-align: left;
    animation: gl-install-in 0.45s cubic-bezier(0.2, 1.4, 0.4, 1) 1.2s backwards; }
  .gl-install .icon { font-size: 22px; }
  .gl-install b { color: var(--gl-amber); }
  .gl-install .close { flex: none; pointer-events: auto; background: rgba(128,128,128,0.18); border: none; border-radius: 10px;
    width: 30px; height: 30px; font-size: 14px; font-weight: 800; color: inherit; }
  @keyframes gl-install-in { from { opacity: 0; transform: translateX(-50%) translateY(24px); } to { opacity: 1; transform: translateX(-50%) translateY(0); } }
  .hidden { display: none !important; }
`;

const PU_ICONS: Record<PowerUpKind, string> = { rotate: '🔄', swap: '🔀', hammer: '🔨', undo: '↩️' };
const PU_INFO: Record<PowerUpKind, { name: string; desc: string }> = {
  rotate: { name: 'Rotate', desc: 'Tap it, then tap a tray piece to turn it 90°.' },
  swap: { name: 'Swap', desc: 'Replace all 3 tray pieces with a fresh deal.' },
  hammer: { name: 'Hammer', desc: 'Tap it, then tap any filled cell to smash it.' },
  undo: { name: 'Undo', desc: 'Take back your last placement (not after a clear).' },
};
const MODES: Array<{ mode: Mode; label: string; desc: string }> = [
  { mode: 'classic', label: 'Classic', desc: 'Endless — chase your high score' },
  { mode: 'daily', label: 'Daily Puzzle', desc: 'Same puzzle for everyone · one try per day · share your result' },
  { mode: 'rush', label: 'Rush', desc: '90 seconds · pieces refill instantly · go fast' },
  { mode: 'zen', label: 'Zen', desc: 'No game over, no pressure — just placing blocks' },
];

export interface HudCallbacks {
  onSelectMode(mode: Mode): void;
  onPowerUp(kind: PowerUpKind): void;
  onMenu(): void;
  onRestart(): void;
  onShare(): void;
  onTheme(id: string): void;
}

export class Hud {
  private root: HTMLElement;
  private themeBgCss = '#10131a';
  private glowOn = false;

  constructor(parent: HTMLElement, cb: HudCallbacks) {
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);

    this.root = document.createElement('div');
    this.root.className = 'gl-hud';
    this.root.innerHTML = `
      <div class="gl-timer hidden" id="gl-timer"></div>
      <div class="gl-top">
        <div style="display:flex;gap:8px">
          <button class="gl-btn" id="gl-menu-btn">☰</button>
          <button class="gl-btn" id="gl-help-btn-game" aria-label="How to play">?</button>
        </div>
        <div class="gl-score-wrap">
          <div class="gl-score" id="gl-score">0</div>
          <div class="gl-high" id="gl-high"></div>
        </div>
        <div class="gl-flame" id="gl-flame"></div>
      </div>
      <div class="gl-powerups" id="gl-powerups">
        ${(Object.keys(PU_ICONS) as PowerUpKind[])
          .map(
            (k) =>
              `<button class="gl-pu" data-pu="${k}" aria-label="${k}" title="${PU_INFO[k].desc}">${PU_ICONS[k]}<span class="pu-name">${PU_INFO[k].name}</span><span class="count" data-count="${k}">0</span></button>`,
          )
          .join('')}
      </div>
      <div class="gl-install hidden" id="gl-install">
        <span class="icon">📲</span>
        <span>Get the full-screen experience: tap <b>Share</b> <span style="opacity:.8">(the square with the arrow)</span> then <b>Add to Home Screen</b>.</span>
        <button class="close" id="gl-install-close" aria-label="Dismiss">✕</button>
      </div>
      <div class="gl-glow" id="gl-glow"></div>
      <div class="gl-cheer" id="gl-cheer"></div>
      <div class="gl-toast" id="gl-toast"></div>
      <div class="gl-overlay" id="gl-overlay-menu">
        <div class="gl-logo" aria-label="GridLock">
          <div class="row">
            <span class="tile" style="background:var(--gl-amber)">G</span><span class="tile" style="background:var(--gl-cyan)">R</span><span class="tile" style="background:var(--gl-pink)">I</span><span class="tile" style="background:var(--gl-mint)">D</span>
          </div>
          <div class="row">
            <span class="tile" style="background:var(--gl-violet)">L</span><span class="tile" style="background:var(--gl-coral)">O</span><span class="tile" style="background:var(--gl-blue)">C</span><span class="tile" style="background:var(--gl-amber)">K</span>
          </div>
        </div>
        <div class="gl-tagline">every block counts</div>
        ${MODES.map(
          (m) =>
            `<button class="gl-btn primary" data-mode="${m.mode}"><b>${m.label}</b><span class="gl-mode-desc">${m.desc}</span></button>`,
        ).join('')}
        <button class="gl-btn hidden" id="gl-newgame-btn">🔁 New game</button>
        <button class="gl-btn" id="gl-help-btn-menu">❓ How to play</button>
        <div class="gl-themes" id="gl-themes">
          ${THEMES.map((t) => `<button class="gl-btn" data-theme="${t.id}">${t.label}</button>`).join('')}
        </div>
      </div>
      <div class="gl-overlay hidden" id="gl-overlay-help">
        <h2>How to play</h2>
        <div class="gl-help-body">
          <p>Drag pieces from the tray onto the board. Fill a whole <b>row or column</b> to clear
          it. Pieces can't be rotated — each deal is a little puzzle. The game ends when no
          remaining piece fits anywhere.</p>
          <h3>Scoring</h3>
          <ul>
            <li>▪️ 1 point per cell placed</li>
            <li>▪️ Clears: 1 line = 80 · 2 = 200 · 3 = 450 · 4+ = 800 and up</li>
            <li>🔥 Back-to-back clears build a streak that multiplies line points, up to ×5.
            It survives exactly one placement without a clear — the flame dims as a warning.
            When the screen edges glow warm, your streak is hot (×2.5+).</li>
            <li>✨ Emptying the entire board: +300 Perfect Clear</li>
          </ul>
          <h3>Special cells <span style="font-weight:400;opacity:.7">(appear as you play)</span></h3>
          <ul>
            <li>💎 <b>Gem</b> — clear its line for +150 points.</li>
            <li>🧊 <b>Ice</b> — takes two clears: the first cracks it, the second removes it.</li>
            <li>💣 <b>Bomb</b> — the number counts your placements. Clear its line in time and it
            blasts a 3×3 area free; let it hit 0 and it petrifies…</li>
            <li>🪨 <b>Stone</b> — can't be cleared. Crumbles by itself after 15 placements.</li>
            <li>🌈 <b>Wild</b> — earned by a 3-line clear; helps complete both its row and its column.</li>
          </ul>
          <h3>Power-ups <span style="font-weight:400;opacity:.7">(bottom bar, one use each per game)</span></h3>
          <ul>
            ${(Object.keys(PU_INFO) as PowerUpKind[])
              .map((k) => `<li>${PU_ICONS[k]} <b>${PU_INFO[k].name}</b> — ${PU_INFO[k].desc}</li>`)
              .join('')}
          </ul>
          <p style="opacity:.75">Earn more by playing daily, reaching a ×5 streak, or landing a Perfect Clear.</p>
        </div>
        <button class="gl-btn primary" id="gl-help-close">Got it</button>
      </div>
      <div class="gl-overlay hidden" id="gl-overlay-over">
        <h2 id="gl-over-title">Game Over</h2>
        <div id="gl-over-score"></div>
        <pre id="gl-over-card"></pre>
        <button class="gl-btn primary" id="gl-again-btn">Play again</button>
        <button class="gl-btn hidden" id="gl-share-btn">Share</button>
        <button class="gl-btn" id="gl-over-menu-btn">Menu</button>
      </div>
    `;
    parent.appendChild(this.root);

    this.el('gl-menu-btn').addEventListener('click', () => cb.onMenu());
    this.el('gl-newgame-btn').addEventListener('click', () => cb.onRestart());
    this.el('gl-flame').addEventListener('click', () => {
      if (this.el('gl-flame').textContent) {
        this.toast('🔥 Streak: clear lines back-to-back to multiply line points, up to ×5. It survives one miss — the dim flame is your warning. The glowing screen edge means you’re hot (×2.5+).', 4200);
      }
    });
    this.el('gl-help-btn-game').addEventListener('click', () => this.showHelp());
    this.el('gl-help-btn-menu').addEventListener('click', () => this.showHelp());
    this.el('gl-help-close').addEventListener('click', () => {
      this.el('gl-overlay-help').classList.add('hidden');
      this.paintRoot();
    });
    this.el('gl-again-btn').addEventListener('click', () => cb.onRestart());
    this.el('gl-share-btn').addEventListener('click', () => cb.onShare());
    this.el('gl-over-menu-btn').addEventListener('click', () => cb.onMenu());
    this.root.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach((b) =>
      b.addEventListener('click', () => cb.onSelectMode(b.dataset.mode as Mode)),
    );
    this.root.querySelectorAll<HTMLButtonElement>('[data-theme]').forEach((b) =>
      b.addEventListener('click', () => cb.onTheme(b.dataset.theme!)),
    );
    this.root.querySelectorAll<HTMLButtonElement>('[data-pu]').forEach((b) =>
      b.addEventListener('click', () => cb.onPowerUp(b.dataset.pu as PowerUpKind)),
    );
  }

  private el(id: string): HTMLElement {
    return this.root.querySelector(`#${id}`)!;
  }

  /**
   * iOS standalone refuses to paint fixed elements in the strip below the
   * layout viewport — only the document root's background reaches it. Keep the
   * root in sync with whatever should cover the full screen right now.
   */
  private paintRoot(): void {
    const anyOverlayOpen = ['gl-overlay-menu', 'gl-overlay-over', 'gl-overlay-help'].some(
      (id) => !this.el(id).classList.contains('hidden'),
    );
    const html = document.documentElement.style;
    if (anyOverlayOpen) {
      html.background = '#090b12';
    } else if (this.glowOn) {
      html.background = `linear-gradient(180deg, ${this.themeBgCss} 55%, #ff7849 170%)`;
    } else {
      html.background = this.themeBgCss;
    }
  }

  applyTheme(theme: Theme): void {
    this.themeBgCss = `#${theme.background.toString(16).padStart(6, '0')}`;
    document.body.style.background = this.themeBgCss;
    this.paintRoot();
    this.root.style.setProperty('--gl-text', `#${theme.text.toString(16).padStart(6, '0')}`);
    this.root.style.setProperty('--gl-theme-panel', theme.panelCss);
    this.root.style.setProperty('--gl-theme-edge', theme.edgeCss);
    this.root.style.setProperty('--gl-theme-shadow', theme.shadowCss);
    this.root
      .querySelectorAll<HTMLButtonElement>('[data-theme]')
      .forEach((b) => b.classList.toggle('active', b.dataset.theme === theme.id));
  }

  setScore(score: number, high: number): void {
    this.el('gl-score').textContent = String(score);
    this.el('gl-high').textContent = high > 0 ? `Best ${high}` : '';
  }

  /** Flame meter: shows the multiplier, "cools" (fades) during the grace placement. */
  setStreak(streak: number, grace: boolean, multiplier: number): void {
    const flame = this.el('gl-flame');
    // glow strictly tracks the live multiplier — it must die with the streak
    this.glowOn = streak > 0 && multiplier >= 2.5;
    this.el('gl-glow').style.opacity = this.glowOn ? '1' : '0';
    this.paintRoot();
    if (streak <= 0) {
      flame.textContent = '';
      return;
    }
    flame.textContent = `🔥 ×${multiplier}`;
    flame.style.opacity = grace ? '0.35' : '1';
  }

  setRushTime(secondsLeft: number | null): void {
    const bar = this.el('gl-timer');
    bar.classList.toggle('hidden', secondsLeft === null);
    if (secondsLeft !== null) bar.style.width = `${(secondsLeft / 90) * 100}%`;
  }

  setPowerUps(inv: Inventory, used: Record<PowerUpKind, boolean>, armed: PowerUpKind | null, visible: boolean): void {
    const wrap = this.el('gl-powerups');
    wrap.classList.toggle('hidden', !visible);
    for (const k of Object.keys(PU_ICONS) as PowerUpKind[]) {
      const btn = this.root.querySelector<HTMLButtonElement>(`[data-pu="${k}"]`)!;
      const count = this.root.querySelector<HTMLElement>(`[data-count="${k}"]`)!;
      count.textContent = String(inv[k]);
      btn.disabled = used[k] || inv[k] <= 0;
      btn.classList.toggle('armed', armed === k);
    }
  }

  showMenu(restartLabel: string | null = null): void {
    this.el('gl-overlay-menu').classList.remove('hidden');
    this.el('gl-overlay-over').classList.add('hidden');
    const btn = this.el('gl-newgame-btn');
    btn.classList.toggle('hidden', restartLabel === null);
    if (restartLabel !== null) btn.textContent = restartLabel;
    this.paintRoot();
  }

  showHelp(): void {
    this.el('gl-overlay-help').classList.remove('hidden');
    this.paintRoot();
  }

  /** iOS-browser-only nudge to install the PWA. */
  showInstallHint(onDismiss: () => void): void {
    const hint = this.el('gl-install');
    hint.classList.remove('hidden');
    this.el('gl-install-close').addEventListener(
      'click',
      () => {
        hint.classList.add('hidden');
        onDismiss();
      },
      { once: true },
    );
  }

  /** Bottom edge of the top HUD bar in CSS px — the board must start below it. */
  topBarBottom(): number {
    return this.root.querySelector('.gl-top')!.getBoundingClientRect().bottom;
  }

  hideOverlays(): void {
    this.el('gl-overlay-menu').classList.add('hidden');
    this.el('gl-overlay-over').classList.add('hidden');
    this.el('gl-overlay-help').classList.add('hidden');
    this.paintRoot();
  }

  showGameOver(opts: { title: string; score: number; high: number; card?: string; shareable: boolean; canRestart: boolean }): void {
    this.el('gl-overlay-menu').classList.add('hidden');
    this.el('gl-overlay-over').classList.remove('hidden');
    this.el('gl-over-title').textContent = opts.title;
    this.el('gl-over-score').textContent = `Score ${opts.score} · Best ${opts.high}`;
    this.el('gl-over-card').textContent = opts.card ?? '';
    this.el('gl-share-btn').classList.toggle('hidden', !opts.shareable);
    this.el('gl-again-btn').classList.toggle('hidden', !opts.canRestart);
    this.paintRoot();
  }

  /** Big animated celebration text over the board (clears, combos). */
  cheer(text: string, sub: string, color: string): void {
    const el = this.el('gl-cheer');
    el.innerHTML = `${text}${sub ? `<span class="sub">${sub}</span>` : ''}`;
    el.style.color = color;
    el.classList.remove('pop');
    void el.offsetWidth; // restart the CSS animation
    el.classList.add('pop');
  }

  toast(message: string, durationMs = 1600): void {
    const t = this.el('gl-toast');
    t.textContent = message;
    t.style.opacity = '1';
    setTimeout(() => (t.style.opacity = '0'), durationMs);
  }
}
