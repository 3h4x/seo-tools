#!/usr/bin/env node
/**
 * Sitemap change detector + auto-resubmitter for Google Search Console.
 * Sites and sitemap URLs are read from the SQLite sites table — no hardcoded domains.
 *
 * Logic:
 *   - Fetch each site's sitemap XML
 *   - Hash the content (SHA-256)
 *   - If hash changed since last check → submit to GSC (max once per 24h)
 *   - If unchanged → skip
 *
 * Usage:
 *   pnpm sitemap-sync             # run for all sites
 *   pnpm sitemap-sync --dry-run   # show what would be submitted, don't actually submit
 */
import { createHash } from 'node:crypto';
import { GoogleAuth } from 'google-auth-library';
import { searchconsole_v1 } from '@googleapis/searchconsole';
import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';

const DRY_RUN = process.argv.includes('--dry-run');
const MIN_SUBMIT_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours

// Init DB
const dbDir = path.join(process.cwd(), 'data');
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

const db = new Database(path.join(dbDir, 'seo-tools.db'));
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS sitemap_state (
    site_id TEXT NOT NULL PRIMARY KEY,
    sitemap_url TEXT NOT NULL,
    content_hash TEXT NOT NULL,
    url_count INTEGER NOT NULL DEFAULT 0,
    latest_lastmod TEXT,
    last_submitted_at INTEGER,
    last_checked_at INTEGER NOT NULL DEFAULT 0,
    submit_count INTEGER NOT NULL DEFAULT 0
  );
`);

// Load sites from DB
const siteRows = db.prepare('SELECT id, domain, sc_url FROM sites ORDER BY sort_order ASC').all();
if (siteRows.length === 0) {
  console.log('No sites configured in DB — add sites via the Config tab first.');
  process.exit(0);
}

// Build SITES array: derive sitemap URL from domain convention
const SITES = siteRows.map(r => {
  const domain = r.domain;
  const isUrlPrefix = domain.startsWith('http');
  const scUrl = r.sc_url ?? (isUrlPrefix ? domain : `sc-domain:${domain}`);
  const baseUrl = isUrlPrefix ? domain.replace(/\/$/, '') : `https://${domain}`;
  // Try /sitemap-index.xml first, fall back to /sitemap.xml — stored in sitemap_state after first check
  const sitemapUrl = `${baseUrl}/sitemap.xml`;
  return { id: r.id, scUrl, sitemapUrl };
});

// Load SA key from DB or env
const rawKey = (() => {
  const row = db.prepare("SELECT value FROM config WHERE key = 'google_sa_key'").get();
  return row?.value ?? process.env.GOOGLE_SA_KEY_JSON ?? '{}';
})();
const creds = JSON.parse(rawKey);
if (creds.private_key) creds.private_key = creds.private_key.replace(/\\n/g, '\n');

const auth = new GoogleAuth({
  credentials: creds,
  scopes: ['https://www.googleapis.com/auth/webmasters'],
});
const sc = new searchconsole_v1.Searchconsole({ auth });

const getState = db.prepare('SELECT * FROM sitemap_state WHERE site_id = ?');
const upsertState = db.prepare(`
  INSERT INTO sitemap_state (site_id, sitemap_url, content_hash, url_count, latest_lastmod, last_submitted_at, last_checked_at, submit_count)
  VALUES (@site_id, @sitemap_url, @content_hash, @url_count, @latest_lastmod, @last_submitted_at, @last_checked_at, @submit_count)
  ON CONFLICT(site_id) DO UPDATE SET
    sitemap_url      = excluded.sitemap_url,
    content_hash     = excluded.content_hash,
    url_count        = excluded.url_count,
    latest_lastmod   = excluded.latest_lastmod,
    last_submitted_at = excluded.last_submitted_at,
    last_checked_at  = excluded.last_checked_at,
    submit_count     = excluded.submit_count
`);

async function fetchSitemap(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Googlebot/2.1 (+http://www.google.com/bot.html)' },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

function parseSitemap(xml) {
  const isIndex = xml.includes('<sitemapindex');
  const urlCount = isIndex
    ? (xml.match(/<sitemap>/gi) || []).length
    : (xml.match(/<url>/gi) || []).length;
  const lastmods = [...xml.matchAll(/<lastmod>([^<]+)<\/lastmod>/gi)].map(m => m[1].trim());
  const latestLastmod = lastmods.length
    ? lastmods.reduce((a, b) => (new Date(a) > new Date(b) ? a : b))
    : null;
  return { urlCount, latestLastmod, isIndex };
}

function hashContent(xml) {
  const normalized = xml.replace(/\s+/g, ' ').trim();
  return createHash('sha256').update(normalized).digest('hex').slice(0, 16);
}

console.log(`[sitemap-sync] Starting${DRY_RUN ? ' (DRY RUN)' : ''} — ${new Date().toISOString()}\n`);

let submitted = 0;
let skippedUnchanged = 0;
let skippedThrottled = 0;
let errors = 0;

for (const site of SITES) {
  let xml;
  try {
    xml = await fetchSitemap(site.sitemapUrl);
  } catch (e) {
    console.log(`  ${site.id}: fetch error — ${e.message}`);
    errors++;
    continue;
  }

  const { urlCount, latestLastmod, isIndex } = parseSitemap(xml);
  const hash = hashContent(xml);
  const now = Date.now();

  const prev = getState.get(site.id);
  const hashChanged = !prev || prev.content_hash !== hash;
  const timeSinceSubmit = prev?.last_submitted_at ? now - prev.last_submitted_at : Infinity;
  const canSubmit = timeSinceSubmit >= MIN_SUBMIT_INTERVAL_MS;

  const typeLabel = isIndex ? 'index' : 'urlset';
  const lastmodLabel = latestLastmod ? `, latest: ${latestLastmod}` : '';

  if (!hashChanged) {
    console.log(`  ${site.id}: unchanged (${urlCount} URLs${lastmodLabel}) — skip`);
    skippedUnchanged++;
    upsertState.run({
      site_id: site.id,
      sitemap_url: site.sitemapUrl,
      content_hash: hash,
      url_count: urlCount,
      latest_lastmod: latestLastmod,
      last_submitted_at: prev?.last_submitted_at ?? null,
      last_checked_at: now,
      submit_count: prev?.submit_count ?? 0,
    });
    continue;
  }

  if (!canSubmit) {
    const hoursLeft = Math.ceil((MIN_SUBMIT_INTERVAL_MS - timeSinceSubmit) / 3600000);
    console.log(`  ${site.id}: CHANGED (${urlCount} URLs${lastmodLabel}) but submitted ${Math.round(timeSinceSubmit / 3600000)}h ago — retry in ${hoursLeft}h`);
    skippedThrottled++;
    upsertState.run({
      site_id: site.id,
      sitemap_url: site.sitemapUrl,
      content_hash: hash,
      url_count: urlCount,
      latest_lastmod: latestLastmod,
      last_submitted_at: prev?.last_submitted_at ?? null,
      last_checked_at: now,
      submit_count: prev?.submit_count ?? 0,
    });
    continue;
  }

  if (DRY_RUN) {
    console.log(`  ${site.id}: CHANGED (${typeLabel}, ${urlCount} URLs${lastmodLabel}) → would submit ${site.sitemapUrl}`);
    submitted++;
  } else {
    try {
      await sc.sitemaps.submit({ siteUrl: site.scUrl, feedpath: site.sitemapUrl });
      const newCount = (prev?.submit_count ?? 0) + 1;
      console.log(`  ${site.id}: CHANGED → submitted ${site.sitemapUrl} (#${newCount} total)`);
      upsertState.run({
        site_id: site.id,
        sitemap_url: site.sitemapUrl,
        content_hash: hash,
        url_count: urlCount,
        latest_lastmod: latestLastmod,
        last_submitted_at: now,
        last_checked_at: now,
        submit_count: newCount,
      });
      submitted++;
    } catch (e) {
      console.log(`  ${site.id}: submit error — ${e.message}`);
      errors++;
      upsertState.run({
        site_id: site.id,
        sitemap_url: site.sitemapUrl,
        content_hash: hash,
        url_count: urlCount,
        latest_lastmod: latestLastmod,
        last_submitted_at: prev?.last_submitted_at ?? null,
        last_checked_at: now,
        submit_count: prev?.submit_count ?? 0,
      });
    }
  }
}

console.log(`\n[sitemap-sync] Done — submitted: ${submitted}, unchanged: ${skippedUnchanged}, throttled: ${skippedThrottled}, errors: ${errors}`);
db.close();
