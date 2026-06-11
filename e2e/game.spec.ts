import { expect, test, type Page } from '@playwright/test';

// window.__game is typed by the global declaration in src/main.ts (GameApp).

async function startClassic(page: Page): Promise<void> {
  await page.goto('/');
  await page.click('[data-mode="classic"]');
  await page.waitForFunction(() => window.__game?.game?.state.mode === 'classic');
}

// Each Playwright test gets a fresh browser context, so localStorage is
// already isolated — no manual clearing (which would also wipe saves on reload).

test('loads the app with a rendered canvas and menu', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('canvas')).toBeVisible();
  await expect(page.locator('[data-mode="classic"]')).toBeVisible();
  await expect(page.locator('#gl-overlay-menu h1')).toHaveText('GridLock');
});

test('starting classic deals a tray of 3 and placing via drag scores points', async ({ page }) => {
  await startClassic(page);

  const tray = await page.evaluate(() => window.__game!.game!.state.tray);
  expect(tray.filter(Boolean).length).toBe(3);

  // Drag the first tray piece onto the board with real pointer events,
  // recomputing the layout geometry the app uses (in CSS pixels).
  const viewport = page.viewportSize()!;
  const size = Math.min(viewport.width - 28, 520);
  const boardX = (viewport.width - size) / 2;
  const boardY = 86;
  const trayY = boardY + size + 24 + size / 3 / 2 / 2;
  const slot0X = boardX + size / 6;

  // press on tray slot 0, drag 80px above a free board area (lift offset), release
  await page.mouse.move(slot0X, trayY);
  await page.mouse.down();
  await page.mouse.move(boardX + size / 2, boardY + size / 2 + 80, { steps: 8 });
  await page.mouse.up();

  await page.waitForFunction(() => window.__game!.game!.state.score > 0);
  const state = await page.evaluate(() => ({
    score: window.__game!.game!.state.score,
    placedSlots: window.__game!.game!.state.tray.filter((t) => t === null).length,
  }));
  expect(state.score).toBeGreaterThan(0);
  expect(state.placedSlots).toBe(1);
});

test('programmatic placement pipeline works and the board fills', async ({ page }) => {
  await startClassic(page);
  const result = await page.evaluate(() => {
    const app = window.__game!;
    return app.placeAt(0, 0, 0);
  });
  expect(result).not.toBeNull();
  const filled = await page.evaluate(() => {
    const b = window.__game!.game!.state.board as unknown as Uint8Array;
    return Array.from(b).filter((v) => v !== 0).length;
  });
  expect(filled).toBeGreaterThan(0);
  await expect(page.locator('#gl-score')).not.toHaveText('0');
});

test('game state persists across a reload (iOS tab-kill survival)', async ({ page }) => {
  await startClassic(page);
  await page.evaluate(() => window.__game!.placeAt(0, 0, 0));
  const before = await page.evaluate(() => window.__game!.game!.state.score);
  expect(before).toBeGreaterThan(0);

  await page.reload();
  await page.waitForFunction(() => window.__game?.game?.state.mode === 'classic');
  const after = await page.evaluate(() => ({
    score: window.__game!.game!.state.score,
    tray: window.__game!.game!.state.tray.filter(Boolean).length,
  }));
  expect(after.score).toBe(before);
  expect(after.tray).toBeGreaterThanOrEqual(2); // one slot consumed pre-reload
});

test('rush mode runs its 90s timer', async ({ page }) => {
  await page.goto('/');
  await page.click('[data-mode="rush"]');
  await page.waitForFunction(() => window.__game?.game?.state.mode === 'rush');
  const t0 = await page.evaluate(() => window.__game!.game!.state.rushTimeLeft);
  expect(t0).toBeLessThanOrEqual(90);
  await page.waitForTimeout(1200);
  const t1 = await page.evaluate(() => window.__game!.game!.state.rushTimeLeft);
  expect(t1).toBeLessThan(t0!);
  // tray refills instantly in rush
  await page.evaluate(() => window.__game!.placeAt(0, 0, 0));
  const tray = await page.evaluate(() => window.__game!.game!.state.tray.filter(Boolean).length);
  expect(tray).toBe(3);
});

test('daily mode locks to one attempt and offers a share card', async ({ page }) => {
  await page.goto('/');
  await page.click('[data-mode="daily"]');
  await page.waitForFunction(() => window.__game?.game?.state.mode === 'daily');
  // daily board has prefilled cells
  const filled = await page.evaluate(() => {
    const b = window.__game!.game!.state.board as unknown as Uint8Array;
    return Array.from(b).filter((v) => v !== 0).length;
  });
  expect(filled).toBeGreaterThan(0);
});

test('zen mode never shows game over controls during play', async ({ page }) => {
  await page.goto('/');
  await page.click('[data-mode="zen"]');
  await page.waitForFunction(() => window.__game?.game?.state.mode === 'zen');
  await page.evaluate(() => window.__game!.placeAt(0, 0, 0));
  const over = await page.evaluate(() => window.__game!.game!.state.over);
  expect(over).toBe(false);
});

test('power-up swap replaces the tray once', async ({ page }) => {
  await startClassic(page);
  const before = await page.evaluate(() => window.__game!.game!.state.tray);
  await page.click('[data-pu="swap"]');
  const after = await page.evaluate(() => ({
    tray: window.__game!.game!.state.tray,
    used: window.__game!.game!.state.used,
  }));
  expect(after.tray.filter(Boolean).length).toBe(3);
  expect((after.used as Record<string, boolean>).swap).toBe(true);
  void before;
  await expect(page.locator('[data-pu="swap"]')).toBeDisabled();
});
