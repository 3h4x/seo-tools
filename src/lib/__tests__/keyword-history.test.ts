import { describe, it, expect } from 'vitest';
import { computeKeywordDeltas } from '../keyword-history';

describe('computeKeywordDeltas', () => {
  it('returns empty array for empty history', () => {
    expect(computeKeywordDeltas([], '2024-01-30')).toEqual([]);
  });

  it('marks keyword as new when only one data point exists', () => {
    const history = [{ date: '2024-01-30', query: 'clanker', position: 5.0 }];
    const [delta] = computeKeywordDeltas(history, '2024-01-30');
    expect(delta.trend).toBe('new');
    expect(delta.delta7d).toBeNull();
    expect(delta.delta30d).toBeNull();
    expect(delta.currentPosition).toBe(5.0);
  });

  it('calculates positive delta when ranking improves (lower position number)', () => {
    const today = '2024-01-30';
    const history = [
      { date: '2024-01-23', query: 'clanker token', position: 8.0 },
      { date: '2024-01-30', query: 'clanker token', position: 5.0 },
    ];
    const [delta] = computeKeywordDeltas(history, today);
    expect(delta.delta7d).toBeCloseTo(3.0); // 8.0 - 5.0 = +3 improvement
    expect(delta.trend).toBe('up');
    expect(delta.currentPosition).toBe(5.0);
    expect(delta.position7d).toBe(8.0);
  });

  it('calculates negative delta when ranking declines (higher position number)', () => {
    const today = '2024-01-30';
    const history = [
      { date: '2024-01-23', query: 'clanker token', position: 3.0 },
      { date: '2024-01-30', query: 'clanker token', position: 7.0 },
    ];
    const [delta] = computeKeywordDeltas(history, today);
    expect(delta.delta7d).toBeCloseTo(-4.0); // 3.0 - 7.0 = -4 decline
    expect(delta.trend).toBe('down');
  });

  it('marks trend as flat when change is less than 0.5 positions', () => {
    const today = '2024-01-30';
    const history = [
      { date: '2024-01-23', query: 'test', position: 5.3 },
      { date: '2024-01-30', query: 'test', position: 5.1 },
    ];
    const [delta] = computeKeywordDeltas(history, today);
    expect(delta.trend).toBe('flat');
  });

  it('uses closest date within ±2 day window for 7d comparison', () => {
    const today = '2024-01-30';
    // 7d target = 2024-01-23
    const history = [
      { date: '2024-01-22', query: 'test', position: 9.0 }, // 1 day from target — closer
      { date: '2024-01-25', query: 'test', position: 8.0 }, // 2 days from target
      { date: '2024-01-30', query: 'test', position: 5.0 },
    ];
    const [delta] = computeKeywordDeltas(history, today);
    expect(delta.position7d).toBe(9.0); // Jan 22 is 1 day from Jan 23 target (closer than Jan 25)
    expect(delta.delta7d).toBeCloseTo(4.0);
  });

  it('returns null for 7d when no date falls within window', () => {
    const today = '2024-01-30';
    const history = [
      { date: '2024-01-20', query: 'test', position: 8.0 }, // 10 days ago, outside ±2 window for 7d
      { date: '2024-01-30', query: 'test', position: 5.0 },
    ];
    const [delta] = computeKeywordDeltas(history, today);
    expect(delta.delta7d).toBeNull();
    expect(delta.position7d).toBeNull();
  });

  it('handles multiple queries independently', () => {
    const today = '2024-01-30';
    const history = [
      { date: '2024-01-23', query: 'alpha', position: 5.0 },
      { date: '2024-01-30', query: 'alpha', position: 3.0 },
      { date: '2024-01-23', query: 'beta', position: 2.0 },
      { date: '2024-01-30', query: 'beta', position: 4.0 },
    ];
    const deltas = computeKeywordDeltas(history, today);
    const alpha = deltas.find((d) => d.query === 'alpha')!;
    const beta = deltas.find((d) => d.query === 'beta')!;
    expect(alpha.delta7d).toBeCloseTo(2.0);
    expect(alpha.trend).toBe('up');
    expect(beta.delta7d).toBeCloseTo(-2.0);
    expect(beta.trend).toBe('down');
  });

  it('sorts results by currentPosition ascending (best rank first)', () => {
    const today = '2024-01-30';
    const history = [
      { date: '2024-01-30', query: 'buried', position: 15.0 },
      { date: '2024-01-30', query: 'top', position: 1.5 },
      { date: '2024-01-30', query: 'middle', position: 7.0 },
    ];
    const deltas = computeKeywordDeltas(history, today);
    expect(deltas.map((d) => d.query)).toEqual(['top', 'middle', 'buried']);
  });

  it('uses wider ±5 day window for 30d comparison', () => {
    const today = '2024-01-30';
    // 30d target = 2023-12-31
    const history = [
      { date: '2023-12-28', query: 'test', position: 10.0 }, // 3 days before Dec 31 — within ±5 window
      { date: '2024-01-30', query: 'test', position: 5.0 },
    ];
    const [delta] = computeKeywordDeltas(history, today);
    expect(delta.position30d).toBe(10.0);
    expect(delta.delta30d).toBeCloseTo(5.0);
  });

  it('does not use today row as the 7d historical comparison', () => {
    const today = '2024-01-30';
    const history = [
      { date: '2024-01-30', query: 'test', position: 5.0 }, // today only
    ];
    const [delta] = computeKeywordDeltas(history, today);
    expect(delta.delta7d).toBeNull(); // today should not match 7d target
  });
});
