import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';

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
import { getManagedSites, getSCUrl } from '../sites';
import { batchRanges } from '../date-only';

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

async function loadCollectDailyModule() {
  return import('../collect-daily');
}

type DbState = {
  genesis?: Record<string, string>;
  latest?: Record<string, string | null>;
  existing?: Record<string, string[]>;
};

function mockDbState(state: DbState = {}) {
  const genesis = new Map(Object.entries(state.genesis ?? {}));
  const latest = new Map(Object.entries(state.latest ?? {}));
  const existing = new Map(Object.entries(state.existing ?? {}));
  const genesisRun = vi.fn((siteId: string, source: string, date: string) => {
    genesis.set(`${source}:${siteId}`, date);
  });

  vi.mocked(getDb).mockReturnValue({
    prepare: vi.fn((sql: string) => {
      if (sql.includes('SELECT genesis_date')) {
        return {
          get: vi.fn((siteId: string, source: string) => {
            const value = genesis.get(`${source}:${siteId}`);
            return value ? { genesis_date: value } : undefined;
          }),
        };
      }
      if (sql.includes('SELECT MAX(date)')) {
        return {
          get: vi.fn((siteId: string) => ({
            latest: latest.get(siteId) ?? null,
          })),
        };
      }
      if (sql.includes('SELECT date FROM')) {
        return {
          all: vi.fn((siteId: string, start: string, end: string) => {
            const rows = existing.get(siteId) ?? [];
            return rows
              .filter(date => date >= start && date <= end)
              .map(date => ({ date }));
          }),
        };
      }
      if (sql.includes('INSERT OR REPLACE INTO daily_genesis')) {
        return { run: genesisRun };
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    }),
  } as never);

  return { genesisRun };
}

function mockSites() {
  const site = {
    id: 'site1',
    name: 'Site One',
    domain: 'example.com',
    searchConsole: true,
    testPages: [],
  };

  vi.mocked(getManagedSites).mockResolvedValue([site]);
  vi.mocked(discoverPropertyIds).mockResolvedValue([{ ...site, ga4PropertyId: 'properties/123' }]);
  vi.mocked(getSCUrl).mockReturnValue('sc-domain:example.com');
  vi.mocked(getAuth).mockReturnValue('auth' as never);

  return site;
}

function mockClients(options?: {
  scRows?: Array<{
    keys?: string[];
    clicks?: number;
    impressions?: number;
    ctr?: number;
    position?: number;
  }>;
  ga4Rows?: Array<{
    dimensionValues?: Array<{ value?: string }>;
    metricValues?: Array<{ value?: string }>;
  }>;
}) {
  const scQuery = vi.fn().mockResolvedValue({ data: { rows: options?.scRows ?? [] } });
  vi.mocked(searchconsole_v1.Searchconsole).mockImplementation(function SearchconsoleMock() {
    return {
      searchanalytics: { query: scQuery },
    };
  } as never);

  const runReport = vi.fn().mockResolvedValue([{ rows: options?.ga4Rows ?? [] }]);
  vi.mocked(BetaAnalyticsDataClient).mockImplementation(function BetaAnalyticsDataClientMock() {
    return { runReport };
  } as never);

  return { scQuery, runReport };
}

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

    const { genesisRun } = mockDbState();
    mockSites();
    const { startCollector } = await loadCollectDailyModule();
    const { scQuery, runReport } = mockClients({
      scRows: [{
        keys: ['2026-04-01'],
        clicks: 11,
        impressions: 101,
        ctr: 0.109,
        position: 3.2,
      }],
      ga4Rows: [{
        dimensionValues: [{ value: '20260402' }],
        metricValues: [
          { value: '7' },
          { value: '9' },
          { value: '13' },
          { value: '0.25' },
          { value: '42.5' },
        ],
      }],
    });

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

  it('backfills from the full window when some dates exist at the end', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-02T12:00:00Z'));

    mockDbState({
      genesis: {
        'sc:site1': '2026-04-01',
        'ga4:site1': '2026-04-01',
      },
      existing: {
        // Only the last day is present — all earlier dates should be backfilled
        site1: ['2026-04-30'],
      },
    });
    mockSites();
    const { startCollector } = await loadCollectDailyModule();
    const { scQuery, runReport } = mockClients();

    startCollector();

    await vi.waitFor(() => {
      expect(scQuery).toHaveBeenCalled();
      expect(runReport).toHaveBeenCalled();
    });

    // Backfill should start from genesis, not from after MAX(date)
    expect(scQuery.mock.calls[0][0].requestBody).toMatchObject({
      startDate: '2026-04-01',
    });
    expect(runReport.mock.calls[0][0].dateRanges[0]).toMatchObject({
      startDate: '2026-04-01',
    });
  });

  it('backfills a missing middle date when endpoints are already stored', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-10T12:00:00Z'));

    mockDbState({
      genesis: {
        'sc:site1': '2026-04-01',
        'ga4:site1': '2026-04-01',
      },
      existing: {
        // 2026-04-02 is missing between 04-01 and 04-03
        site1: ['2026-04-01', '2026-04-03', '2026-04-04', '2026-04-05', '2026-04-06', '2026-04-07', '2026-04-08'],
      },
    });
    mockSites();
    const { startCollector } = await loadCollectDailyModule();
    const { scQuery, runReport } = mockClients();

    startCollector();

    await vi.waitFor(() => {
      expect(scQuery).toHaveBeenCalled();
      expect(runReport).toHaveBeenCalled();
    });

    // The first batch should be the isolated middle gap (2026-04-02)
    expect(scQuery.mock.calls[0][0].requestBody).toMatchObject({
      startDate: '2026-04-02',
      endDate: '2026-04-02',
    });
  });

  it('keeps a single continuous fetch range across the spring DST boundary', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-02T12:00:00Z'));

    mockDbState({
      genesis: {
        'sc:site1': '2026-03-27',
        'ga4:site1': '2026-03-27',
      },
      existing: {
        site1: ['2026-03-27'],
      },
    });
    mockSites();
    const { startCollector } = await loadCollectDailyModule();
    const { scQuery, runReport } = mockClients();

    startCollector();

    await vi.waitFor(() => {
      expect(scQuery).toHaveBeenCalled();
      expect(runReport).toHaveBeenCalled();
    });

    expect(scQuery).toHaveBeenCalledTimes(1);
    expect(scQuery.mock.calls[0][0].requestBody).toMatchObject({
      startDate: '2026-03-28',
      endDate: '2026-03-31',
    });
    expect(runReport).toHaveBeenCalledTimes(1);
    expect(runReport.mock.calls[0][0].dateRanges).toEqual([
      { startDate: '2026-03-28', endDate: '2026-04-01' },
    ]);
  });

  it('respects a later genesis cutoff when history predates first known data', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-02T12:00:00Z'));

    mockDbState({
      genesis: {
        'sc:site1': '2026-03-15',
        'ga4:site1': '2026-03-20',
      },
    });
    mockSites();
    const { startCollector } = await loadCollectDailyModule();
    const { scQuery, runReport } = mockClients();

    startCollector();

    await vi.waitFor(() => {
      expect(scQuery).toHaveBeenCalled();
      expect(runReport).toHaveBeenCalled();
    });

    expect(scQuery.mock.calls[0][0].requestBody.startDate).toBe('2026-03-15');
    expect(runReport.mock.calls[0][0].dateRanges[0].startDate).toBe('2026-03-20');
  });

  it('sets genesis to the day after the empty range when APIs return no rows', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-02T12:00:00Z'));

    // No existing data, no genesis — full window is scanned, API returns 0 rows
    const { genesisRun } = mockDbState();
    mockSites();
    const { startCollector } = await loadCollectDailyModule();
    mockClients(); // default: returns empty rows

    startCollector();

    await vi.waitFor(() => {
      expect(upsertScDaily).toHaveBeenCalledWith('site1', []);
      expect(upsertGa4Daily).toHaveBeenCalledWith('site1', []);
    });

    // Genesis set to the day after each source's end-of-window
    expect(genesisRun).toHaveBeenCalledWith('site1', 'sc', '2026-05-01');
    expect(genesisRun).toHaveBeenCalledWith('site1', 'ga4', '2026-05-02');
  });

  it('startCollector is idempotent — second call does not add a second interval', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-02T12:00:00Z'));

    mockDbState();
    mockSites();
    mockClients();

    const { startCollector } = await loadCollectDailyModule();

    startCollector();
    startCollector(); // second call should be a no-op

    // Only one interval should have been created
    expect(vi.getTimerCount()).toBe(1);
  });

  it('logs and continues when SC query throws for one site', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-02T12:00:00Z'));

    mockDbState();
    mockSites();

    const scQuery = vi.fn().mockRejectedValue(new Error('SC API error'));
    vi.mocked(searchconsole_v1.Searchconsole).mockImplementation(function SearchconsoleMock() {
      return { searchanalytics: { query: scQuery } };
    } as never);

    const runReport = vi.fn().mockResolvedValue([{ rows: [] }]);
    vi.mocked(BetaAnalyticsDataClient).mockImplementation(function BetaAnalyticsDataClientMock() {
      return { runReport };
    } as never);

    const { startCollector } = await loadCollectDailyModule();
    startCollector();

    // GA4 still collected despite SC error
    await vi.waitFor(() => {
      expect(upsertGa4Daily).toHaveBeenCalled();
    });
    // SC upsert never called when the query throws
    expect(upsertScDaily).not.toHaveBeenCalled();
  });

  it('logs and continues when GA4 runReport throws for one site', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-02T12:00:00Z'));

    mockDbState();
    mockSites();

    const scQuery = vi.fn().mockResolvedValue({ data: { rows: [] } });
    vi.mocked(searchconsole_v1.Searchconsole).mockImplementation(function SearchconsoleMock() {
      return { searchanalytics: { query: scQuery } };
    } as never);

    const runReport = vi.fn().mockRejectedValue(new Error('GA4 API error'));
    vi.mocked(BetaAnalyticsDataClient).mockImplementation(function BetaAnalyticsDataClientMock() {
      return { runReport };
    } as never);

    const { startCollector } = await loadCollectDailyModule();
    startCollector();

    // SC still collected despite GA4 error
    await vi.waitFor(() => {
      expect(upsertScDaily).toHaveBeenCalled();
    });
    expect(upsertGa4Daily).not.toHaveBeenCalled();
  });

  it('skips SC collection for sites with searchConsole=false', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-02T12:00:00Z'));

    mockDbState();

    // Site with searchConsole disabled
    vi.mocked(getManagedSites).mockResolvedValue([{
      id: 'site1',
      name: 'Site One',
      domain: 'example.com',
      searchConsole: false,
      testPages: [],
    }]);
    vi.mocked(discoverPropertyIds).mockResolvedValue([{
      id: 'site1',
      name: 'Site One',
      domain: 'example.com',
      searchConsole: false,
      testPages: [],
      ga4PropertyId: 'properties/123',
    }]);
    vi.mocked(getSCUrl).mockReturnValue('sc-domain:example.com');
    vi.mocked(getAuth).mockReturnValue('auth' as never);

    const { scQuery, runReport } = mockClients();
    const { startCollector } = await loadCollectDailyModule();
    startCollector();

    await vi.waitFor(() => {
      expect(upsertGa4Daily).toHaveBeenCalled();
    });

    // SC query skipped for this site
    expect(scQuery).not.toHaveBeenCalled();
    expect(runReport).toHaveBeenCalled();
  });

  it('collects SC data when searchConsole config is omitted', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-02T12:00:00Z'));

    mockDbState();

    const legacySite = {
      id: 'site1',
      name: 'Site One',
      domain: 'example.com',
      testPages: [],
    };
    vi.mocked(getManagedSites).mockResolvedValue([legacySite]);
    vi.mocked(discoverPropertyIds).mockResolvedValue([{ ...legacySite, ga4PropertyId: 'properties/123' }]);
    vi.mocked(getSCUrl).mockReturnValue('sc-domain:example.com');
    vi.mocked(getAuth).mockReturnValue('auth' as never);

    const { scQuery } = mockClients();
    const { startCollector } = await loadCollectDailyModule();
    startCollector();

    await vi.waitFor(() => {
      expect(scQuery).toHaveBeenCalled();
    });
  });

  it('skips GA4 collection for sites without a ga4PropertyId', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-02T12:00:00Z'));

    mockDbState();

    vi.mocked(getManagedSites).mockResolvedValue([{
      id: 'site1',
      name: 'Site One',
      domain: 'example.com',
      searchConsole: true,
      testPages: [],
    }]);
    // discoverPropertyIds returns site without ga4PropertyId
    vi.mocked(discoverPropertyIds).mockResolvedValue([{
      id: 'site1',
      name: 'Site One',
      domain: 'example.com',
      searchConsole: true,
      testPages: [],
    }]);
    vi.mocked(getSCUrl).mockReturnValue('sc-domain:example.com');
    vi.mocked(getAuth).mockReturnValue('auth' as never);

    const { scQuery, runReport } = mockClients();
    const { startCollector } = await loadCollectDailyModule();
    startCollector();

    await vi.waitFor(() => {
      expect(upsertScDaily).toHaveBeenCalled();
    });

    // GA4 runReport skipped when no propertyId
    expect(runReport).not.toHaveBeenCalled();
    expect(scQuery).toHaveBeenCalled();
  });
});
