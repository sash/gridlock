import { Application } from 'pixi.js';
import { GameApp } from './ui/app';
import { getTheme } from './ui/theme';
import { installScreenHeight } from './ui/viewport';

declare global {
  interface Window {
    __game?: GameApp;
  }
}

async function boot(): Promise<void> {
  installScreenHeight();

  // the #app element is sized to the real screen (see index.html) — let the
  // renderer follow it rather than the possibly-short window
  const host = document.getElementById('app')!;
  const app = new Application();
  await app.init({
    resizeTo: host,
    resolution: Math.min(window.devicePixelRatio || 1, 2), // DPR 3 is wasted battery on flat shapes
    autoDensity: true,
    antialias: true,
    background: getTheme(
      window.matchMedia('(prefers-color-scheme: light)').matches ? 'paper' : 'night',
    ).background,
    preference: 'webgl', // WebGL2 with automatic WebGL1 fallback
  });
  host.appendChild(app.canvas);

  window.__game = new GameApp(app);

  const inNativeShell = typeof (window as { ReactNativeWebView?: unknown }).ReactNativeWebView !== 'undefined';
  if ('serviceWorker' in navigator && import.meta.env.PROD && !inNativeShell) {
    // relative path: works on subpath hosting (github.io/gridlock/)
    const reg = await navigator.serviceWorker.register('./sw.js').catch(() => null);
    // check for a new build every time the app comes back to the foreground
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') void reg?.update();
    });
    // when an updated worker takes control, reload once to run the new build
    // (safe: game state persists to localStorage on every placement)
    let reloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloaded) return;
      reloaded = true;
      location.reload();
    });
  }
}

void boot();
