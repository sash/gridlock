# Game Design Spec: “GridLock” — Block Placement Puzzle

*Working title. Genre: relaxed-but-deep block puzzle (Blockudoku / Block Blast family). Target platform: mobile web (iOS Safari first), WebGL via PixiJS.*

-----

## 1. Core Loop

1. Player sees an **8×8 grid**, a **tray of 3 pieces** and a **hold slot**.
1. Player drags any of the 3 pieces onto the grid (any order).
1. A completed **row or column** clears instantly and scores points.
1. When all 3 pieces are placed (or parked in hold), a new set of 3 is dealt.
1. **Hold:** drag a tray piece onto the hold slot to park it; dropping another piece there swaps them. The held piece can be placed at any time and doesn't count toward the next deal — pieces are postponed, never discarded.
1. **Last chance:** the first time nothing fits (tray + hold), the fullest rows crack away one at a time until something fits again. Once per game.
1. **Game over** when none of the remaining tray or held pieces fits anywhere on the board and the last chance is spent.

No gravity, no timer (in the base mode). The tension comes entirely from spatial budgeting: every placement constrains the future.

-----

## 2. Board & Pieces

### Board

- 8×8 cells. Cell states: `empty`, `filled(color)`, plus special states defined in §5.
- Coordinates: `(col, row)`, origin top-left.

### Piece set (14 logical shapes, 31 dealt variants)

|Category   |Shapes                                            |
|-----------|--------------------------------------------------|
|Dots & bars|1×1, 1×2, 1×3, 1×4, 1×5 (and vertical variants)   |
|Squares    |2×2, 3×3                                          |
|L-shapes   |L-tromino (4 rotations), L-tetromino (4 rotations)|
|S/Z & T    |S, Z, T tetrominoes (fixed rotations as dealt)    |
|Diagonals  |2-cell and 3-cell corner-touching diagonals (2 orientations each) — slot into checkerboard-style holes|

- **Pieces cannot be rotated by the player.** Rotation variants are dealt as distinct pieces. (This is a deliberate design choice — it makes each deal a real puzzle. See §7 for a power-up that bends this rule.)
- Each piece has a color, purely cosmetic (color does not affect matching).

### Piece generator (anti-frustration)

Pure random feels unfair. Use a **weighted bag with a solvability check**:

1. Generate a candidate set of 3 from weighted probabilities, leaning small: 1×2 1.2, 1×1 1.0, mid pieces 1.0, diagonal pair 0.8, 1×5 0.6, diagonal triple 0.5, 3×3 0.4. From **50% full**, pieces of ≤3 cells are ×1.6 likelier and pieces of ≥5 cells ×0.6.
1. Simulate: does at least one ordering of the 3 pieces fit on the current board?
1. If not, reroll — up to **5 times below 40% full, 3 times up to 60%, once above**. Fewer cheap mid-game deaths, while a truly jammed board still ends the game.
1. If no ordering fits after the budget → game over is legitimate, deal it anyway (don’t rig wins).
1. **Pity rule:** after 2 clear-less deals, or whenever the board is **≥60% full**, bias the next deal toward pieces that can complete an almost-full line (a line missing ≤2 cells) — never trading a placeable set for an unplaceable one.
1. **Rush refills** draw one piece at a time with the same weights, rerolled (≤5) until it fits somewhere.

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
- Each placement *without* a clear cools it (grace: streak survives three non-clearing placements, dies on the fourth — tuned up from one, then two, after playtesting; a whole tray can now go by without a clear and the streak lives).
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
|🧊 **Ice** |From score 4,000+: a random *filled* cell in a row or column that is at least half full freezes every 5 deals|Must be cleared **twice** (first clear cracks it, line counts as cleared but the ice cell stays filled)                                                      |
|💣 **Bomb**|Rare (1 per ~10 deals), sits with a counter: 12 placements; throbs red in its last 3|If cleared in time → explodes a **5×5** area empty — stone included, gems caught pay out, other bombs in reach chain-react (shockwave, debris, board shake, thump). If the counter hits 0 → it petrifies into a **stone** cell for 8 placements; any clear through or orthogonally beside a stone shatters it early|
|🌈 **Wild**|Reward for a 2+ line clear                                     |Counts as filled for *every* row/column check — the cell helps complete both its row and column                                                              |

Ice and bombs convert the late game from “keep the board tidy” into targeted spatial objectives: *I need a horizontal clear through column 5 within 3 moves.*

-----

## 6. Game Modes

1. **Classic** — endless, as described. High-score chase.
1. **Daily Puzzle** — everyone gets the same seeded piece sequence and starting board (some cells pre-filled). One attempt per day, shareable result (Wordle-style emoji grid). Huge retention lever, trivially cheap to build once seeding exists.
1. **Rush** — 90 seconds, pieces auto-refill the tray instantly (you don’t wait to place all 3). Pure speed and pattern recognition. **Time targets:** after each placement a random filled block gets marked (max 3 active) with a 2–5s value; clearing its line banks those seconds onto the clock.
1. **Zen** — no game over: if nothing fits, the worst 2 rows dissolve. No leaderboard. For the bus ride home.

-----

## 7. Power-ups (consumables, earned not bought — or bought, see §10)

Max 2 uses of each per game (keeps leaderboards honest):

- **Rotate** — rotate one tray or held piece 90°.
- **Swap** — replace the entire tray with a fresh deal.
- **Hammer** — delete any single filled cell.
- **Undo** — revert the last placement (disabled after a clear).

Earned via: daily login, every 15 cleared lines, watching the streak meter hit ×5, perfect clears.

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

