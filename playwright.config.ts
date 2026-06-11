import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  timeout: 30_000,
  use: {
    browserName: 'chromium',
    viewport: { width: 430, height: 932 },
    hasTouch: true,
  },
  webServer: {
    command: 'npx vite --port 5180 --strictPort',
    port: 5180,
    reuseExistingServer: true,
  },
});
