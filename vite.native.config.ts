import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// Native (React Native WebView) build: everything inlined into one HTML file
// so the app works fully offline from the app bundle — no server, no SW.
export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    outDir: 'dist-native',
    assetsInlineLimit: 32768, // fruit sprites must inline into the single file
  },
  plugins: [viteSingleFile()],
  define: {
    // the WebView shell has no service worker; make sure registration is skipped
    'import.meta.env.NATIVE': 'true',
  },
});
