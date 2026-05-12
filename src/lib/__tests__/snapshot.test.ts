import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs');
  return { ...actual, existsSync: () => true, mkdirSync: () => undefined };
});

vi.mock('../sqlite-driver.js', async () => {
  const actual = await vi.importActual<typeof import('../sqlite-driver.js')>('../sqlite-driver.js');
  return {
    openDatabase: () => actual.openDatabase(':memory:'),
  };
});

vi.mock('../google-auth', () => ({
  getAuth: () => ({}),
}));

const mockSites = vi.hoisted(() => [
  { id: 'site-a', domain: 'a.example.com', ga4PropertyId: '111', searchConsole: true },
  { id: 'site-b', domain: 'b.example.com', ga4PropertyId: '222', searchConsole: true },
]);

vi.mock('../ga4', () => ({
  discoverPropertyIds: vi.fn(async () => mockSites),
}));

vi.mock('../sites', () => ({
  getSCUrl: (s: { domain: string }) => `sc-domain:${s.domain}`,
}));

const scQueryMock = vi.fn();
vi.mock('@googleapis/searchconsole', () => ({
  searchconsole_v1: {
    Searchconsole: function () {
      return { searchanalytics: { query: scQueryMock } };
    },
  },
}));

const ga4ReportMock = vi.fn();
vi.mock('@google-analytics/data', () => ({
  BetaAnalyticsDataClient: function () {
    return { runReport: ga4ReportMock };
  },
}));

import { getDb } from '../db';
import { runSnapshot } from '../snapshot';
import { getScTrends, getGa4Trends } from '../db';

function resetDb() {
  const db = getDb();
  db.exec(`
    DELETE FROM sc_snapshots;
    DELETE FROM ga4_snapshots;
    DELETE FROM keyword_history;
  `);
}

beforeEach(() => {
  resetDb();
  vi.clearAllMocks();

  // SC returns a page-dimension query and a query-dimension query in order per site.
  scQueryMock.mockImplementation(async ({ requestBody }: { requestBody: { dimensions: string[] } }) => {
    if (requestBody.dimensions[0] === 'page') {
      return { data: { rows: [
        { keys: ['https://example.com/'], clicks: 5, impressions: 100, ctr: 0.05, position: 3 },
        { keys: ['https://example.com/foo'], clicks: 2, impressions: 40, ctr: 0.05, position: 7 },
      ] } };
    }
    return { data: { rows: [
      { keys: ['foo'], clicks: 3, impressions: 50, ctr: 0.06, position: 4 },
    ] } };
  });

  ga4ReportMock.mockResolvedValue([{
    rows: [{ metricValues: [{ value: '10' }, { value: '20' }, { value: '30' }, { value: '0.4' }, { value: '12.5' }] }],
  }]);
});

describe('runSnapshot dedupe', () => {
  it('inserting twice on the same day does not duplicate sc_snapshots or ga4_snapshots rows', async () => {
    const r1 = await runSnapshot();
    const r2 = await runSnapshot();

    expect(r1.date).toBe(r2.date);
    const today = r1.date;
    const db = getDb();

    const scRows = db.prepare('SELECT site_id, page_url FROM sc_snapshots WHERE date = ? ORDER BY site_id, page_url').all(today) as Array<{ site_id: string; page_url: string }>;
    // 2 sites * 2 pages = 4 rows after dedupe; without dedupe would be 8.
    expect(scRows).toHaveLength(4);

    const ga4Rows = db.prepare('SELECT site_id FROM ga4_snapshots WHERE date = ?').all(today) as Array<{ site_id: string }>;
    // 2 sites = 2 rows after dedupe; without dedupe would be 4.
    expect(ga4Rows).toHaveLength(2);

    const scTrend = getScTrends('site-a');
    const trendForToday = scTrend.filter((p) => p.date === today);
    expect(trendForToday).toHaveLength(1);
    // 2 pages, clicks 5+2 = 7. Without dedupe this would double to 14.
    expect(trendForToday[0]?.clicks).toBe(7);

    const ga4Trend = getGa4Trends('site-a');
    const ga4ForToday = ga4Trend.filter((p) => p.date === today);
    expect(ga4ForToday).toHaveLength(1);
    expect(ga4ForToday[0]?.users).toBe(10);
  });
});
