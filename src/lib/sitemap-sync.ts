/**
 * Sitemap change detector + auto-resubmitter.
 * Runs inside the Next.js server process — no external cron needed.
 *
 * Logic:
 *   - Fetch each site's sitemap XML every 6 hours
 *   - Hash the content (SHA-256, first 16 chars)
 *   - If hash changed since last check → submit to GSC (max once per 24h per site)
 *   - If unchanged → skip
 */
import { createHash } from 'node:crypto';
import { getAuth } from './google-auth';
import { searchconsole_v1 } from '@googleapis/searchconsole';
import { getDb } from './db';

const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;   // check every 6h
const MIN_SUBMIT_INTERVAL_MS = 24 * 60 * 60 * 1000; // submit at most once per 24h

interface SitemapSite {
  id: string;
  scUrl: string;
  sitemapUrl: string;
}

function loadSites(): SitemapSite[] {
  try {
    const db = getDb();
    const rows = db.prepare('SELECT id, domain, sc_url FROM sites ORDER BY sort_order ASC').all() as Array<{
      id: string; domain: string; sc_url: string | null;
    }>;
    return rows.map(r => {
      const isUrlPrefix = r.domain.startsWith('http');
      const scUrl = r.sc_url ?? (isUrlPrefix ? r.domain : `sc-domain:${r.domain}`);
      const baseUrl = isUrlPrefix ? r.domain.replace(/\/$/, '') : `https://${r.domain}`;
      return { id: r.id, scUrl, sitemapUrl: `${baseUrl}/sitemap.xml` };
    });
  } catch {
    return [];
  }
}

function ensureTable(): void {
  const db = getDb();
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
}

async function fetchSitemap(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Googlebot/2.1 (+http://www.google.com/bot.html)' },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

export function parseSitemap(xml: string): { urlCount: number; latestLastmod: string | null; isIndex: boolean } {
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

export function hashContent(xml: string): string {
  const normalized = xml.replace(/\s+/g, ' ').trim();
  return createHash('sha256').update(normalized).digest('hex').slice(0, 16);
}

export async function runSitemapSync(): Promise<void> {
  ensureTable();
  const db = getDb();
  const sc = new searchconsole_v1.Searchconsole({ auth: getAuth() });

  const getState = db.prepare('SELECT * FROM sitemap_state WHERE site_id = ?');
  const upsertState = db.prepare(`
    INSERT INTO sitemap_state (site_id, sitemap_url, content_hash, url_count, latest_lastmod, last_submitted_at, last_checked_at, submit_count)
    VALUES (@site_id, @sitemap_url, @content_hash, @url_count, @latest_lastmod, @last_submitted_at, @last_checked_at, @submit_count)
    ON CONFLICT(site_id) DO UPDATE SET
      sitemap_url       = excluded.sitemap_url,
      content_hash      = excluded.content_hash,
      url_count         = excluded.url_count,
      latest_lastmod    = excluded.latest_lastmod,
      last_submitted_at = excluded.last_submitted_at,
      last_checked_at   = excluded.last_checked_at,
      submit_count      = excluded.submit_count
  `);

  const sites = loadSites();
  console.log('[sitemap-sync] Checking sitemaps...');
  let submitted = 0, unchanged = 0, throttled = 0, errors = 0;

  for (const site of sites) {
    let xml: string;
    try {
      xml = await fetchSitemap(site.sitemapUrl);
    } catch (e) {
      console.error(`[sitemap-sync] ${site.id}: fetch error — ${(e as Error).message}`);
      errors++;
      continue;
    }

    const { urlCount, latestLastmod } = parseSitemap(xml);
    const hash = hashContent(xml);
    const now = Date.now();

    const prev = getState.get(site.id) as {
      content_hash: string;
      last_submitted_at: number | null;
      submit_count: number;
    } | undefined;

    const hashChanged = !prev || prev.content_hash !== hash;
    const timeSinceSubmit = prev?.last_submitted_at ? now - prev.last_submitted_at : Infinity;
    const canSubmit = timeSinceSubmit >= MIN_SUBMIT_INTERVAL_MS;

    if (!hashChanged) {
      unchanged++;
      upsertState.run({ site_id: site.id, sitemap_url: site.sitemapUrl, content_hash: hash, url_count: urlCount, latest_lastmod: latestLastmod, last_submitted_at: prev?.last_submitted_at ?? null, last_checked_at: now, submit_count: prev?.submit_count ?? 0 });
      continue;
    }

    if (!canSubmit) {
      const hoursLeft = Math.ceil((MIN_SUBMIT_INTERVAL_MS - timeSinceSubmit) / 3_600_000);
      console.log(`[sitemap-sync] ${site.id}: changed but throttled — retry in ${hoursLeft}h`);
      throttled++;
      upsertState.run({ site_id: site.id, sitemap_url: site.sitemapUrl, content_hash: hash, url_count: urlCount, latest_lastmod: latestLastmod, last_submitted_at: prev?.last_submitted_at ?? null, last_checked_at: now, submit_count: prev?.submit_count ?? 0 });
      continue;
    }

    try {
      await sc.sitemaps.submit({ siteUrl: site.scUrl, feedpath: site.sitemapUrl });
      const newCount = (prev?.submit_count ?? 0) + 1;
      console.log(`[sitemap-sync] ${site.id}: changed → submitted ${site.sitemapUrl} (#${newCount})`);
      upsertState.run({ site_id: site.id, sitemap_url: site.sitemapUrl, content_hash: hash, url_count: urlCount, latest_lastmod: latestLastmod, last_submitted_at: now, last_checked_at: now, submit_count: newCount });
      submitted++;
    } catch (e) {
      console.error(`[sitemap-sync] ${site.id}: submit error — ${(e as Error).message?.slice(0, 80)}`);
      errors++;
      upsertState.run({ site_id: site.id, sitemap_url: site.sitemapUrl, content_hash: hash, url_count: urlCount, latest_lastmod: latestLastmod, last_submitted_at: prev?.last_submitted_at ?? null, last_checked_at: now, submit_count: prev?.submit_count ?? 0 });
    }
  }

  console.log(`[sitemap-sync] Done — submitted: ${submitted}, unchanged: ${unchanged}, throttled: ${throttled}, errors: ${errors}`);
}

let _intervalId: ReturnType<typeof setInterval> | null = null;

export function startSitemapSync(): void {
  if (_intervalId) return;

  // Run immediately on startup, then every 6h
  runSitemapSync().catch(e => console.error('[sitemap-sync] startup error:', (e as Error).message));

  _intervalId = setInterval(() => {
    runSitemapSync().catch(e => console.error('[sitemap-sync] interval error:', (e as Error).message));
  }, CHECK_INTERVAL_MS);

  console.log(`[sitemap-sync] Scheduled every ${CHECK_INTERVAL_MS / 3_600_000}h`);
}
