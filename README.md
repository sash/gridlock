# GridLock

Relaxed-but-deep block placement puzzle (Blockudoku family), built per `specs.md`.
Mobile-web first (iOS Safari), PixiJS 8 + WebGL, installable PWA, fully offline.

## Run

```bash
npm install
npm run dev        # dev server (LAN-exposed for phone testing)
npm run build      # production build to dist/
npm test           # unit tests (vitest) — pure game core
npm run e2e        # browser tests (playwright, chromium)
```

## What's implemented (all spec versions, v1 → v1.3)

- **Core loop** — 8×8 board, tray of 3 un-rotatable pieces (27 dealt variants of
  12 logical shapes), simultaneous row+column clears, game over when nothing fits.
- **Scoring** — per-cell placement points, line-clear table (80/200/450/800+200),
  streak multiplier ×1.5→×5 with one-placement grace (flame meter cools), +300
  perfect clear with fanfare.
- **Anti-frustration generator** — weighted bag, solvability simulation,
  guaranteed-placeable deals under 40% board fill, pity rule after 4 dry deals.
- **Special cells** — 💎 gems (+150), 🧊 ice (clears twice), 💣 bombs (9-placement
  fuse → 3×3 blast or petrify), 🪨 stone (15-placement blocker), 🌈 wilds (3+ clear reward).
- **Modes** — Classic, Daily Puzzle (seeded by date, one attempt, emoji share card),
  Rush (90s, instant refill), Zen (no game over, fullest rows dissolve, no leaderboard).
- **Power-ups** — Rotate / Swap / Hammer / Undo (undo disabled after a clear), max one
  use each per game; earned via daily login, hitting streak ×5 and perfect clears.
- **Juice** — drag ghost with would-clear glow, 80px lift offset above the finger,
  directional clear particles (≤200ms, non-blocking), streak edge glow, pitch-rising
  combo sounds (synthesized WebAudio, unlocked on first touch), near-death board dim
  with pulsing valid zones.
- **Tech** — serializable `Uint8Array(64)` state saved to localStorage on every
  placement (survives iOS tab kills), DPR capped at 2, Pointer Events with
  `touch-action: none`, PWA manifest + offline service worker, 3 cosmetic themes.

Monetization (§10) is intentionally not implemented — it is marked optional in the
spec and requires external ad/payment services.

## Native apps (iOS / Android)

`native/` contains a React Native (Expo) shell that embeds the game as a
single offline HTML asset in a WebView, with real haptic feedback bridged to
the native side. See `native/README.md` for build and store-submission steps.

```bash
npm run build:native   # regenerate the embedded game (dist-native/ → native/assets/)
```

## Architecture

- `src/core/` — pure, dependency-free game logic (rng, pieces, board, scoring,
  generator, specials, game state machine, daily). 100% of the rules live here,
  covered by 88 unit tests.
- `src/ui/` — PixiJS 8 rendering (board/tray/particles), DOM HUD and overlays,
  drag controller, synthesized audio, localStorage persistence, themes.
- `e2e/` — Playwright tests driving the real browser, including a genuine
  pointer-event drag-and-drop placement.
