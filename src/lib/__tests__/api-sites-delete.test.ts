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

import { NextRequest } from 'next/server';
import { getDb } from '../db';
import { DELETE, POST } from '../../../app/api/sites/route';

function postReq(body: object): NextRequest {
  return new NextRequest('http://localhost/api/sites', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function deleteReq(id: string): NextRequest {
  return new NextRequest(`http://localhost/api/sites?id=${id}`, { method: 'DELETE' });
}

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

function seedSiteRows(siteId: string) {
  const db = getDb();

  db.prepare(
    `INSERT INTO sites
      (id, name, domain, sc_url, ga4_property_id, search_console, color, test_pages, skip_checks, sort_order)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    siteId,
    'Site A',
    'old.example.com',
    'sc-domain:old.example.com',
    'ga4-old',
    1,
    null,
    '["/"]',
    '[]',
    0,
  );
  db.prepare('INSERT INTO sc_daily (site_id, date, clicks, impressions, ctr, position) VALUES (?, ?, ?, ?, ?, ?)').run(siteId, '2026-05-10', 1, 2, 0.5, 3);
  db.prepare('INSERT INTO ga4_daily (site_id, date, users, sessions, views, bounce_rate, avg_duration) VALUES (?, ?, ?, ?, ?, ?, ?)').run(siteId, '2026-05-10', 1, 2, 3, 4, 5);
  db.prepare('INSERT INTO sc_snapshots (site_id, date, page_url, clicks, impressions, ctr, position) VALUES (?, ?, ?, ?, ?, ?, ?)').run(siteId, '2026-05-10', 'https://old.example.com/', 1, 2, 0.5, 3);
  db.prepare('INSERT INTO ga4_snapshots (site_id, date, users, sessions, views, bounce_rate, avg_duration) VALUES (?, ?, ?, ?, ?, ?, ?)').run(siteId, '2026-05-10', 1, 2, 3, 4, 5);
  db.prepare('INSERT INTO audit_snapshots (site_id, date, pass_count, warn_count, fail_count, checks_json) VALUES (?, ?, ?, ?, ?, ?)').run(siteId, '2026-05-10', 1, 2, 3, '{}');
  db.prepare('INSERT INTO keyword_history (site_id, date, query, clicks, impressions, ctr, position) VALUES (?, ?, ?, ?, ?, ?, ?)').run(siteId, '2026-05-10', 'seo', 1, 2, 0.5, 3);
  db.prepare('INSERT INTO api_cache (cache_key, site_id, data_json, fetched_at) VALUES (?, ?, ?, ?)').run('audit', siteId, '{"score":42}', Date.now());
  db.prepare('INSERT INTO daily_genesis (site_id, source, genesis_date) VALUES (?, ?, ?)').run(siteId, 'sc', '2026-05-01');
  db.prepare('INSERT INTO sitemap_state (site_id, sitemap_url, content_hash, url_count, latest_lastmod, last_submitted_at, last_checked_at, submit_count) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(siteId, 'https://old.example.com/sitemap.xml', 'hash', 1, null, null, 0, 0);
}

beforeEach(resetDb);

describe('DELETE /api/sites integration', () => {
  it('removes all site-owned rows for the deleted site id', async () => {
    const siteId = 'site-a';
    seedSiteRows(siteId);

    const res = await DELETE(deleteReq(siteId));

    expect(res.status).toBe(200);

    const db = getDb();
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
      const row = db.prepare(`SELECT 1 AS present FROM ${table} WHERE site_id = ? LIMIT 1`).get(siteId);
      expect(row).toBeUndefined();
    }

    expect(db.prepare('SELECT 1 AS present FROM sites WHERE id = ?').get(siteId)).toBeUndefined();
  });

  it('does not resurrect stale rows when the same site id is re-added', async () => {
    const siteId = 'site-a';
    seedSiteRows(siteId);

    await DELETE(deleteReq(siteId));

    const reAddRes = await POST(postReq({
      id: siteId,
      name: 'Site A',
      domain: 'new.example.com',
      scUrl: 'sc-domain:new.example.com',
      ga4PropertyId: 'ga4-new',
      testPages: ['/fresh'],
    }));

    expect(reAddRes.status).toBe(200);

    const db = getDb();
    expect(
      db.prepare('SELECT domain, sc_url, ga4_property_id, test_pages FROM sites WHERE id = ?').get(siteId),
    ).toEqual({
      domain: 'new.example.com',
      sc_url: 'sc-domain:new.example.com',
      ga4_property_id: 'ga4-new',
      test_pages: '["/fresh"]',
    });

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
      const row = db.prepare(`SELECT 1 AS present FROM ${table} WHERE site_id = ? LIMIT 1`).get(siteId);
      expect(row).toBeUndefined();
    }
  });
});
