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
import { dbGetSites, getDb } from '../db';
import { DELETE, POST } from '../../../app/api/sites/route';
import { PUT as PUT_ORDER } from '../../../app/api/sites/order/route';

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

function putOrderReq(body: object): NextRequest {
  return new NextRequest('http://localhost/api/sites/order', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
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
      ga4PropertyId: 'properties/999',
      testPages: ['/fresh'],
    }));

    expect(reAddRes.status).toBe(200);

    const db = getDb();
    expect(
      db.prepare('SELECT domain, sc_url, ga4_property_id, test_pages FROM sites WHERE id = ?').get(siteId),
    ).toEqual({
      domain: 'new.example.com',
      sc_url: 'sc-domain:new.example.com',
      ga4_property_id: 'properties/999',
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

describe('PUT /api/sites/order integration', () => {
  it('returns sites in persisted sort order after an atomic reorder', async () => {
    await POST(postReq({
      id: 'site-a',
      name: 'Site A',
      domain: 'a.example.com',
      testPages: ['/'],
    }));
    await POST(postReq({
      id: 'site-b',
      name: 'Site B',
      domain: 'b.example.com',
      testPages: ['/'],
    }));
    await POST(postReq({
      id: 'site-c',
      name: 'Site C',
      domain: 'c.example.com',
      testPages: ['/'],
    }));

    const res = await PUT_ORDER(putOrderReq({ orderedIds: ['site-c', 'site-a', 'site-b'] }));

    expect(res.status).toBe(200);
    expect(dbGetSites().map(site => site.id)).toEqual(['site-c', 'site-a', 'site-b']);
  });

  it('rejects unknown, missing, and duplicate ids without partially updating order', async () => {
    for (const site of [
      { id: 'site-a', name: 'Site A', domain: 'a.example.com', testPages: ['/'] },
      { id: 'site-b', name: 'Site B', domain: 'b.example.com', testPages: ['/'] },
      { id: 'site-c', name: 'Site C', domain: 'c.example.com', testPages: ['/'] },
    ]) {
      await POST(postReq(site));
    }

    const attempts = [
      ['site-c', 'site-a', 'unknown-site'],
      ['site-c', 'site-a'],
      ['site-c', 'site-a', 'site-a'],
    ];

    for (const orderedIds of attempts) {
      const res = await PUT_ORDER(putOrderReq({ orderedIds }));
      expect(res.status).toBe(400);
      expect(dbGetSites().map(site => site.id)).toEqual(['site-a', 'site-b', 'site-c']);
    }
  });

  it('updates only sort order and preserves all existing site fields', async () => {
    await POST(postReq({
      id: 'site-a',
      name: 'Site A',
      domain: 'a.example.com',
      scUrl: 'sc-domain:a.example.com',
      ga4PropertyId: 'properties/111',
      searchConsole: false,
      color: '#ff0000',
      testPages: ['/', '/pricing'],
      skipChecks: ['ogImage'],
    }));
    await POST(postReq({
      id: 'site-b',
      name: 'Site B',
      domain: 'b.example.com',
      scUrl: 'sc-domain:b.example.com',
      ga4PropertyId: 'properties/222',
      searchConsole: true,
      color: '#00ff00',
      testPages: ['/', '/docs'],
      skipChecks: ['internalLinks'],
    }));

    const beforeById = new Map(dbGetSites().map(site => [site.id, site]));
    const res = await PUT_ORDER(putOrderReq({ orderedIds: ['site-b', 'site-a'] }));
    const after = dbGetSites();

    expect(res.status).toBe(200);
    expect(after.map(site => site.id)).toEqual(['site-b', 'site-a']);
    for (const site of after) {
      expect(site).toEqual(beforeById.get(site.id));
    }
  });
});
