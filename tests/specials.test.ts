import { describe, expect, test } from 'vitest';
import { Rng } from '../src/core/rng';
import { CELL, idx, type Board } from '../src/core/board';
import {
  createSpecialsState,
  spawnOnDeal,
  tickPlacement,
  explodeBomb,
  grantWild,
  BOMB_FUSE,
  STONE_LIFETIME,
} from '../src/core/specials';

function board(fill: (c: number, r: number) => boolean = () => false): Board {
  const b = new Uint8Array(64);
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) if (fill(c, r)) b[idx(c, r)] = 1;
  return b;
}

describe('spawnOnDeal', () => {
  test('gem spawns on an empty cell every 3rd deal', () => {
    const b = board((c) => c < 4);
    const aux = createSpecialsState();
    spawnOnDeal(b, aux, new Rng(1), 3, 0);
    const gems = [...b].filter((v) => v === CELL.GEM);
    expect(gems.length).toBe(1);
    spawnOnDeal(b, aux, new Rng(2), 4, 0);
    expect([...b].filter((v) => v === CELL.GEM).length).toBe(1); // not a 3rd deal
  });

  test('ice spawns on a filled cell every 5th deal only from score 2000', () => {
    const b = board((c) => c < 4);
    const aux = createSpecialsState();
    spawnOnDeal(b, aux, new Rng(1), 5, 1999);
    expect([...b].includes(CELL.ICE)).toBe(false);
    spawnOnDeal(b, aux, new Rng(1), 5, 2000);
    expect([...b].filter((v) => v === CELL.ICE).length).toBe(1);
  });

  test('bomb spawns every 10th deal on an empty cell with a fuse of 9', () => {
    const b = board();
    const aux = createSpecialsState();
    spawnOnDeal(b, aux, new Rng(1), 10, 0);
    const bombIdx = [...b].findIndex((v) => v === CELL.BOMB);
    expect(bombIdx).toBeGreaterThanOrEqual(0);
    expect(aux.bombs[bombIdx]).toBe(BOMB_FUSE);
    expect(BOMB_FUSE).toBe(9);
  });

  test('no specials on a non-multiple deal', () => {
    const b = board((c) => c < 4);
    spawnOnDeal(b, createSpecialsState(), new Rng(1), 7, 5000);
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
    expect(STONE_LIFETIME).toBe(15);
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

describe('explodeBomb', () => {
  test('empties a 3×3 area but stones survive', () => {
    const b = board(() => true);
    const aux = createSpecialsState();
    b[idx(4, 4)] = CELL.STONE;
    aux.stones[idx(4, 4)] = 10;
    const cleared = explodeBomb(b, aux, idx(3, 3));
    for (const [c, r] of [[2, 2], [3, 3], [4, 3], [2, 4], [3, 4]] as const) {
      expect(b[idx(c, r)]).toBe(CELL.EMPTY);
    }
    expect(b[idx(4, 4)]).toBe(CELL.STONE);
    expect(b[idx(5, 5)]).toBe(1); // outside blast
    expect(cleared).not.toContain(idx(4, 4));
    expect(cleared).toContain(idx(2, 2));
  });

  test('clips at board edges', () => {
    const b = board(() => true);
    explodeBomb(b, createSpecialsState(), idx(0, 0));
    expect(b[idx(0, 0)]).toBe(CELL.EMPTY);
    expect(b[idx(1, 1)]).toBe(CELL.EMPTY);
    expect(b[idx(2, 2)]).toBe(1);
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

describe('grantWild', () => {
  test('places a wild on a random empty cell', () => {
    const b = board((c) => c < 7);
    grantWild(b, new Rng(3));
    expect([...b].filter((v) => v === CELL.WILD).length).toBe(1);
  });

  test('does nothing on a full board', () => {
    const b = board(() => true);
    grantWild(b, new Rng(3));
    expect([...b].includes(CELL.WILD)).toBe(false);
  });
});
