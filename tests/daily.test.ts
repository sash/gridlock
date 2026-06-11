import { describe, expect, test } from 'vitest';
import { dailySeed, dailyKey, shareCard } from '../src/core/daily';
import { Game } from '../src/core/game';
import { CELL, idx } from '../src/core/board';

describe('dailySeed', () => {
  test('derives a deterministic seed from the calendar date', () => {
    const d = new Date(2026, 5, 11); // June 11 2026, local time
    expect(dailySeed(d)).toBe(dailySeed(new Date(2026, 5, 11, 23, 59)));
    expect(dailySeed(d)).not.toBe(dailySeed(new Date(2026, 5, 12)));
  });

  test('dailyKey is a yyyy-mm-dd string for the attempt lock', () => {
    expect(dailyKey(new Date(2026, 5, 11))).toBe('2026-06-11');
    expect(dailyKey(new Date(2026, 0, 2))).toBe('2026-01-02');
  });
});

describe('shareCard', () => {
  test('renders 8 emoji rows plus a header with score', () => {
    const g = new Game({ mode: 'daily', seed: dailySeed(new Date(2026, 5, 11)) });
    g.state.score = 1234;
    const card = shareCard(g.state, new Date(2026, 5, 11));
    const lines = card.split('\n');
    expect(lines[0]).toContain('GridLock');
    expect(lines[0]).toContain('2026-06-11');
    expect(lines[1]).toContain('1234');
    expect(lines.length).toBe(2 + 8);
    for (const row of lines.slice(2)) expect([...row].length).toBe(8);
  });

  test('uses distinct emoji for empty, filled and special cells', () => {
    const g = new Game({ mode: 'classic', seed: 1 });
    g.state.board.fill(0);
    g.state.board[idx(0, 0)] = 1;
    g.state.board[idx(1, 0)] = CELL.GEM;
    const card = shareCard(g.state, new Date(2026, 5, 11));
    const firstRow = card.split('\n')[2];
    const cells = [...firstRow];
    expect(cells[0]).not.toBe(cells[2]); // filled vs empty
    expect(cells[1]).toBe('💎');
  });
});
