import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

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
  { id: 'site-a', domain: 'a.example.com', ga4PropertyId: 'properties/111', searchConsole: true, skipChecks: [] as string[] },
  { id: 'site-b', domain: 'b.example.com', ga4PropertyId: 'properties/222', searchConsole: true, skipChecks: [] as string[] },
]);

vi.mock('../ga4', () => ({
  discoverPropertyIds: vi.fn(async () => mockSites),
}));

vi.mock('../sites', () => ({
  getSCUrl: (s: { domain: string }) => `sc-domain:${s.domain}`,
}));

const runSiteAuditMock = vi.hoisted(() => vi.fn());
vi.mock('../audit', () => ({
  runSiteAudit: runSiteAuditMock,
}));

const scQueryMock = vi.hoisted(() => vi.fn());
vi.mock('@googleapis/searchconsole', () => ({
  searchconsole_v1: {
    Searchconsole: function () {
      return { searchanalytics: { query: scQueryMock } };
    },
  },
}));

const ga4ReportMock = vi.hoisted(() => vi.fn());
vi.mock('@google-analytics/data', () => ({
  BetaAnalyticsDataClient: function () {
    return { runReport: ga4ReportMock };
  },
}));

const processSnapshotAlertsMock = vi.hoisted(() => vi.fn(async () => ({ fired: 0, errors: [] as string[] })));
vi.mock('../alerts', () => ({
  processSnapshotAlerts: processSnapshotAlertsMock,
}));

import { getDb } from '../db';
import { discoverPropertyIds } from '../ga4';
import {
  getSnapshotRunState,
  runSnapshot,
  runSnapshotIfDue,
  SnapshotAlreadyRunningError,
} from '../snapshot';
import { getScTrends, getGa4Trends, getTtfbTrends } from '../db';

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

function resetDb() {
  const db = getDb();
  db.exec(`
    DELETE FROM sc_snapshots;
    DELETE FROM ga4_snapshots;
    DELETE FROM audit_snapshots;
    DELETE FROM keyword_history;
    DELETE FROM snapshot_runs;
  `);
}

beforeEach(() => {
  resetDb();
  vi.clearAllMocks();
  mockSites[0].skipChecks = [];
  mockSites[1].skipChecks = [];
  fetchMock.mockResolvedValue({ ok: true, status: 200 });
  runSiteAuditMock.mockImplementation(async (site: { id: string; domain: string }) => ({
    siteId: site.id,
    domain: site.domain,
    timestamp: Date.now(),
    robotsTxt: { status: 'pass', label: 'robots.txt', message: 'OK', hasSitemapDirective: true },
    sitemap: { status: 'pass', label: 'Sitemap', message: 'OK', urlCount: 12 },
    scSitemapFreshness: { status: 'pass', label: 'SC Sitemap', message: 'OK' },
    indexingCoverage: { status: 'warn', label: 'Indexing', message: 'Coverage', sitemapUrls: 12, indexedPages: 9, coveragePct: 75 },
    urlInspection: [],
    redirectChains: [],
    metaTags: [],
    ogImage: { status: 'pass', label: 'OG Image', message: 'OK' },
    ttfb: { status: 'pass', label: 'TTFB', message: 'Fast', ms: site.id === 'site-a' ? 320 : 450 },
    imageSeo: [],
    internalLinks: [],
    security: {
      https: { status: 'pass', label: 'HTTPS', message: 'OK' },
      hsts: { status: 'pass', label: 'HSTS', message: 'OK' },
      favicon: { status: 'pass', label: 'Favicon', message: 'OK' },
    },
    score: { pass: 7, warn: 1, fail: 0, error: 0, total: 8 },
    sampledPages: ['/'],
  }));

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

afterEach(() => {
  vi.useRealTimers();
});

describe('runSnapshot alert dispatch', () => {
  it('invokes processSnapshotAlerts exactly once per snapshot run', async () => {
    const result = await runSnapshot();
    expect(processSnapshotAlertsMock).toHaveBeenCalledTimes(1);
    expect(processSnapshotAlertsMock).toHaveBeenCalledWith(result.date);
  });

  it('surfaces alert delivery errors via SnapshotResult.errors', async () => {
    processSnapshotAlertsMock.mockResolvedValueOnce({
      fired: 0,
      errors: ['Alert site-a/sc_clicks: email: missing resend config'],
    });

    const result = await runSnapshot();

    expect(result.errors).toContain('Alert site-a/sc_clicks: email: missing resend config');
  });
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

describe('runSnapshot TTFB', () => {
  it('writes audit-derived indexing coverage and ttfb to audit_snapshots for each site', async () => {
    const result = await runSnapshot();
    expect(result.ttfb).toBe(2);

    const db = getDb();
    const rows = db.prepare(
      'SELECT site_id, ttfb_ms, sitemap_urls, indexed_pages, coverage_pct, pass_count, warn_count, fail_count FROM audit_snapshots WHERE date = ? ORDER BY site_id',
    ).all(result.date) as Array<{
      site_id: string;
      ttfb_ms: number;
      sitemap_urls: number;
      indexed_pages: number;
      coverage_pct: number;
      pass_count: number;
      warn_count: number;
      fail_count: number;
    }>;

    expect(rows).toHaveLength(2);
    expect(rows[0].site_id).toBe('site-a');
    expect(rows[0].ttfb_ms).toBe(320);
    expect(rows[0].sitemap_urls).toBe(12);
    expect(rows[0].indexed_pages).toBe(9);
    expect(rows[0].coverage_pct).toBe(75);
    expect(rows[0].pass_count).toBe(7);
    expect(rows[0].warn_count).toBe(1);
    expect(rows[0].fail_count).toBe(0);
    expect(rows[1].site_id).toBe('site-b');
  });

  it('stores null indexing coverage when the site skips indexing checks', async () => {
    mockSites[0].skipChecks = ['indexing'];

    const result = await runSnapshot();

    const db = getDb();
    const rows = db.prepare(
      'SELECT site_id, sitemap_urls, indexed_pages, coverage_pct FROM audit_snapshots WHERE date = ? ORDER BY site_id',
    ).all(result.date) as Array<{
      site_id: string;
      sitemap_urls: number | null;
      indexed_pages: number | null;
      coverage_pct: number | null;
    }>;

    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({
      site_id: 'site-a',
      sitemap_urls: null,
      indexed_pages: null,
      coverage_pct: null,
    });
    expect(rows[1]).toEqual({
      site_id: 'site-b',
      sitemap_urls: 12,
      indexed_pages: 9,
      coverage_pct: 75,
    });
  });

  it('deduplicates audit_snapshots on re-run', async () => {
    await runSnapshot();
    const r2 = await runSnapshot();

    const db = getDb();
    const rows = db.prepare(
      'SELECT site_id FROM audit_snapshots WHERE date = ? ORDER BY site_id',
    ).all(r2.date) as Array<{ site_id: string }>;

    expect(rows).toHaveLength(2);
  });

  it('getTtfbTrends returns stored TTFB data', async () => {
    const result = await runSnapshot();
    const trends = getTtfbTrends('site-a');
    expect(trends).toHaveLength(1);
    expect(trends[0].date).toBe(result.date);
    expect(trends[0].ttfbMs).toBeGreaterThanOrEqual(0);
  });

  it('records TTFB fetch error and continues other sites', async () => {
    runSiteAuditMock.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    const result = await runSnapshot();
    expect(result.errors.some((e) => e.includes('Audit site-a'))).toBe(true);
    expect(result.ttfb).toBe(1); // site-b still succeeds
  });

  it('persists snapshot run timestamps after success', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-14T08:00:00Z'));

    await runSnapshot();

    const now = Date.parse('2026-05-14T08:00:00Z');

    expect(getSnapshotRunState()).toEqual({
      status: 'idle',
      last_started_at: now,
      last_finished_at: now,
      last_success_at: now,
      last_failure_at: null,
      last_error: null,
    });
  });

  it('persists failure metadata when snapshot throws before any site work starts', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-14T09:00:00Z'));
    vi.mocked(discoverPropertyIds).mockRejectedValueOnce(new Error('Discovery offline'));

    await expect(runSnapshot()).rejects.toThrow('Discovery offline');

    const now = Date.parse('2026-05-14T09:00:00Z');

    expect(getSnapshotRunState()).toEqual({
      status: 'idle',
      last_started_at: now,
      last_finished_at: now,
      last_success_at: null,
      last_failure_at: now,
      last_error: 'Discovery offline',
    });
  });
});

describe('runSnapshotIfDue', () => {
  it('runs immediately when no successful snapshot exists yet', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-14T10:00:00Z'));

    await expect(runSnapshotIfDue()).resolves.toBe('started');
    expect(scQueryMock).toHaveBeenCalled();
  });

  it('skips when the last successful snapshot is still within the schedule window', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-14T10:00:00Z'));
    await runSnapshot();
    scQueryMock.mockClear();

    vi.setSystemTime(new Date('2026-05-14T20:00:00Z'));
    await expect(runSnapshotIfDue()).resolves.toBe('skipped-not-due');
    expect(scQueryMock).not.toHaveBeenCalled();
  });

  it('returns skipped-running when persisted state is already in progress', async () => {
    const db = getDb();
    db.prepare(
      `INSERT INTO snapshot_runs (
        job_key, status, last_started_at, last_finished_at, last_success_at, last_failure_at, last_error, lock_owner
      ) VALUES (?, 'running', ?, NULL, NULL, NULL, NULL, ?)`,
    ).run('daily', Date.now(), 'existing-owner');

    await expect(runSnapshotIfDue()).resolves.toBe('skipped-running');
    expect(scQueryMock).not.toHaveBeenCalled();
  });

  it('refuses a manual run when another process holds a fresh persisted lock', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-14T11:00:00Z'));
    const db = getDb();
    const startedAt = Date.now();
    db.prepare(
      `INSERT INTO snapshot_runs (
        job_key, status, last_started_at, last_finished_at, last_success_at, last_failure_at, last_error, lock_owner
      ) VALUES (?, 'running', ?, NULL, NULL, NULL, NULL, ?)`,
    ).run('daily', startedAt, 'existing-owner');

    await expect(runSnapshot()).rejects.toBeInstanceOf(SnapshotAlreadyRunningError);

    const row = db.prepare(
      'SELECT status, last_started_at, lock_owner FROM snapshot_runs WHERE job_key = ?',
    ).get('daily') as { status: string; last_started_at: number; lock_owner: string };
    expect(row).toEqual({
      status: 'running',
      last_started_at: startedAt,
      lock_owner: 'existing-owner',
    });
    expect(scQueryMock).not.toHaveBeenCalled();
  });

  it('atomically replaces a stale persisted lock and only clears the new owner on finish', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-14T12:00:00Z'));
    const db = getDb();
    const staleStartedAt = Date.now() - (6 * 60 * 60 * 1000) - 1;
    db.prepare(
      `INSERT INTO snapshot_runs (
        job_key, status, last_started_at, last_finished_at, last_success_at, last_failure_at, last_error, lock_owner
      ) VALUES (?, 'running', ?, NULL, NULL, NULL, ?, ?)`,
    ).run('daily', staleStartedAt, 'previous process crashed', 'stale-owner');

    await expect(runSnapshot()).resolves.toMatchObject({ date: '2026-05-14' });

    const now = Date.parse('2026-05-14T12:00:00Z');
    const row = db.prepare(
      'SELECT status, last_started_at, last_success_at, last_error, lock_owner FROM snapshot_runs WHERE job_key = ?',
    ).get('daily') as {
      status: string;
      last_started_at: number;
      last_success_at: number;
      last_error: string | null;
      lock_owner: string | null;
    };
    expect(row).toEqual({
      status: 'idle',
      last_started_at: now,
      last_success_at: now,
      last_error: null,
      lock_owner: null,
    });
    expect(scQueryMock).toHaveBeenCalled();
  });

  it('throws SnapshotAlreadyRunningError on overlapping manual runs', async () => {
    const first = runSnapshot();
    await Promise.resolve();

    await expect(runSnapshot()).rejects.toBeInstanceOf(SnapshotAlreadyRunningError);
    await first;
  });
});
