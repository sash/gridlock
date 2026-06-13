import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vitest/config';

/** Stamp the SW cache name per build so deploys actually invalidate clients. */
function stampServiceWorker(): Plugin {
  return {
    name: 'stamp-sw-version',
    closeBundle() {
      const file = resolve(__dirname, 'dist/sw.js');
      try {
        writeFileSync(file, readFileSync(file, 'utf8').replace('__BUILD_VERSION__', String(Date.now())));
      } catch {
        // dev/test builds without dist/sw.js
      }
    },
  };
}

export default defineConfig({
  base: './',
  build: { target: 'es2022', assetsInlineLimit: 32768 },
  plugins: [stampServiceWorker()],
  server: { host: true },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
