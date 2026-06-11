import { describe, expect, test } from 'vitest';
import { Rng } from '../src/core/rng';

describe('Rng', () => {
  test('same seed produces same sequence', () => {
    const a = new Rng(12345);
    const b = new Rng(12345);
    const seqA = Array.from({ length: 20 }, () => a.next());
    const seqB = Array.from({ length: 20 }, () => b.next());
    expect(seqA).toEqual(seqB);
  });

  test('different seeds produce different sequences', () => {
    const a = new Rng(1);
    const b = new Rng(2);
    const seqA = Array.from({ length: 10 }, () => a.next());
    const seqB = Array.from({ length: 10 }, () => b.next());
    expect(seqA).not.toEqual(seqB);
  });

  test('next returns floats in [0, 1)', () => {
    const rng = new Rng(99);
    for (let i = 0; i < 1000; i++) {
      const v = rng.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  test('int(n) returns integers in [0, n)', () => {
    const rng = new Rng(7);
    const seen = new Set<number>();
    for (let i = 0; i < 1000; i++) {
      const v = rng.int(8);
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(8);
      seen.add(v);
    }
    expect(seen.size).toBe(8);
  });

  test('state can be saved and restored to replay the sequence', () => {
    const rng = new Rng(42);
    rng.next();
    rng.next();
    const state = rng.getState();
    const ahead = [rng.next(), rng.next(), rng.next()];
    rng.setState(state);
    expect([rng.next(), rng.next(), rng.next()]).toEqual(ahead);
  });

  test('pick returns weighted choices deterministically', () => {
    const rng = new Rng(5);
    const items = ['a', 'b', 'c'];
    const weights = [0, 0, 1];
    for (let i = 0; i < 50; i++) {
      expect(rng.weightedPick(items, weights)).toBe('c');
    }
  });
});
