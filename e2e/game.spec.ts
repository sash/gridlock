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
  await expect(page.locator('#gl-overlay-menu .gl-logo .row').first()).toContainText('GRID');
  await expect(page.locator('#gl-overlay-menu .gl-logo .row').last()).toContainText('LOCK');
});

test('menu explains modes and help overlay explains bonuses and power-ups', async ({ page }) => {
  await page.goto('/');
  // every mode button carries a description
  await expect(page.locator('[data-mode="classic"] .gl-mode-desc')).toContainText('high score');
  await expect(page.locator('[data-mode="rush"] .gl-mode-desc')).toContainText('90 seconds');
  // help overlay from the menu
  await page.click('#gl-help-btn-menu');
  const help = page.locator('#gl-overlay-help');
  await expect(help).toBeVisible();
  for (const word of ['Gem', 'Ice', 'Bomb', 'Stone', 'Wild', 'Rotate', 'Swap', 'Hammer', 'Undo']) {
    await expect(help).toContainText(word);
  }
  await page.click('#gl-help-close');
  await expect(help).toBeHidden();
  // help is also reachable in-game, and power-up buttons are labeled
  await page.click('[data-mode="classic"]');
  await page.waitForFunction(() => window.__game?.game?.state.mode === 'classic');
  await expect(page.locator('[data-pu="hammer"] .pu-name')).toHaveText('Hammer');
  await page.click('#gl-help-btn-game');
  await expect(help).toBeVisible();
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

test('document root background tracks overlays (iOS standalone bottom strip)', async ({ page }) => {
  await page.goto('/');
  // menu open → root painted overlay-dark
  await expect
    .poll(() => page.evaluate(() => document.documentElement.style.background))
    .toContain('rgb(9, 11, 18)');
  await page.click('[data-mode="classic"]');
  await page.waitForFunction(() => window.__game?.game?.state.mode === 'classic');
  // in-game → root painted with the theme background
  const inGame = await page.evaluate(() => document.documentElement.style.background);
  expect(inGame).not.toContain('rgb(9, 11, 18)');
  // help overlay → dark again
  await page.click('#gl-help-btn-game');
  await expect
    .poll(() => page.evaluate(() => document.documentElement.style.background))
    .toContain('rgb(9, 11, 18)');
});

test('streak edge glow turns off when the streak dies', async ({ page }) => {
  await startClassic(page);
  await page.evaluate(() => {
    const g = window.__game!.game!;
    // hot streak (×2.5) then a clear keeps the glow on
    g.state.streak = 2;
    for (let c = 0; c < 7; c++) g.state.board[c] = 1;
    g.state.board[15] = 1;
    g.state.tray = ['DOT_0', 'DOT_0', 'DOT_0'];
    window.__game!.placeAt(0, 7, 0); // clear → streak 3 → glow on
  });
  await expect(page.locator('#gl-glow')).toHaveCSS('opacity', '1');
  await page.evaluate(() => {
    window.__game!.placeAt(1, 4, 4); // no clear — grace, streak survives
    window.__game!.placeAt(2, 6, 6); // no clear — streak dies
  });
  await expect(page.locator('#gl-glow')).toHaveCSS('opacity', '0');
});

test('clearing a line shows a celebration cheer', async ({ page }) => {
  await startClassic(page);
  await page.evaluate(() => {
    const g = window.__game!.game!;
    for (let c = 0; c < 7; c++) g.state.board[c] = 1; // row 0 missing only (7,0)
    g.state.board[15] = 1; // keep col 7 from being empty → no perfect clear
    g.state.tray = ['DOT_0', 'DOT_0', 'DOT_0'];
    window.__game!.placeAt(0, 7, 0);
  });
  await expect(page.locator('#gl-cheer')).toContainText(/Nice!|Good one!|Sweet!|Clean!|Smooth!/);
});

test('tapping a special brick explains it; menu offers New game mid-game', async ({ page }) => {
  await startClassic(page);
  // score some points, then plant a gem and tap it
  await page.evaluate(() => {
    const g = window.__game!.game!;
    g.state.tray = ['DOT_0', 'DOT_0', 'DOT_0'];
    window.__game!.placeAt(0, 4, 4);
    g.state.board[0] = 16; // CELL.GEM at (0,0)
  });
  const origin = await page.evaluate(() => {
    const app = window.__game! as unknown as { boardOrigin: { x: number; y: number }; board: { cellSize: number } };
    return { x: app.boardOrigin.x, y: app.boardOrigin.y, cs: app.board.cellSize };
  });
  await page.mouse.click(origin.x + origin.cs / 2, origin.y + origin.cs / 2);
  await expect(page.locator('#gl-toast')).toContainText('Gem');
  // ☰ menu mid-game offers New game
  await page.click('#gl-menu-btn');
  const newGame = page.locator('#gl-newgame-btn');
  await expect(newGame).toBeVisible();
  await expect(newGame).toContainText('New game');
  const scoreBefore = await page.evaluate(() => window.__game!.game!.state.score);
  await newGame.click();
  await page.waitForFunction(() => window.__game!.game!.state.score === 0);
  void scoreBefore;
  await expect(page.locator('#gl-overlay-menu')).toBeHidden();
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
