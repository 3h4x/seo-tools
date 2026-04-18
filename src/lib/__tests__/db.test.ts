import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Use a real in-memory SQLite database instead of the file-backed one.
// We intercept the `better-sqlite3` constructor and redirect every DB path
// to ':memory:' so no files are created on disk.
vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs');
  return { ...actual, existsSync: () => true, mkdirSync: () => undefined };
});

vi.mock('better-sqlite3', async () => {
  // better-sqlite3 is a CJS module with `module.exports = Database`. When loaded
  // via ESM interop the actual value may land on `.default` or be the constructor
  // itself — handle both shapes.
  const actual = await vi.importActual('better-sqlite3');
  const Ctor: new (path: string, opts?: object) => object = (actual as any).default ?? actual;
  return {
    default: class {
      constructor(_path: string, opts?: object) {
        return new Ctor(':memory:', opts);
      }
    },
  };
});

// Import after mocks are registered so the singleton picks up the in-memory DB.
import {
  getCached,
  setCache,
  clearCache,
  getScDailyMissingDates,
  getGa4DailyMissingDates,
  upsertScDaily,
  upsertGa4Daily,
  getDb,
  getConfig,
  setConfig,
  deleteConfig,
} from '../db';

/** Wipe volatile tables between tests so state never leaks. */
function resetDb() {
  const db = getDb();
  db.exec('DELETE FROM api_cache; DELETE FROM sc_daily; DELETE FROM ga4_daily;');
}

beforeEach(resetDb);
afterEach(resetDb);

// ---------------------------------------------------------------------------
// getCached / setCache
// ---------------------------------------------------------------------------

describe('setCache / getCached', () => {
  it('returns null when there is no cached entry', () => {
    expect(getCached('audit', 'site-a')).toBeNull();
  });

  it('stores and retrieves a value within the TTL', () => {
    const data = { clicks: 42, impressions: 1000 };
    setCache('audit', 'site-a', data);
    const result = getCached<typeof data>('audit', 'site-a');
    expect(result).toEqual(data);
  });

  it('returns null when the TTL has expired', () => {
    // Insert a row with fetched_at set to epoch (guaranteed to be older than any TTL > 0).
    const db = getDb();
    db.prepare(
      'INSERT OR REPLACE INTO api_cache (cache_key, site_id, data_json, fetched_at) VALUES (?, ?, ?, ?)',
    ).run('audit', 'site-a', JSON.stringify({ clicks: 1 }), 0);

    // Even a 1 ms TTL makes the epoch-timestamped entry stale.
    expect(getCached('audit', 'site-a', 1)).toBeNull();
  });

  it('uses a TTL of 30 minutes by default (entry within 30 min is returned)', () => {
    setCache('sc', 'site-b', { foo: 'bar' });
    const result = getCached<{ foo: string }>('sc', 'site-b');
    expect(result).not.toBeNull();
    expect(result!.foo).toBe('bar');
  });

  it('scopes cache entries by (key, siteId) — different sites are independent', () => {
    setCache('audit', 'site-a', { score: 80 });
    expect(getCached('audit', 'site-c')).toBeNull();
  });

  it('overwrites an existing entry when setCache is called again', () => {
    setCache('audit', 'site-a', { score: 80 });
    setCache('audit', 'site-a', { score: 95 });
    const result = getCached<{ score: number }>('audit', 'site-a');
    expect(result!.score).toBe(95);
  });

  it('handles complex nested objects correctly', () => {
    const data = {
      metaTags: [{ page: '/', title: { status: 'pass', label: 'title', message: 'Example' } }],
      score: { pass: 10, warn: 2, fail: 1, error: 0, total: 13 },
    };
    setCache('audit', 'site-d', data);
    expect(getCached('audit', 'site-d')).toEqual(data);
  });
});

// ---------------------------------------------------------------------------
// clearCache
// ---------------------------------------------------------------------------

describe('clearCache', () => {
  beforeEach(() => {
    setCache('audit', 'site-a', { a: 1 });
    setCache('audit', 'site-c', { b: 2 });
    setCache('sc', 'site-a', { c: 3 });
    setCache('ga4', 'site-a', { d: 4 });
  });

  it('removes all entries when called without a pattern', () => {
    clearCache();
    expect(getCached('audit', 'site-a')).toBeNull();
    expect(getCached('sc', 'site-a')).toBeNull();
    expect(getCached('ga4', 'site-a')).toBeNull();
  });

  it('removes only entries matching the key prefix', () => {
    clearCache('audit');
    expect(getCached('audit', 'site-a')).toBeNull();
    expect(getCached('audit', 'site-c')).toBeNull();
    // Non-matching keys are untouched.
    expect(getCached('sc', 'site-a')).not.toBeNull();
    expect(getCached('ga4', 'site-a')).not.toBeNull();
  });

  it('is a no-op when the pattern matches nothing', () => {
    clearCache('nonexistent');
    expect(getCached('audit', 'site-a')).not.toBeNull();
    expect(getCached('sc', 'site-a')).not.toBeNull();
  });

  it('is idempotent — calling twice does not throw', () => {
    expect(() => { clearCache(); clearCache(); }).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// getScDailyMissingDates
// ---------------------------------------------------------------------------

describe('getScDailyMissingDates', () => {
  it('returns every date in the range when nothing is stored', () => {
    const missing = getScDailyMissingDates('site-a', '2025-01-01', '2025-01-03');
    expect(missing).toEqual(['2025-01-01', '2025-01-02', '2025-01-03']);
  });

  it('returns an empty array when all dates are already present', () => {
    upsertScDaily('site-a', [
      { date: '2025-01-01', clicks: 10, impressions: 100, ctr: 0.1, position: 5 },
      { date: '2025-01-02', clicks: 20, impressions: 200, ctr: 0.1, position: 4 },
    ]);
    const missing = getScDailyMissingDates('site-a', '2025-01-01', '2025-01-02');
    expect(missing).toEqual([]);
  });

  it('returns only the dates that are missing from the stored set', () => {
    upsertScDaily('site-a', [
      { date: '2025-01-02', clicks: 5, impressions: 50, ctr: 0.1, position: 6 },
    ]);
    const missing = getScDailyMissingDates('site-a', '2025-01-01', '2025-01-03');
    expect(missing).toEqual(['2025-01-01', '2025-01-03']);
  });

  it('is scoped to the requested site — another site\'s data does not count', () => {
    upsertScDaily('site-c', [
      { date: '2025-01-01', clicks: 1, impressions: 10, ctr: 0.1, position: 3 },
    ]);
    const missing = getScDailyMissingDates('site-a', '2025-01-01', '2025-01-01');
    expect(missing).toEqual(['2025-01-01']);
  });

  it('handles a single-day range', () => {
    expect(getScDailyMissingDates('site-a', '2025-06-15', '2025-06-15')).toEqual(['2025-06-15']);

    upsertScDaily('site-a', [
      { date: '2025-06-15', clicks: 3, impressions: 30, ctr: 0.1, position: 7 },
    ]);
    expect(getScDailyMissingDates('site-a', '2025-06-15', '2025-06-15')).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// getGa4DailyMissingDates
// ---------------------------------------------------------------------------

describe('getGa4DailyMissingDates', () => {
  it('returns every date in the range when nothing is stored', () => {
    const missing = getGa4DailyMissingDates('site-a', '2025-03-01', '2025-03-03');
    expect(missing).toEqual(['2025-03-01', '2025-03-02', '2025-03-03']);
  });

  it('returns an empty array when all dates are present', () => {
    upsertGa4Daily('site-a', [
      { date: '2025-03-01', users: 100, sessions: 120, views: 300, bounceRate: 0.4, avgDuration: 45 },
      { date: '2025-03-02', users: 110, sessions: 130, views: 320, bounceRate: 0.4, avgDuration: 50 },
    ]);
    const missing = getGa4DailyMissingDates('site-a', '2025-03-01', '2025-03-02');
    expect(missing).toEqual([]);
  });

  it('returns only dates not yet stored', () => {
    upsertGa4Daily('site-a', [
      { date: '2025-03-02', users: 50, sessions: 60, views: 150, bounceRate: 0.35, avgDuration: 40 },
    ]);
    const missing = getGa4DailyMissingDates('site-a', '2025-03-01', '2025-03-03');
    expect(missing).toEqual(['2025-03-01', '2025-03-03']);
  });

  it('is scoped per site', () => {
    upsertGa4Daily('site-b', [
      { date: '2025-03-01', users: 1, sessions: 1, views: 1, bounceRate: 0, avgDuration: 0 },
    ]);
    const missing = getGa4DailyMissingDates('site-a', '2025-03-01', '2025-03-01');
    expect(missing).toEqual(['2025-03-01']);
  });
});

describe('config helpers', () => {
  beforeEach(() => {
    getDb().prepare('DELETE FROM config').run();
  });

  it('returns null for missing key', () => {
    expect(getConfig('missing')).toBeNull();
  });

  it('stores and retrieves a value', () => {
    setConfig('foo', 'bar');
    expect(getConfig('foo')).toBe('bar');
  });

  it('overwrites existing value', () => {
    setConfig('foo', 'bar');
    setConfig('foo', 'baz');
    expect(getConfig('foo')).toBe('baz');
  });

  it('deletes a key', () => {
    setConfig('foo', 'bar');
    deleteConfig('foo');
    expect(getConfig('foo')).toBeNull();
  });

  it('delete is a no-op for missing key', () => {
    expect(() => deleteConfig('missing')).not.toThrow();
  });
});
