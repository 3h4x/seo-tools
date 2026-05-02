import { afterEach, describe, it, expect, vi } from 'vitest';

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

import { BetaAnalyticsDataClient } from '@google-analytics/data';
import { searchconsole_v1 } from '@googleapis/searchconsole';
import { getDb, upsertGa4Daily, upsertScDaily } from '../db';
import { discoverPropertyIds } from '../ga4';
import { getAuth } from '../google-auth';
import { batchRanges, startCollector } from '../collect-daily';
import { getManagedSites, getSCUrl } from '../sites';

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

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

describe('startCollector', () => {
  it('collects startup SC and GA4 rows with mocked clients', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-02T12:00:00Z'));

    const genesisRun = vi.fn();
    vi.mocked(getDb).mockReturnValue({
      prepare: vi.fn((sql: string) => {
        if (sql.includes('SELECT genesis_date')) {
          return { get: vi.fn(() => undefined) };
        }
        if (sql.includes('SELECT MAX(date)')) {
          return { get: vi.fn(() => ({ latest: null })) };
        }
        if (sql.includes('SELECT date FROM')) {
          return { all: vi.fn(() => []) };
        }
        if (sql.includes('INSERT OR REPLACE INTO daily_genesis')) {
          return { run: genesisRun };
        }
        throw new Error(`Unexpected SQL: ${sql}`);
      }),
    } as never);

    const site = {
      id: 'site1',
      name: 'Site One',
      domain: 'example.com',
      searchConsole: true,
      testPages: [],
    };
    vi.mocked(getManagedSites).mockResolvedValue([site]);
    vi.mocked(discoverPropertyIds).mockResolvedValue([{ ...site, ga4PropertyId: '123' }]);
    vi.mocked(getSCUrl).mockReturnValue('sc-domain:example.com');
    vi.mocked(getAuth).mockReturnValue('auth' as never);

    const scQuery = vi.fn().mockResolvedValue({
      data: {
        rows: [{
          keys: ['2026-04-01'],
          clicks: 11,
          impressions: 101,
          ctr: 0.109,
          position: 3.2,
        }],
      },
    });
    vi.mocked(searchconsole_v1.Searchconsole).mockImplementation(function SearchconsoleMock() {
      return {
        searchanalytics: { query: scQuery },
      };
    } as never);

    const runReport = vi.fn().mockResolvedValue([{
      rows: [{
        dimensionValues: [{ value: '20260402' }],
        metricValues: [
          { value: '7' },
          { value: '9' },
          { value: '13' },
          { value: '0.25' },
          { value: '42.5' },
        ],
      }],
    }]);
    vi.mocked(BetaAnalyticsDataClient).mockImplementation(function BetaAnalyticsDataClientMock() {
      return { runReport };
    } as never);

    startCollector();

    await vi.waitFor(() => {
      expect(upsertScDaily).toHaveBeenCalledWith('site1', [{
        date: '2026-04-01',
        clicks: 11,
        impressions: 101,
        ctr: 0.109,
        position: 3.2,
      }]);
      expect(upsertGa4Daily).toHaveBeenCalledWith('site1', [{
        date: '2026-04-02',
        users: 7,
        sessions: 9,
        views: 13,
        bounceRate: 0.25,
        avgDuration: 42.5,
      }]);
    });

    expect(scQuery.mock.calls[0][0]).toMatchObject({
      siteUrl: 'sc-domain:example.com',
      requestBody: {
        startDate: '2026-02-01',
        dimensions: ['date'],
        rowLimit: 500,
      },
    });
    expect(scQuery).toHaveBeenCalled();
    expect(runReport.mock.calls[0][0]).toMatchObject({
      property: 'properties/123',
      dateRanges: [{ startDate: '2026-02-01' }],
    });
    expect(runReport).toHaveBeenCalled();
    expect(genesisRun).toHaveBeenCalledWith('site1', 'sc', '2026-04-01');
    expect(genesisRun).toHaveBeenCalledWith('site1', 'ga4', '2026-04-02');
    expect(vi.getTimerCount()).toBe(1);
  });
});
