import { Application } from 'pixi.js';
import { GameApp } from './ui/app';
import { getTheme } from './ui/theme';
import { getThemeId } from './ui/storage';

declare global {
  interface Window {
    __game?: GameApp;
  }
}

async function boot(): Promise<void> {
  // Installed-app mode on iOS can report a layout viewport shorter than the
  // physical screen, leaving a dead strip at the bottom that fixed elements
  // (overlays, streak glow) don't cover. Measure the real screen instead.
  const standalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true;
  if (standalone) {
    const setScreenH = () =>
      document.documentElement.style.setProperty(
        '--gl-screen-h',
        `${Math.max(screen.height, window.innerHeight)}px`,
      );
    setScreenH();
    window.addEventListener('resize', setScreenH);
  }

  const app = new Application();
  await app.init({
    resizeTo: window,
    resolution: Math.min(window.devicePixelRatio || 1, 2), // DPR 3 is wasted battery on flat shapes
    autoDensity: true,
    antialias: true,
    background: getTheme(getThemeId()).background,
    preference: 'webgl', // WebGL2 with automatic WebGL1 fallback
  });
  document.getElementById('app')!.appendChild(app.canvas);

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
