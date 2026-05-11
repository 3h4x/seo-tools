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

import {
  getCached,
  setCache,
  clearCache,
  clearCacheEntry,
  clearCacheEntriesByPrefix,
  clearSitemapSyncState,
  dbDeleteSite,
  dbUpsertSite,
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
  db.exec(`
    DELETE FROM keyword_history;
    DELETE FROM daily_genesis;
    DELETE FROM sites;
    DELETE FROM api_cache;
    DELETE FROM sitemap_state;
    DELETE FROM sc_daily;
    DELETE FROM ga4_daily;
    DELETE FROM sc_snapshots;
    DELETE FROM ga4_snapshots;
    DELETE FROM audit_snapshots;
    DELETE FROM config;
  `);
}

beforeEach(resetDb);

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

describe('targeted cache clearing', () => {
  it('removes one exact cache entry', () => {
    setCache('audit', 'site-a', { a: 1 });
    setCache('audit', 'site-b', { b: 2 });

    clearCacheEntry('audit', 'site-a');

    expect(getCached('audit', 'site-a')).toBeNull();
    expect(getCached('audit', 'site-b')).toEqual({ b: 2 });
  });

  it('removes cache entries by key prefix for one site', () => {
    setCache('sc-data-7', 'sc-domain:example.com', { clicks: 1 });
    setCache('sc-pages-7', 'sc-domain:example.com', { pages: [] });
    setCache('sc-data-7', 'sc-domain:other.com', { clicks: 2 });

    clearCacheEntriesByPrefix('sc-', 'sc-domain:example.com');

    expect(getCached('sc-data-7', 'sc-domain:example.com')).toBeNull();
    expect(getCached('sc-pages-7', 'sc-domain:example.com')).toBeNull();
    expect(getCached('sc-data-7', 'sc-domain:other.com')).toEqual({ clicks: 2 });
  });

  it('removes only the requested sitemap sync state row', () => {
    const db = getDb();
    const insertState = db.prepare(`
      INSERT INTO sitemap_state (
        site_id, sitemap_url, content_hash, url_count, latest_lastmod,
        last_submitted_at, last_checked_at, submit_count
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    insertState.run('site-a', 'https://a.example/sitemap.xml', 'same-hash', 1, null, 100, 100, 1);
    insertState.run('site-b', 'https://b.example/sitemap.xml', 'same-hash', 1, null, 100, 100, 1);

    clearSitemapSyncState('site-a');

    expect(db.prepare('SELECT site_id FROM sitemap_state WHERE site_id = ?').get('site-a')).toBeUndefined();
    expect(db.prepare('SELECT site_id FROM sitemap_state WHERE site_id = ?').get('site-b')).toEqual({ site_id: 'site-b' });
  });
});

describe('dbDeleteSite', () => {
  it('deletes a site and all site-owned dependent rows in one call', () => {
    const db = getDb();
    dbUpsertSite({ id: 'site-a', name: 'Site A', domain: 'a.example', testPages: ['/'] });
    dbUpsertSite({ id: 'site-b', name: 'Site B', domain: 'b.example', testPages: ['/'] });

    db.prepare('INSERT INTO sc_daily (site_id, date, clicks, impressions, ctr, position) VALUES (?, ?, ?, ?, ?, ?)').run('site-a', '2026-05-10', 1, 2, 0.5, 3);
    db.prepare('INSERT INTO ga4_daily (site_id, date, users, sessions, views, bounce_rate, avg_duration) VALUES (?, ?, ?, ?, ?, ?, ?)').run('site-a', '2026-05-10', 1, 2, 3, 4, 5);
    db.prepare('INSERT INTO sc_snapshots (site_id, date, page_url, clicks, impressions, ctr, position) VALUES (?, ?, ?, ?, ?, ?, ?)').run('site-a', '2026-05-10', 'https://a.example/', 1, 2, 0.5, 3);
    db.prepare('INSERT INTO ga4_snapshots (site_id, date, users, sessions, views, bounce_rate, avg_duration) VALUES (?, ?, ?, ?, ?, ?, ?)').run('site-a', '2026-05-10', 1, 2, 3, 4, 5);
    db.prepare('INSERT INTO audit_snapshots (site_id, date, pass_count, warn_count, fail_count, checks_json) VALUES (?, ?, ?, ?, ?, ?)').run('site-a', '2026-05-10', 1, 2, 3, '{}');
    db.prepare('INSERT INTO keyword_history (site_id, date, query, clicks, impressions, ctr, position) VALUES (?, ?, ?, ?, ?, ?, ?)').run('site-a', '2026-05-10', 'seo', 1, 2, 0.5, 3);
    db.prepare('INSERT INTO api_cache (cache_key, site_id, data_json, fetched_at) VALUES (?, ?, ?, ?)').run('audit', 'site-a', '{}', Date.now());
    db.prepare('INSERT INTO daily_genesis (site_id, source, genesis_date) VALUES (?, ?, ?)').run('site-a', 'sc', '2026-05-01');
    db.prepare('INSERT INTO sitemap_state (site_id, sitemap_url, content_hash, url_count, latest_lastmod, last_submitted_at, last_checked_at, submit_count) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run('site-a', 'https://a.example/sitemap.xml', 'hash', 1, null, null, 0, 0);
    db.prepare('INSERT INTO api_cache (cache_key, site_id, data_json, fetched_at) VALUES (?, ?, ?, ?)').run('audit', 'site-b', '{}', Date.now());

    dbDeleteSite('site-a');

    const siteOwnedTables = [
      'sc_daily',
      'ga4_daily',
      'sc_snapshots',
      'ga4_snapshots',
      'audit_snapshots',
      'keyword_history',
      'api_cache',
      'daily_genesis',
      'sitemap_state',
    ] as const;

    for (const table of siteOwnedTables) {
      const deletedRow = db.prepare(`SELECT 1 AS present FROM ${table} WHERE site_id = ? LIMIT 1`).get('site-a');
      expect(deletedRow).toBeUndefined();
    }

    expect(db.prepare('SELECT 1 AS present FROM sites WHERE id = ?').get('site-a')).toBeUndefined();
    expect(db.prepare('SELECT 1 AS present FROM sites WHERE id = ?').get('site-b')).toEqual({ present: 1 });
    expect(db.prepare('SELECT 1 AS present FROM api_cache WHERE site_id = ?').get('site-b')).toEqual({ present: 1 });
  });
});

describe('config helpers', () => {
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
