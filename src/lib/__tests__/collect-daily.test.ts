import { describe, it, expect, vi } from 'vitest';

vi.mock('../google-auth', () => ({ getAuth: vi.fn() }));
vi.mock('../db', () => ({
  getDb: vi.fn(),
  upsertScDaily: vi.fn(),
  upsertGa4Daily: vi.fn(),
}));
vi.mock('../sites', () => ({ getManagedSites: vi.fn(), getSCUrl: vi.fn() }));
vi.mock('../ga4', () => ({ discoverPropertyIds: vi.fn() }));
vi.mock('@googleapis/searchconsole', () => ({ searchconsole_v1: { Searchconsole: vi.fn() } }));
vi.mock('@google-analytics/data', () => ({ BetaAnalyticsDataClient: vi.fn() }));

import { batchRanges } from '../collect-daily';

describe('batchRanges', () => {
  it('returns empty array for empty input', () => {
    expect(batchRanges([])).toEqual([]);
  });

  it('returns single range for a single date', () => {
    expect(batchRanges(['2024-01-15'])).toEqual([{ start: '2024-01-15', end: '2024-01-15' }]);
  });

  it('returns single range for consecutive dates', () => {
    expect(batchRanges(['2024-01-01', '2024-01-02', '2024-01-03'])).toEqual([
      { start: '2024-01-01', end: '2024-01-03' },
    ]);
  });

  it('splits non-consecutive dates into separate ranges', () => {
    expect(batchRanges(['2024-01-01', '2024-01-03'])).toEqual([
      { start: '2024-01-01', end: '2024-01-01' },
      { start: '2024-01-03', end: '2024-01-03' },
    ]);
  });

  it('handles multiple gaps correctly', () => {
    const dates = ['2024-01-01', '2024-01-02', '2024-01-05', '2024-01-06', '2024-01-10'];
    expect(batchRanges(dates)).toEqual([
      { start: '2024-01-01', end: '2024-01-02' },
      { start: '2024-01-05', end: '2024-01-06' },
      { start: '2024-01-10', end: '2024-01-10' },
    ]);
  });

  it('sorts input dates before batching', () => {
    const unordered = ['2024-01-03', '2024-01-01', '2024-01-02'];
    expect(batchRanges(unordered)).toEqual([{ start: '2024-01-01', end: '2024-01-03' }]);
  });

  it('handles month boundary correctly', () => {
    expect(batchRanges(['2024-01-31', '2024-02-01'])).toEqual([
      { start: '2024-01-31', end: '2024-02-01' },
    ]);
  });

  it('handles year boundary correctly', () => {
    expect(batchRanges(['2023-12-31', '2024-01-01'])).toEqual([
      { start: '2023-12-31', end: '2024-01-01' },
    ]);
  });

  it('does not mutate input array', () => {
    const input = ['2024-01-03', '2024-01-01'];
    batchRanges(input);
    expect(input).toEqual(['2024-01-03', '2024-01-01']);
  });
});
