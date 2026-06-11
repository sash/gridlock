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

  if ('serviceWorker' in navigator && import.meta.env.PROD) {
    void navigator.serviceWorker.register('./sw.js'); // relative: works on subpath hosting
  }
}

void boot();
