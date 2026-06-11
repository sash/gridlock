# Game Design Spec: “GridLock” — Block Placement Puzzle

*Working title. Genre: relaxed-but-deep block puzzle (Blockudoku / Block Blast family). Target platform: mobile web (iOS Safari first), WebGL via PixiJS.*

-----

## 1. Core Loop

1. Player sees an **8×8 grid** and a **tray of 3 pieces**.
1. Player drags any of the 3 pieces onto the grid (any order).
1. A completed **row or column** clears instantly and scores points.
1. When all 3 pieces are placed, a new set of 3 is dealt.
1. **Game over** when none of the remaining tray pieces fits anywhere on the board.

No gravity, no timer (in the base mode). The tension comes entirely from spatial budgeting: every placement constrains the future.

-----

## 2. Board & Pieces

### Board

- 8×8 cells. Cell states: `empty`, `filled(color)`, plus special states defined in §5.
- Coordinates: `(col, row)`, origin top-left.

### Piece set (14 shapes)

|Category   |Shapes                                            |
|-----------|--------------------------------------------------|
|Dots & bars|1×1, 1×2, 1×3, 1×4, 1×5 (and vertical variants)   |
|Squares    |2×2, 3×3                                          |
|L-shapes   |L-tromino (4 rotations), L-tetromino (4 rotations)|
|S/Z & T    |S, Z, T tetrominoes (fixed rotations as dealt)    |

- **Pieces cannot be rotated by the player.** Rotation variants are dealt as distinct pieces. (This is a deliberate design choice — it makes each deal a real puzzle. See §7 for a power-up that bends this rule.)
- Each piece has a color, purely cosmetic (color does not affect matching).

### Piece generator (anti-frustration)

Pure random feels unfair. Use a **weighted bag with a solvability check**:

1. Generate a candidate set of 3 from weighted probabilities (big pieces rarer: 3×3 weight 0.4, 1×1 weight 0.6, mid pieces 1.0).
1. Simulate: does at least one ordering of the 3 pieces fit on the current board?
1. If no ordering fits → game over is legitimate, deal it anyway (don’t rig wins).
1. If the board is **<40% full**, guarantee the set is fully placeable (reject and re-roll up to 5 times). This removes “cheap deaths” early without making the late game fake.
1. **Pity rule:** if the player hasn’t cleared a line in 4 consecutive deals, bias the next deal toward pieces that can complete an almost-full line (a line missing ≤2 cells).

-----

## 3. Placement & Clearing Rules

- A piece can be placed only where **all** its cells land on empty cells.
- After each placement, check all 8 rows and 8 columns. Every fully-filled line clears **simultaneously**.
- Clearing a row and a column that share a cell counts as **2 lines** (the intersection cell is consumed once).
- Cleared cells become empty immediately — before the next piece is placed.

-----

## 4. Scoring

|Event                 |Points                          |
|----------------------|--------------------------------|
|Place a piece         |1 point per cell (a 3×3 = 9 pts)|
|Clear 1 line          |80                              |
|Clear 2 lines at once |200                             |
|Clear 3 lines at once |450                             |
|Clear 4+ lines at once|800 + 200 per extra line        |

### Streak multiplier (the addiction engine)

- Clearing at least one line on a placement increments the **streak counter**.
- Each placement *without* a clear resets it (grace: streak survives one non-clearing placement, dies on the second).
- Line points are multiplied by `1 + 0.5 × streak` (streak 1 → ×1.5, streak 4 → ×3, cap ×5).
- UI shows the streak as a flame meter that visibly “cools” so the player feels the grace period.

### Board-clear bonus

- Emptying the entire board: **+300 flat** + a “Perfect Clear” fanfare. Rare, feels amazing, encourages risky all-in plays.

-----

## 5. Making It More Interesting — Special Cells

These spawn on the board (not in pieces) and reward/punish *where* you clear, not just *that* you clear.

|Cell      |Spawn rule                                                     |Effect when its line clears                                                                                                                                  |
|----------|---------------------------------------------------------------|-------------------------------------------------------------------------------------------------------------------------------------------------------------|
|💎 **Gem** |1 spawns on a random empty cell every 3 deals                  |+150 bonus points                                                                                                                                            |
|🧊 **Ice** |From score 2,000+: a random *filled* cell freezes every 5 deals|Must be cleared **twice** (first clear cracks it, line counts as cleared but the ice cell stays filled)                                                      |
|💣 **Bomb**|Rare (1 per ~10 deals), sits with a counter: 9 placements      |If cleared in time → explodes a 3×3 area empty (bonus clear). If the counter hits 0 → it petrifies into a permanent **stone** cell for the next 15 placements|
|🌈 **Wild**|Reward for a 3+ line clear                                     |Counts as filled for *every* row/column check — the cell helps complete both its row and column                                                              |

Ice and bombs convert the late game from “keep the board tidy” into targeted spatial objectives: *I need a horizontal clear through column 5 within 3 moves.*

-----

## 6. Game Modes

1. **Classic** — endless, as described. High-score chase.
1. **Daily Puzzle** — everyone gets the same seeded piece sequence and starting board (some cells pre-filled). One attempt per day, shareable result (Wordle-style emoji grid). Huge retention lever, trivially cheap to build once seeding exists.
1. **Rush** — 90 seconds, pieces auto-refill the tray instantly (you don’t wait to place all 3). Pure speed and pattern recognition.
1. **Zen** — no game over: if nothing fits, the worst 2 rows dissolve. No leaderboard. For the bus ride home.

-----

## 7. Power-ups (consumables, earned not bought — or bought, see §10)

Max 1 use of each per game in Classic (keeps leaderboards honest):

- **Rotate** — rotate one tray piece 90°.
- **Swap** — replace the entire tray with a fresh deal.
- **Hammer** — delete any single filled cell.
- **Undo** — revert the last placement (disabled after a clear).

Earned via: daily login, watching the streak meter hit ×5, perfect clears.

-----

## 8. Juice & Feel (this is half the game)

- **Drag preview:** ghost of the piece snaps to the grid; cells that *would clear* glow before you drop. This single feature is the difference between a good and a mediocre entry in this genre.
- **Lift offset:** on touch, the piece floats ~80px above the finger so it isn’t hidden by the thumb (critical on iOS).
- Clear animation: cells pop outward with particles in the line’s direction, 150–200ms, never blocks input.
- Streak ×3+ : screen edge glow, pitch-shifted clear sound rising with each combo.
- Haptics on iOS via the `navigator.vibrate` fallback being absent — use audio + visual punch instead; if shipped as PWA wrapper later, wire real haptics.
- Near-death warning: when ≤2 valid placements remain, the board subtly dims and valid zones pulse.

-----

## 9. Technical Notes (PixiJS / WebGL, iOS-first)

- **Renderer:** PixiJS 8, single texture atlas for all cells/pieces/particles. WebGL2 with WebGL1 fallback.
- **Resolution:** render at `min(devicePixelRatio, 2)`; the art is flat shapes, DPR 3 is wasted battery.
- **State model:** the entire game state is a plain serializable object `{board: Uint8Array(64), tray, score, streak, seed, rngState}`. Enables undo, daily seeding, save/restore on tab kill (iOS Safari kills backgrounded tabs aggressively — persist to localStorage on every placement).
- **Game-over check:** brute force is fine — 3 pieces × 64 positions × ≤9 cells = trivial. Run after every placement.
- **Solvability simulation** (§2): 3! orderings × 64 positions each, still trivial; run async if ever needed, it won’t be.
- **Audio:** unlock AudioContext on first touch; pool short clear/place sounds.
- **Input:** Pointer Events only; `touch-action: none` on the canvas; prevent double-tap zoom and pull-to-refresh.
- **PWA:** manifest + standalone display for home-screen install; offline-capable from day one (no server dependency in Classic/Zen).

-----

## 10. Monetization (optional, light-touch)

- Rewarded ad → 1 power-up or 1 continue (clear bottom 2 rows) per game.
- One-time “remove ads” purchase.
- Cosmetic themes (block skins, board backgrounds). Never sell score advantages in Daily.

-----

## 11. MVP Cut Line

**v1 (2–3 weeks):** Classic mode, full scoring + streaks, ghost preview + clear glow, anti-frustration generator, save/restore, sound. No specials, no power-ups.

**v1.1:** Daily Puzzle + share card. **v1.2:** Gems + bombs + Rush mode. **v1.3:** Ice, wilds, Zen, power-ups, themes.

