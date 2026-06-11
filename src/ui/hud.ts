import type { Mode, PowerUpKind } from '../core/game';
import { THEMES, type Theme } from './theme';
import type { Inventory } from './storage';

const CSS = `
  .gl-hud { position: fixed; inset: 0; pointer-events: none; font-family: -apple-system, system-ui, sans-serif; color: var(--gl-text); }
  .gl-top { position: absolute; top: env(safe-area-inset-top, 0); left: 0; right: 0; display: flex; align-items: center; justify-content: space-between; padding: 10px 14px; }
  .gl-score-wrap { text-align: center; }
  .gl-score { font-size: 30px; font-weight: 800; line-height: 1; }
  .gl-high { font-size: 12px; opacity: 0.6; }
  .gl-flame { font-size: 16px; font-weight: 700; min-width: 64px; text-align: right; transition: opacity 0.4s; }
  .gl-btn { pointer-events: auto; background: rgba(128,128,128,0.18); color: inherit; border: none; border-radius: 10px; padding: 8px 12px; font-size: 15px; font-weight: 600; }
  .gl-btn:active { transform: scale(0.96); }
  .gl-timer { position: absolute; top: 0; left: 0; height: 4px; background: #ff7849; transition: width 0.2s linear; }
  .gl-powerups { position: absolute; bottom: calc(env(safe-area-inset-bottom, 0px) + 10px); left: 0; right: 0; display: flex; justify-content: center; gap: 10px; }
  .gl-pu { pointer-events: auto; position: relative; background: rgba(128,128,128,0.18); border: none; border-radius: 12px; width: 54px; height: 54px; font-size: 22px; color: inherit; }
  .gl-pu[disabled] { opacity: 0.35; }
  .gl-pu.armed { outline: 2px solid #ffd166; }
  .gl-pu .count { position: absolute; top: -4px; right: -4px; background: #ffd166; color: #222; font-size: 11px; font-weight: 800; border-radius: 9px; min-width: 18px; height: 18px; line-height: 18px; }
  .gl-overlay { position: fixed; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 14px; background: rgba(8,10,16,0.86); color: #fff; pointer-events: auto; padding: 24px; text-align: center; }
  .gl-overlay h1 { font-size: 40px; margin: 0; letter-spacing: 1px; }
  .gl-overlay h2 { font-size: 26px; margin: 0; }
  .gl-overlay .gl-btn { font-size: 18px; padding: 14px 22px; min-width: 220px; background: rgba(255,255,255,0.14); }
  .gl-overlay .gl-btn.primary { background: #4895ef; }
  .gl-overlay pre { font-size: 13px; line-height: 1.15; margin: 0; }
  .gl-themes { display: flex; gap: 8px; }
  .gl-themes .gl-btn { min-width: 0; }
  .gl-themes .gl-btn.active { outline: 2px solid #ffd166; }
  .gl-glow { position: fixed; inset: 0; pointer-events: none; opacity: 0; transition: opacity 0.5s; box-shadow: inset 0 0 60px 12px #ff7849; }
  .gl-toast { position: fixed; top: 18%; left: 50%; transform: translateX(-50%); background: rgba(20,24,34,0.92); color: #fff; padding: 10px 18px; border-radius: 12px; font-weight: 700; opacity: 0; transition: opacity 0.3s; pointer-events: none; }
  .hidden { display: none !important; }
`;

const PU_ICONS: Record<PowerUpKind, string> = { rotate: '🔄', swap: '🔀', hammer: '🔨', undo: '↩️' };
const MODES: Array<{ mode: Mode; label: string }> = [
  { mode: 'classic', label: 'Classic' },
  { mode: 'daily', label: 'Daily Puzzle' },
  { mode: 'rush', label: 'Rush — 90s' },
  { mode: 'zen', label: 'Zen' },
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

  constructor(parent: HTMLElement, cb: HudCallbacks) {
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);

    this.root = document.createElement('div');
    this.root.className = 'gl-hud';
    this.root.innerHTML = `
      <div class="gl-timer hidden" id="gl-timer"></div>
      <div class="gl-top">
        <button class="gl-btn" id="gl-menu-btn">☰</button>
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
              `<button class="gl-pu" data-pu="${k}" aria-label="${k}">${PU_ICONS[k]}<span class="count" data-count="${k}">0</span></button>`,
          )
          .join('')}
      </div>
      <div class="gl-glow" id="gl-glow"></div>
      <div class="gl-toast" id="gl-toast"></div>
      <div class="gl-overlay" id="gl-overlay-menu">
        <h1>GridLock</h1>
        ${MODES.map((m) => `<button class="gl-btn primary" data-mode="${m.mode}">${m.label}</button>`).join('')}
        <div class="gl-themes" id="gl-themes">
          ${THEMES.map((t) => `<button class="gl-btn" data-theme="${t.id}">${t.label}</button>`).join('')}
        </div>
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

  applyTheme(theme: Theme): void {
    document.body.style.background = `#${theme.background.toString(16).padStart(6, '0')}`;
    this.root.style.setProperty('--gl-text', `#${theme.text.toString(16).padStart(6, '0')}`);
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
    if (streak <= 0) {
      flame.textContent = '';
      return;
    }
    flame.textContent = `🔥 ×${multiplier}`;
    flame.style.opacity = grace ? '0.35' : '1';
    this.el('gl-glow').style.opacity = multiplier >= 2.5 ? '1' : '0';
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

  showMenu(): void {
    this.el('gl-overlay-menu').classList.remove('hidden');
    this.el('gl-overlay-over').classList.add('hidden');
  }

  hideOverlays(): void {
    this.el('gl-overlay-menu').classList.add('hidden');
    this.el('gl-overlay-over').classList.add('hidden');
  }

  showGameOver(opts: { title: string; score: number; high: number; card?: string; shareable: boolean; canRestart: boolean }): void {
    this.el('gl-overlay-menu').classList.add('hidden');
    this.el('gl-overlay-over').classList.remove('hidden');
    this.el('gl-over-title').textContent = opts.title;
    this.el('gl-over-score').textContent = `Score ${opts.score} · Best ${opts.high}`;
    this.el('gl-over-card').textContent = opts.card ?? '';
    this.el('gl-share-btn').classList.toggle('hidden', !opts.shareable);
    this.el('gl-again-btn').classList.toggle('hidden', !opts.canRestart);
  }

  toast(message: string): void {
    const t = this.el('gl-toast');
    t.textContent = message;
    t.style.opacity = '1';
    setTimeout(() => (t.style.opacity = '0'), 1600);
  }
}
