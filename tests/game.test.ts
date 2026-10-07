import { describe, expect, test } from 'vitest';
import { Game, HOLD_SLOT } from '../src/core/game';
import { CELL, idx } from '../src/core/board';
import { getPiece } from '../src/core/pieces';

function fillRowExcept(game: Game, row: number, ...except: number[]) {
  for (let c = 0; c < 8; c++) {
    if (!except.includes(c)) game.state.board[idx(c, row)] = 1;
  }
}

describe('new game', () => {
  test('starts with 3 tray pieces, zero score, not over', () => {
    const g = new Game({ mode: 'classic', seed: 1 });
    expect(g.state.tray.filter(Boolean).length).toBe(3);
    expect(g.state.score).toBe(0);
    expect(g.state.over).toBe(false);
  });

  test('same seed produces the same first tray', () => {
    const a = new Game({ mode: 'classic', seed: 42 });
    const b = new Game({ mode: 'classic', seed: 42 });
    expect(a.state.tray).toEqual(b.state.tray);
  });
});

describe('placement', () => {
  test('scores 1 point per cell and consumes the tray slot', () => {
    const g = new Game({ mode: 'classic', seed: 1 });
    g.state.tray = ['SQ3_0', 'DOT_0', 'DOT_0'];
    const res = g.place(0, 0, 0);
    expect(res).not.toBeNull();
    expect(g.state.score).toBe(9);
    expect(g.state.tray[0]).toBeNull();
  });

  test('rejects invalid placement and leaves state untouched', () => {
    const g = new Game({ mode: 'classic', seed: 1 });
    g.state.tray = ['SQ3_0', 'DOT_0', 'DOT_0'];
    g.state.board[idx(0, 0)] = 1;
    expect(g.place(0, 0, 0)).toBeNull();
    expect(g.state.score).toBe(0);
    expect(g.state.tray[0]).toBe('SQ3_0');
  });

  test('clearing one line scores 80 × 1.5 (streak 1) plus cell points', () => {
    const g = new Game({ mode: 'classic', seed: 1 });
    g.state.tray = ['DOT_0', 'DOT_0', 'DOT_0'];
    fillRowExcept(g, 0, 7);
    g.state.board[idx(0, 7)] = 1; // avoid a perfect clear
    const res = g.place(0, 7, 0)!;
    expect(res.linesCleared).toBe(1);
    expect(res.lines.rows).toEqual([0]); // direction info for clear particles
    expect(g.state.streak).toBe(1);
    expect(g.state.score).toBe(1 + 120); // 1 cell + 80 × 1.5
    expect(g.state.board[idx(0, 0)]).toBe(CELL.EMPTY);
  });

  test('streak survives a whole tray without a clear, dies on the fourth miss', () => {
    const g = new Game({ mode: 'classic', seed: 1 });
    g.state.tray = ['DOT_0', 'DOT_0', 'DOT_0'];
    g.state.streak = 2;
    g.place(0, 3, 3);
    expect(g.state.streak).toBe(2);
    g.place(1, 4, 4);
    expect(g.state.streak).toBe(2);
    g.place(2, 5, 5);
    expect(g.state.streak).toBe(2);
    // the tray refilled — one more miss ends it
    g.state.tray = ['DOT_0', 'DOT_0', 'DOT_0'];
    g.place(0, 6, 6);
    expect(g.state.streak).toBe(0);
  });

  test('totalLines accumulates across clears (drives the fruit skin stage)', () => {
    const g = new Game({ mode: 'classic', seed: 1 });
    g.state.tray = ['DOT_0', 'DOT_0', 'DOT_0'];
    expect(g.state.totalLines).toBe(0);
    fillRowExcept(g, 0, 7);
    g.state.board[idx(0, 7)] = 1; // avoid perfect clear
    g.place(0, 7, 0);
    expect(g.state.totalLines).toBe(1);
  });

  test('a new tray of 3 is dealt after all 3 are placed', () => {
    const g = new Game({ mode: 'classic', seed: 1 });
    g.state.tray = ['DOT_0', 'DOT_0', 'DOT_0'];
    const dealBefore = g.state.dealNumber;
    g.place(0, 0, 0);
    g.place(1, 2, 0);
    expect(g.state.tray.filter(Boolean).length).toBe(1);
    g.place(2, 4, 0);
    expect(g.state.tray.filter(Boolean).length).toBe(3);
    expect(g.state.dealNumber).toBe(dealBefore + 1);
  });

  test('game over when no remaining tray piece fits', () => {
    const g = new Game({ mode: 'classic', seed: 1 });
    // full board except a 2-wide diagonal band: every row/col keeps ≥1 empty
    // cell after the dot placement (no accidental clears), no 3×3 hole exists
    for (let i = 0; i < 64; i++) g.state.board[i] = 1;
    for (let k = 0; k < 8; k++) {
      g.state.board[idx(k, k)] = CELL.EMPTY;
      g.state.board[idx((k + 1) % 8, k)] = CELL.EMPTY;
    }
    g.state.tray = ['DOT_0', 'SQ3_0', null];
    g.state.rescued = true; // last chance already spent
    const res = g.place(0, 0, 0)!;
    expect(res.linesCleared).toBe(0);
    expect(res.gameOver).toBe(true);
    expect(g.state.over).toBe(true);
  });

  test('first time stuck: last chance cracks the fullest rows away instead of ending', () => {
    const g = new Game({ mode: 'classic', seed: 1 });
    for (let i = 0; i < 64; i++) g.state.board[i] = 1;
    for (let k = 0; k < 8; k++) {
      g.state.board[idx(k, k)] = CELL.EMPTY;
      g.state.board[idx((k + 1) % 8, k)] = CELL.EMPTY;
    }
    g.state.tray = ['DOT_0', 'SQ3_0', null];
    const res = g.place(0, 0, 0)!;
    expect(res.gameOver).toBe(false);
    expect(res.lastChance).toBe(true);
    expect(res.dissolvedRows.length).toBeGreaterThan(0);
    expect(g.state.rescued).toBe(true);
    expect(g.state.over).toBe(false);
    expect(g.totalValidMoves()).toBeGreaterThan(0);
  });

  test('perfect clear awards +300', () => {
    const g = new Game({ mode: 'classic', seed: 1 });
    g.state.tray = ['BAR2_0', 'DOT_0', 'DOT_0'];
    fillRowExcept(g, 0, 6, 7);
    const res = g.place(0, 6, 0)!;
    expect(res.perfectClear).toBe(true);
    // 2 cells + 80×1.5 + 300
    expect(g.state.score).toBe(2 + 120 + 300);
  });

  test('cleared gem pays +150 flat', () => {
    const g = new Game({ mode: 'classic', seed: 1 });
    g.state.tray = ['DOT_0', 'DOT_0', 'DOT_0'];
    fillRowExcept(g, 0, 7);
    g.state.board[idx(3, 0)] = CELL.GEM;
    g.state.board[idx(0, 7)] = 1; // avoid a perfect clear
    g.place(0, 7, 0);
    expect(g.state.score).toBe(1 + 120 + 150);
  });

  test('cleared bomb explodes the area around it', () => {
    const g = new Game({ mode: 'classic', seed: 1 });
    g.state.tray = ['DOT_0', 'DOT_0', 'DOT_0'];
    fillRowExcept(g, 0, 7);
    g.state.board[idx(3, 0)] = CELL.BOMB;
    g.state.aux.bombs[idx(3, 0)] = 5;
    g.state.board[idx(3, 1)] = 1; // in blast radius
    g.place(0, 7, 0);
    expect(g.state.board[idx(3, 1)]).toBe(CELL.EMPTY);
    expect(g.state.aux.bombs[idx(3, 0)]).toBeUndefined();
  });

  test('cleared bomb blasts 5×5, shatters stone in reach and pays gems it catches', () => {
    const g = new Game({ mode: 'classic', seed: 1 });
    g.state.tray = ['DOT_0', 'DOT_0', 'DOT_0'];
    fillRowExcept(g, 0, 7);
    g.state.board[idx(3, 0)] = CELL.BOMB;
    g.state.aux.bombs[idx(3, 0)] = 5;
    g.state.board[idx(5, 2)] = CELL.STONE;
    g.state.aux.stones[idx(5, 2)] = 8;
    g.state.board[idx(1, 2)] = CELL.GEM;
    g.state.board[idx(6, 2)] = 1; // just outside the blast
    const res = g.place(0, 7, 0)!;
    expect(res.blastCenters).toEqual([idx(3, 0)]);
    expect(g.state.board[idx(5, 2)]).toBe(CELL.EMPTY);
    expect(g.state.board[idx(1, 2)]).toBe(CELL.EMPTY);
    expect(g.state.board[idx(6, 2)]).toBe(1);
    expect(res.gemBonus).toBe(150);
  });

  test('a line cleared beside a stone shatters it', () => {
    const g = new Game({ mode: 'classic', seed: 1 });
    g.state.tray = ['DOT_0', 'DOT_0', 'DOT_0'];
    fillRowExcept(g, 0, 7);
    g.state.board[idx(2, 1)] = CELL.STONE;
    g.state.aux.stones[idx(2, 1)] = 8;
    const res = g.place(0, 7, 0)!;
    expect(res.shatteredCells).toEqual([idx(2, 1)]);
    expect(g.state.board[idx(2, 1)]).toBe(CELL.EMPTY);
    expect(g.state.aux.stones[idx(2, 1)]).toBeUndefined();
  });

  test('2-line clear grants a wild zone', () => {
    const g = new Game({ mode: 'classic', seed: 1 });
    g.state.tray = ['DOT_0', 'DOT_0', 'DOT_0'];
    fillRowExcept(g, 0, 7);
    for (let r = 1; r < 8; r++) g.state.board[idx(7, r)] = 1;
    g.state.board[idx(0, 5)] = 1; // avoid a perfect clear
    const res = g.place(0, 7, 0)!;
    expect(res.linesCleared).toBe(2);
    expect(g.state.aux.wilds.length).toBe(1);
  });

  test('3+ line clear grants a wild zone (board stays clear of it)', () => {
    const g = new Game({ mode: 'classic', seed: 1 });
    g.state.tray = ['SQ3_0', 'DOT_0', 'DOT_0'];
    for (const r of [0, 1, 2]) fillRowExcept(g, r, 0, 1, 2);
    const res = g.place(0, 0, 0)!;
    expect(res.linesCleared).toBe(3);
    expect(g.state.aux.wilds.length).toBe(1);
    expect([...g.state.board].includes(CELL.WILD)).toBe(false);
  });

  test('pieces can be placed onto empty wild-aura cells', () => {
    const g = new Game({ mode: 'classic', seed: 1 });
    g.state.tray = ['SQ3_0', 'DOT_0', 'DOT_0'];
    g.state.aux.wilds = [idx(4, 4)];
    expect(g.canPlaceAt(0, 3, 3)).toBe(true); // 3×3 overlapping the whole aura
    expect(g.place(0, 3, 3)).not.toBeNull();
  });

  test('a line completed through empty aura cells clears, consuming the wild', () => {
    const g = new Game({ mode: 'classic', seed: 1 });
    g.state.tray = ['DOT_0', 'DOT_0', 'DOT_0'];
    // row 4: fill all but (3,4), (4,4), (5,4); wild at (4,4) covers those three
    for (let c = 0; c < 8; c++) if (c < 3 || c > 5) g.state.board[idx(c, 4)] = 1;
    g.state.board[idx(0, 7)] = 1; // avoid perfect clear
    g.state.aux.wilds = [idx(4, 4)];
    const res = g.place(0, 3, 4)!; // fill (3,4); (4,4)+(5,4) covered by aura
    expect(res.linesCleared).toBe(1);
    expect(g.state.aux.wilds.length).toBe(0); // consumed by the clear
    expect(g.state.board[idx(0, 4)]).toBe(CELL.EMPTY);
  });

  test('legacy saves with on-board wild cells migrate to wild zones', () => {
    const g = new Game({ mode: 'classic', seed: 1 });
    const data = g.serialize();
    data.board[idx(2, 2)] = CELL.WILD;
    const restored = Game.deserialize(data);
    expect(restored.state.board[idx(2, 2)]).toBe(CELL.EMPTY);
    expect(restored.state.aux.wilds).toContain(idx(2, 2));
  });
});

describe('ghost preview helpers', () => {
  test('wouldClear reports the lines a drop would complete', () => {
    const g = new Game({ mode: 'classic', seed: 1 });
    g.state.tray = ['DOT_0', 'DOT_0', 'DOT_0'];
    fillRowExcept(g, 2, 5);
    const lines = g.wouldClear(0, 5, 2)!;
    expect(lines.rows).toEqual([2]);
    expect(g.wouldClear(0, 5, 3)!.rows).toEqual([]);
  });

  test('totalValidMoves counts placements for remaining pieces', () => {
    const g = new Game({ mode: 'classic', seed: 1 });
    g.state.tray = ['DOT_0', null, null];
    for (let i = 0; i < 64; i++) g.state.board[i] = 1;
    g.state.board[idx(4, 4)] = CELL.EMPTY;
    g.state.board[idx(5, 5)] = CELL.EMPTY;
    expect(g.totalValidMoves()).toBe(2);
  });
});

describe('hold slot', () => {
  test('parking a piece frees its tray slot; the held piece can be placed later', () => {
    const g = new Game({ mode: 'classic', seed: 1 });
    g.state.tray = ['BAR3_0', 'DOT_0', 'DOT_0'];
    expect(g.holdPiece(0)).not.toBeNull();
    expect(g.state.hold).toBe('BAR3_0');
    expect(g.state.tray[0]).toBeNull();
    const res = g.place(HOLD_SLOT, 0, 0)!;
    expect(res).not.toBeNull();
    expect(g.state.hold).toBeNull();
    expect(g.state.board[idx(2, 0)]).not.toBe(CELL.EMPTY);
    expect(g.state.tray).toEqual([null, 'DOT_0', 'DOT_0']); // placing from hold never deals
  });

  test('holding when something is held swaps the two', () => {
    const g = new Game({ mode: 'classic', seed: 1 });
    g.state.tray = ['BAR3_0', 'DOT_0', 'SQ2_0'];
    g.state.hold = 'T_0';
    expect(g.holdPiece(2)).not.toBeNull();
    expect(g.state.hold).toBe('SQ2_0');
    expect(g.state.tray[2]).toBe('T_0');
  });

  test('parking the last tray piece deals a fresh tray', () => {
    const g = new Game({ mode: 'classic', seed: 1 });
    g.state.tray = [null, null, 'SQ2_0'];
    const deal = g.state.dealNumber;
    expect(g.holdPiece(2)).not.toBeNull();
    expect(g.state.dealNumber).toBe(deal + 1);
    expect(g.state.tray.filter(Boolean).length).toBe(3);
  });

  test('the held piece keeps the game alive when nothing in the tray fits', () => {
    const g = new Game({ mode: 'classic', seed: 1 });
    for (let i = 0; i < 64; i++) g.state.board[i] = 1;
    for (let k = 0; k < 8; k++) {
      g.state.board[idx(k, k)] = CELL.EMPTY;
      g.state.board[idx((k + 1) % 8, k)] = CELL.EMPTY;
    }
    g.state.tray = ['DOT_0', 'SQ3_0', null];
    g.state.hold = 'DOT_0';
    g.state.rescued = true;
    const res = g.place(0, 0, 0)!;
    expect(res.gameOver).toBe(false);
  });

  test('a hold that deals into a stuck board triggers the last chance', () => {
    const g = new Game({ mode: 'classic', seed: 1 });
    // packed board: no deal can fit until rows crack away
    for (let i = 0; i < 64; i++) g.state.board[i] = 1;
    g.state.tray = [null, null, 'SQ3_0'];
    const out = g.holdPiece(2)!;
    expect(out.lastChance).toBe(true);
    expect(out.gameOver).toBe(false);
    expect(g.totalValidMoves()).toBeGreaterThan(0);
  });

  test('cannot hold from the hold slot or an empty slot', () => {
    const g = new Game({ mode: 'classic', seed: 1 });
    g.state.tray = [null, 'DOT_0', 'DOT_0'];
    expect(g.holdPiece(0)).toBeNull();
    expect(g.holdPiece(HOLD_SLOT)).toBeNull();
  });
});

describe('power-ups', () => {
  test('rotate turns a tray piece into its 90° variant, twice per game', () => {
    const g = new Game({ mode: 'classic', seed: 1 });
    g.state.tray = ['BAR3_0', 'DOT_0', 'DOT_0'];
    expect(g.useRotate(0)).toBe(true);
    expect(getPiece(g.state.tray[0]!).w).toBe(1);
    expect(getPiece(g.state.tray[0]!).h).toBe(3);
    expect(g.useRotate(0)).toBe(true);
    expect(getPiece(g.state.tray[0]!).w).toBe(3);
    expect(g.useRotate(0)).toBe(false);
  });

  test('rotate works on the held piece', () => {
    const g = new Game({ mode: 'classic', seed: 1 });
    g.state.hold = 'BAR3_0';
    expect(g.useRotate(HOLD_SLOT)).toBe(true);
    expect(getPiece(g.state.hold!).h).toBe(3);
  });

  test('swap replaces the whole tray, twice per game', () => {
    const g = new Game({ mode: 'classic', seed: 1 });
    g.state.tray = ['DOT_0', null, 'DOT_0'];
    expect(g.useSwap()).toBe(true);
    expect(g.state.tray.filter(Boolean).length).toBe(3);
    expect(g.useSwap()).toBe(true);
    expect(g.useSwap()).toBe(false);
  });

  test('hammer deletes one filled cell, twice per game', () => {
    const g = new Game({ mode: 'classic', seed: 1 });
    g.state.board[idx(2, 2)] = 1;
    g.state.board[idx(3, 3)] = 1;
    g.state.board[idx(4, 4)] = 1;
    expect(g.useHammer(2, 2)).toBe(true);
    expect(g.state.board[idx(2, 2)]).toBe(CELL.EMPTY);
    expect(g.useHammer(3, 3)).toBe(true);
    expect(g.useHammer(4, 4)).toBe(false);
  });

  test('hammer on an empty cell does not consume the use', () => {
    const g = new Game({ mode: 'classic', seed: 1 });
    expect(g.useHammer(3, 3)).toBe(false);
    g.state.board[idx(2, 2)] = 1;
    expect(g.useHammer(2, 2)).toBe(true);
  });

  test('undo reverts the last placement but is disabled after a clear', () => {
    const g = new Game({ mode: 'classic', seed: 1 });
    g.state.tray = ['DOT_0', 'DOT_0', 'DOT_0'];
    g.place(0, 3, 3);
    expect(g.useUndo()).toBe(true);
    expect(g.state.board[idx(3, 3)]).toBe(CELL.EMPTY);
    expect(g.state.tray[0]).toBe('DOT_0');
    expect(g.state.score).toBe(0);
  });

  test('undo blocked after a clearing placement', () => {
    const g = new Game({ mode: 'classic', seed: 1 });
    g.state.tray = ['DOT_0', 'DOT_0', 'DOT_0'];
    fillRowExcept(g, 0, 7);
    g.place(0, 7, 0);
    expect(g.useUndo()).toBe(false);
  });

  test('undo twice per game at most', () => {
    const g = new Game({ mode: 'classic', seed: 1 });
    g.state.tray = ['DOT_0', 'DOT_0', 'DOT_0'];
    g.place(0, 3, 3);
    expect(g.useUndo()).toBe(true);
    g.place(0, 3, 3);
    expect(g.useUndo()).toBe(true);
    g.place(0, 3, 3);
    expect(g.useUndo()).toBe(false);
  });

  test('power-ups spent after a placement stay spent when it is undone', () => {
    const g = new Game({ mode: 'classic', seed: 1 });
    g.state.tray = ['DOT_0', 'DOT_0', 'DOT_0'];
    g.state.board[idx(6, 6)] = 1;
    g.place(0, 3, 3);
    expect(g.useHammer(6, 6)).toBe(true);
    expect(g.useUndo()).toBe(true);
    expect(g.state.used.hammer).toBe(1);
    expect(g.state.used.undo).toBe(1);
  });

  test('a power-up is earned every 15 cleared lines', () => {
    const g = new Game({ mode: 'classic', seed: 1 });
    g.state.totalLines = 14;
    g.state.tray = ['DOT_0', 'DOT_0', 'DOT_0'];
    fillRowExcept(g, 0, 7);
    g.state.board[idx(0, 7)] = 1; // avoid a perfect clear (which also earns one)
    const res = g.place(0, 7, 0)!;
    expect(res.linesCleared).toBe(1);
    expect(res.earned.length).toBe(1);
  });
});

describe('modes', () => {
  test('zen: stuck board dissolves the fullest rows instead of game over', () => {
    const g = new Game({ mode: 'zen', seed: 1 });
    for (let i = 0; i < 64; i++) g.state.board[i] = 1;
    for (let k = 0; k < 8; k++) {
      g.state.board[idx(k, k)] = CELL.EMPTY;
      g.state.board[idx((k + 1) % 8, k)] = CELL.EMPTY;
    }
    g.state.tray = ['DOT_0', 'SQ3_0', null];
    const res = g.place(0, 0, 0)!;
    expect(res.gameOver).toBe(false);
    expect(g.state.over).toBe(false);
    // dissolves happened (2 rows per pass until something fits again)
    let emptyCount = 0;
    for (let i = 0; i < 64; i++) if (g.state.board[i] === CELL.EMPTY) emptyCount++;
    expect(emptyCount).toBeGreaterThanOrEqual(16);
    // the stuck piece must now fit
    expect(g.totalValidMoves()).toBeGreaterThan(0);
  });

  test('rush: tray slot refills immediately after each placement', () => {
    const g = new Game({ mode: 'rush', seed: 1 });
    g.place(0, 0, 0);
    expect(g.state.tray.filter(Boolean).length).toBe(3);
  });

  test('rush: each placement spawns a time target on a filled cell (max 3)', () => {
    const g = new Game({ mode: 'rush', seed: 1 });
    g.state.tray = ['DOT_0', 'DOT_0', 'DOT_0'];
    g.place(0, 3, 3);
    let targets = Object.entries(g.state.aux.times);
    expect(targets.length).toBe(1);
    const [cell, seconds] = targets[0];
    expect(g.state.board[Number(cell)]).toBeGreaterThanOrEqual(1);
    expect(g.state.board[Number(cell)]).toBeLessThanOrEqual(8);
    expect(seconds).toBeGreaterThanOrEqual(2);
    expect(seconds).toBeLessThanOrEqual(5);
    for (let i = 0; i < 6; i++) {
      g.state.tray = ['DOT_0', 'DOT_0', 'DOT_0'];
      g.place(0, i, 5);
    }
    expect(Object.keys(g.state.aux.times).length).toBeLessThanOrEqual(3);
  });

  test('rush: clearing a line with a time target banks its seconds', () => {
    const g = new Game({ mode: 'rush', seed: 1 });
    g.state.tray = ['DOT_0', 'DOT_0', 'DOT_0'];
    for (let c = 0; c < 7; c++) g.state.board[idx(c, 0)] = 1;
    g.state.board[idx(0, 7)] = 1; // avoid perfect clear
    g.state.aux.times[idx(3, 0)] = 4;
    g.state.rushTimeLeft = 30;
    const res = g.place(0, 7, 0)!;
    expect(res.timeGained).toBe(4);
    expect(g.state.rushTimeLeft).toBeGreaterThanOrEqual(34);
    expect(g.state.aux.times[idx(3, 0)]).toBeUndefined();
  });

  test('classic: no time targets ever spawn', () => {
    const g = new Game({ mode: 'classic', seed: 1 });
    g.state.tray = ['DOT_0', 'DOT_0', 'DOT_0'];
    g.place(0, 3, 3);
    expect(Object.keys(g.state.aux.times).length).toBe(0);
  });

  test('rush: time runs out → game over', () => {
    const g = new Game({ mode: 'rush', seed: 1 });
    expect(g.state.rushTimeLeft).toBe(90);
    g.tickTime(89.5);
    expect(g.state.over).toBe(false);
    g.tickTime(1);
    expect(g.state.over).toBe(true);
  });

  test('daily: prefilled cells from seed, deterministic', () => {
    const a = new Game({ mode: 'daily', seed: 20260611 });
    const b = new Game({ mode: 'daily', seed: 20260611 });
    expect([...a.state.board]).toEqual([...b.state.board]);
    expect([...a.state.board].some((v) => v !== 0)).toBe(true);
  });
});

describe('serialization', () => {
  test('round-trips mid-game state and continues identically', () => {
    const g = new Game({ mode: 'classic', seed: 9 });
    const slot = g.state.tray.findIndex(Boolean);
    g.place(slot, 0, 0);
    const restored = Game.deserialize(g.serialize());
    expect(restored.state).toEqual(g.state);
    // both must deal identical future trays
    g.state.tray = ['DOT_0', 'DOT_0', 'DOT_0'];
    restored.state.tray = ['DOT_0', 'DOT_0', 'DOT_0'];
    g.place(0, 0, 5);
    g.place(1, 2, 5);
    g.place(2, 4, 5);
    restored.place(0, 0, 5);
    restored.place(1, 2, 5);
    restored.place(2, 4, 5);
    expect(restored.state.tray).toEqual(g.state.tray);
  });
});
