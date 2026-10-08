import { describe, expect, test } from 'vitest';
import { Rng } from '../src/core/rng';
import { CELL, idx, type Board } from '../src/core/board';
import {
  createSpecialsState,
  spawnOnDeal,
  tickPlacement,
  explodeBomb,
  grantWild,
  shatterStones,
  wildAura,
  BOMB_FUSE,
  STONE_LIFETIME,
  UNLOCK_LEVEL,
  unlockedBetween,
  starburst,
  prismShatter,
} from '../src/core/specials';

function board(fill: (c: number, r: number) => boolean = () => false): Board {
  const b = new Uint8Array(64);
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) if (fill(c, r)) b[idx(c, r)] = 1;
  return b;
}

describe('spawnOnDeal', () => {
  test('gem takes over a placed block every 3rd deal — never an empty cell', () => {
    const b = board((c) => c < 4);
    const aux = createSpecialsState();
    const emptyBefore = [...b].filter((v) => v === CELL.EMPTY).length;
    spawnOnDeal(b, aux, new Rng(1), 3, 10);
    const gems = [...b].filter((v) => v === CELL.GEM);
    expect(gems.length).toBe(1);
    expect([...b].filter((v) => v === CELL.EMPTY).length).toBe(emptyBefore);
    spawnOnDeal(b, aux, new Rng(2), 4, 10);
    expect([...b].filter((v) => v === CELL.GEM).length).toBe(1); // not a 3rd deal
  });

  test('specials unlock with the level ladder: gem 2, wild 3, cross 4, bomb 5, prism 6, ice 8', () => {
    expect(UNLOCK_LEVEL).toEqual({ gem: 2, wild: 3, cross: 4, bomb: 5, prism: 6, ice: 8 });
    const b = board((c) => c < 4);
    spawnOnDeal(b, createSpecialsState(), new Rng(1), 3, 1); // level 1: no gem yet
    expect([...b].includes(CELL.GEM)).toBe(false);
    spawnOnDeal(b, createSpecialsState(), new Rng(1), 10, 4); // level 4: no bomb yet
    expect([...b].includes(CELL.BOMB)).toBe(false);
    expect(unlockedBetween(1, 2)).toEqual(['gem']);
    expect(unlockedBetween(2, 5)).toEqual(['wild', 'cross', 'bomb']);
    expect(unlockedBetween(5, 5)).toEqual([]);
  });

  test('no placed blocks → no gem (specials never eat free space)', () => {
    const b = board();
    spawnOnDeal(b, createSpecialsState(), new Rng(1), 3, 10);
    expect([...b].every((v) => v === CELL.EMPTY)).toBe(true);
  });

  test('ice spawns on a filled cell every 5th deal only from level 8', () => {
    const b = board((c) => c < 4);
    const aux = createSpecialsState();
    spawnOnDeal(b, aux, new Rng(1), 5, 7);
    expect([...b].includes(CELL.ICE)).toBe(false);
    spawnOnDeal(b, aux, new Rng(1), 5, 8);
    expect([...b].filter((v) => v === CELL.ICE).length).toBe(1);
  });

  test('ice only freezes cells in a row or column that is at least half full', () => {
    // scattered cells: no line holds 4 → no eligible cell
    const sparse = board((c, r) => c === r);
    spawnOnDeal(sparse, createSpecialsState(), new Rng(1), 5, 10);
    expect([...sparse].includes(CELL.ICE)).toBe(false);
    // row 2 has 4 filled cells, plus stray singles elsewhere
    for (let seed = 0; seed < 30; seed++) {
      const b = board((c, r) => (r === 2 && c < 4) || (c === 7 && r === 6));
      spawnOnDeal(b, createSpecialsState(), new Rng(seed), 5, 10);
      const ice = [...b].findIndex((v) => v === CELL.ICE);
      expect(Math.floor(ice / 8), `seed ${seed}`).toBe(2);
    }
  });

  test('bomb takes over a placed block every 10th deal with a fuse of 12', () => {
    const b = board((c, r) => c < 3 && r < 3);
    const aux = createSpecialsState();
    spawnOnDeal(b, aux, new Rng(1), 10, 10);
    const bombIdx = [...b].findIndex((v) => v === CELL.BOMB);
    expect(bombIdx).toBeGreaterThanOrEqual(0);
    expect(bombIdx % 8).toBeLessThan(3); // one of the placed blocks
    expect(Math.floor(bombIdx / 8)).toBeLessThan(3);
    expect(aux.bombs[bombIdx]).toBe(BOMB_FUSE);
    expect(BOMB_FUSE).toBe(12);
  });

  test('starburst and prism take over placed blocks on their deals once unlocked', () => {
    const b = board((c, r) => c < 3 && r < 3);
    const aux = createSpecialsState();
    spawnOnDeal(b, aux, new Rng(1), 6, 3); // level 3: no starburst yet
    expect([...b].includes(CELL.CROSS)).toBe(false);
    spawnOnDeal(b, aux, new Rng(1), 6, 4);
    expect([...b].filter((v) => v === CELL.CROSS).length).toBe(1);
    spawnOnDeal(b, aux, new Rng(2), 8, 6);
    const prism = [...b].findIndex((v) => v === CELL.PRISM);
    expect(prism).toBeGreaterThanOrEqual(0);
    expect(aux.prisms[prism]).toBe(1); // remembers the colour it took over
    expect(aux.under[prism]).toBe(1); // and draws it underneath
    const cross = [...b].findIndex((v) => v === CELL.CROSS);
    expect(aux.under[cross]).toBe(1);
    expect([...b].filter((v) => v === CELL.EMPTY).length).toBe(64 - 9); // no free space eaten
  });

  test('no specials on a non-multiple deal', () => {
    const b = board((c) => c < 4);
    spawnOnDeal(b, createSpecialsState(), new Rng(1), 7, 10);
    expect([...b].every((v) => v === 0 || v === 1)).toBe(true);
  });
});

describe('tickPlacement', () => {
  test('bomb fuse counts down and petrifies into stone at 0', () => {
    const b = board();
    const aux = createSpecialsState();
    const i = idx(3, 3);
    b[i] = CELL.BOMB;
    aux.bombs[i] = 2;
    tickPlacement(b, aux);
    expect(aux.bombs[i]).toBe(1);
    expect(b[i]).toBe(CELL.BOMB);
    tickPlacement(b, aux);
    expect(aux.bombs[i]).toBeUndefined();
    expect(b[i]).toBe(CELL.STONE);
    expect(aux.stones[i]).toBe(STONE_LIFETIME);
    expect(STONE_LIFETIME).toBe(8);
  });

  test('stone expires to empty after its lifetime', () => {
    const b = board();
    const aux = createSpecialsState();
    const i = idx(0, 0);
    b[i] = CELL.STONE;
    aux.stones[i] = 2;
    tickPlacement(b, aux);
    expect(b[i]).toBe(CELL.STONE);
    tickPlacement(b, aux);
    expect(b[i]).toBe(CELL.EMPTY);
    expect(aux.stones[i]).toBeUndefined();
  });
});

describe('shatterStones', () => {
  test('a clear through or beside a stone shatters it; a distant one does not', () => {
    const b = board();
    const aux = createSpecialsState();
    for (const i of [idx(3, 3), idx(0, 5), idx(6, 0)]) {
      b[i] = CELL.STONE;
      aux.stones[i] = 8;
    }
    // row 4 cleared: (3,3) and (0,5) are adjacent to it, (6,0) isn't
    const cells = new Set(Array.from({ length: 8 }, (_, c) => idx(c, 4)));
    const shattered = shatterStones(b, aux, cells);
    expect(shattered.sort((x, y) => x - y)).toEqual([idx(3, 3), idx(0, 5)]);
    expect(b[idx(3, 3)]).toBe(CELL.EMPTY);
    expect(b[idx(6, 0)]).toBe(CELL.STONE);
    expect(aux.stones[idx(6, 0)]).toBe(8);
  });

  test('horizontal adjacency does not wrap across rows', () => {
    const b = board();
    const aux = createSpecialsState();
    b[idx(0, 3)] = CELL.STONE;
    aux.stones[idx(0, 3)] = 8;
    // column 7 cleared: idx(7,2) is index-adjacent to idx(0,3) but not on the board
    const cells = new Set(Array.from({ length: 8 }, (_, r) => idx(7, r)));
    expect(shatterStones(b, aux, cells)).toEqual([]);
  });
});

describe('explodeBomb', () => {
  test('empties a 5×5 area, stones included', () => {
    const b = board(() => true);
    const aux = createSpecialsState();
    b[idx(4, 4)] = CELL.STONE;
    aux.stones[idx(4, 4)] = 10;
    const blast = explodeBomb(b, aux, idx(3, 3));
    for (let r = 1; r <= 5; r++) for (let c = 1; c <= 5; c++) expect(b[idx(c, r)]).toBe(CELL.EMPTY);
    expect(aux.stones[idx(4, 4)]).toBeUndefined();
    expect(b[idx(6, 6)]).toBe(1); // outside blast
    expect(b[idx(0, 3)]).toBe(1);
    expect(blast.cleared).toContain(idx(4, 4));
    expect(blast.cleared.length).toBe(25);
    expect(blast.centers).toEqual([idx(3, 3)]);
  });

  test('clips at board edges', () => {
    const b = board(() => true);
    explodeBomb(b, createSpecialsState(), idx(0, 0));
    expect(b[idx(0, 0)]).toBe(CELL.EMPTY);
    expect(b[idx(2, 2)]).toBe(CELL.EMPTY);
    expect(b[idx(3, 3)]).toBe(1);
  });

  test('bombs caught in the blast chain-react', () => {
    const b = board(() => true);
    const aux = createSpecialsState();
    b[idx(5, 5)] = CELL.BOMB;
    aux.bombs[idx(5, 5)] = 5;
    const blast = explodeBomb(b, aux, idx(3, 3));
    expect(blast.centers).toEqual([idx(3, 3), idx(5, 5)]);
    expect(b[idx(7, 7)]).toBe(CELL.EMPTY); // reached only by the second bomb
  });

  test('gems in the blast are reported for payout', () => {
    const b = board(() => true);
    b[idx(2, 2)] = CELL.GEM;
    const blast = explodeBomb(b, createSpecialsState(), idx(3, 3));
    expect(blast.gems).toEqual([idx(2, 2)]);
  });

  test('removes a frozen aux bomb caught in the blast', () => {
    const b = board(() => true);
    const aux = createSpecialsState();
    b[idx(4, 4)] = CELL.BOMB;
    aux.bombs[idx(4, 4)] = 5;
    explodeBomb(b, aux, idx(3, 3));
    expect(b[idx(4, 4)]).toBe(CELL.EMPTY);
    expect(aux.bombs[idx(4, 4)]).toBeUndefined();
  });
});

describe('virgin-cell weighting', () => {
  test('wild zones prefer cells never built on (3× weight)', () => {
    // row 0 empty and never touched; row 1 empty but previously used
    const touched = new Uint8Array(64);
    for (let c = 0; c < 8; c++) touched[idx(c, 1)] = 1;
    let virgin = 0;
    let used = 0;
    for (let seed = 0; seed < 400; seed++) {
      const b = board((_, r) => r >= 2); // rows 0,1 empty
      const aux = createSpecialsState();
      grantWild(b, new Rng(seed), touched, aux);
      const gem = aux.wilds[0] ?? -1;
      if (gem >= 0 && gem < 8) virgin++;
      else if (gem >= 8 && gem < 16) used++;
    }
    // 3:1 weighting → expect roughly 75% on virgin cells
    expect(virgin / (virgin + used)).toBeGreaterThan(0.6);
    expect(used).toBeGreaterThan(0); // used cells stay possible, just rarer
  });
});

describe('grantWild', () => {
  test('registers a wild zone centered on an empty cell, board untouched', () => {
    const b = board((c) => c < 7);
    const aux = createSpecialsState();
    grantWild(b, new Rng(3), null, aux);
    expect(aux.wilds.length).toBe(1);
    expect(b[aux.wilds[0]]).toBe(CELL.EMPTY);
  });

  test('does nothing on a full board', () => {
    const b = board(() => true);
    const aux = createSpecialsState();
    grantWild(b, new Rng(3), null, aux);
    expect(aux.wilds.length).toBe(0);
  });
});

describe('wildAura', () => {
  test('covers a cross reaching two cells each way', () => {
    const aura = wildAura([idx(4, 4)]);
    const expected = [idx(4, 4)];
    for (const d of [1, 2]) expected.push(idx(4 - d, 4), idx(4 + d, 4), idx(4, 4 - d), idx(4, 4 + d));
    expect([...aura].sort((a, b2) => a - b2)).toEqual(expected.sort((a, b2) => a - b2));
  });

  test('clips at board edges', () => {
    const aura = wildAura([idx(0, 0)]);
    expect(aura.size).toBe(5); // center, right×2, down×2
    expect(aura.has(idx(2, 0))).toBe(true);
    expect(aura.has(idx(0, 2))).toBe(true);
  });
});

describe('starburst', () => {
  test('clears the crossing lines (stone included) and skips lines already cleared', () => {
    const b = board(() => true);
    const aux = createSpecialsState();
    b[idx(5, 3)] = CELL.STONE;
    aux.stones[idx(5, 3)] = 8;
    const out = starburst(b, aux, idx(2, 3), { rows: [3], cols: [] });
    expect(out.rows).toEqual([]);
    expect(out.cols).toEqual([2]);
    expect(out.extraLines).toBe(1);
    expect(out.cells.length).toBe(8);
    for (let r = 0; r < 8; r++) expect(b[idx(2, r)]).toBe(CELL.EMPTY);
    expect(b[idx(5, 3)]).toBe(CELL.STONE); // row 3 was the line already cleared — untouched here
    const again = starburst(b, aux, idx(5, 5), { rows: [], cols: [] });
    expect(again.extraLines).toBe(2);
    expect(b[idx(5, 3)]).toBe(CELL.EMPTY); // stone in the fired column is gone
    expect(aux.stones[idx(5, 3)]).toBeUndefined();
  });
});

describe('prismShatter', () => {
  test('removes every plain block of the remembered colour and nothing else', () => {
    const b = board();
    const aux = createSpecialsState();
    b[idx(0, 0)] = 3; b[idx(7, 7)] = 3; b[idx(4, 4)] = 3;
    b[idx(1, 1)] = 5;
    b[idx(2, 2)] = CELL.GEM;
    aux.prisms[idx(6, 6)] = 3;
    const cells = prismShatter(b, aux, idx(6, 6));
    expect(cells.sort((x, y) => x - y)).toEqual([idx(0, 0), idx(4, 4), idx(7, 7)]);
    expect(b[idx(1, 1)]).toBe(5);
    expect(b[idx(2, 2)]).toBe(CELL.GEM);
    expect(aux.prisms[idx(6, 6)]).toBeUndefined();
  });
});
