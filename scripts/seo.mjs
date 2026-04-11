#!/usr/bin/env node
import { GoogleAuth } from 'google-auth-library';
import { searchconsole_v1 } from '@googleapis/searchconsole';
import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';

// Init DB and load SA key
const dbDir = path.join(process.cwd(), 'data');
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });
const db = new Database(path.join(dbDir, 'seo-tools.db'));
db.pragma('journal_mode = WAL');

const rawKey = (() => {
  try {
    const row = db.prepare("SELECT value FROM config WHERE key = 'google_sa_key'").get();
    return row?.value ?? process.env.GOOGLE_SA_KEY_JSON ?? '{}';
  } catch { return process.env.GOOGLE_SA_KEY_JSON ?? '{}'; }
})();
const creds = JSON.parse(rawKey);
if (creds.private_key) creds.private_key = creds.private_key.replace(/\\n/g, '\n');

const auth = new GoogleAuth({ credentials: creds, scopes: ['https://www.googleapis.com/auth/webmasters'] });
const sc = new searchconsole_v1.Searchconsole({ auth });

function loadSites() {
  try {
    return db.prepare('SELECT id, domain, sc_url, ga4_property_id, test_pages FROM sites ORDER BY sort_order ASC').all().map(r => ({
      id: r.id,
      domain: r.domain,
      scUrl: r.sc_url ?? `sc-domain:${r.domain}`,
      ga4: r.ga4_property_id,
      pages: JSON.parse(r.test_pages || '[]'),
    }));
  } catch { return []; }
}

const commands = {
  sites: listSites,
  sitemaps: listSitemaps,
  'submit-sitemap': submitSitemap,
  stats: showStats,
  snapshot: takeSnapshot,
  pages: showPages,
  check: checkReachability,
  help: showHelp,
};

async function listSites() {
  const res = await sc.sites.list();
  for (const s of res.data.siteEntry || []) {
    console.log(`${s.siteUrl}  (${s.permissionLevel})`);
  }
}

async function listSitemaps() {
  const res = await sc.sites.list();
  for (const s of res.data.siteEntry || []) {
    const maps = await sc.sitemaps.list({ siteUrl: s.siteUrl });
    const entries = maps.data.sitemap || [];
    if (entries.length) {
      for (const m of entries) {
        console.log(`${s.siteUrl}  →  ${m.path}  (Submitted: ${m.lastSubmitted || 'pending'}, Downloaded: ${m.lastDownloaded || 'N/A'}, Warnings: ${m.warnings || 0}, Errors: ${m.errors || 0})`);
      }
    } else {
      console.log(`${s.siteUrl}  →  no sitemaps`);
    }
  }
}

async function submitSitemap() {
  const domain = process.argv[3];
  const feedpath = process.argv[4];
  if (!domain || !feedpath) {
    console.error('Usage: pnpm seo submit-sitemap <domain> <sitemap-url>');
    process.exit(1);
  }
  const siteUrl = domain.startsWith('sc-domain:') ? domain : `sc-domain:${domain}`;
  await sc.sitemaps.submit({ siteUrl, feedpath });
  console.log(`Submitted: ${feedpath} → ${siteUrl}`);
}

async function showStats() {
  const end = new Date(); end.setDate(end.getDate() - 1);
  const start = new Date(); start.setDate(start.getDate() - 7);
  const startDate = start.toISOString().split('T')[0];
  const endDate = end.toISOString().split('T')[0];

  const res = await sc.sites.list();
  console.log(`Search Console stats (${startDate} → ${endDate})\n`);
  console.log('Site'.padEnd(30) + 'Clicks'.padStart(10) + 'Impressions'.padStart(14) + 'CTR'.padStart(10) + 'Position'.padStart(10));
  console.log('-'.repeat(74));

  for (const s of res.data.siteEntry || []) {
    try {
      const q = await sc.searchanalytics.query({
        siteUrl: s.siteUrl,
        requestBody: { startDate, endDate, dimensions: [], rowLimit: 1 },
      });
      const row = q.data.rows?.[0];
      const clicks = row?.clicks ?? 0;
      const impressions = row?.impressions ?? 0;
      const ctr = row?.ctr ? (row.ctr * 100).toFixed(2) + '%' : '0%';
      const pos = row?.position?.toFixed(1) ?? '-';
      const name = s.siteUrl.replace('sc-domain:', '');
      console.log(name.padEnd(30) + String(clicks).padStart(10) + String(impressions).padStart(14) + ctr.padStart(10) + pos.padStart(10));
    } catch (e) {
      console.log(s.siteUrl.replace('sc-domain:', '').padEnd(30) + '  error: ' + e.message.slice(0, 50));
    }
  }
}

async function showPages() {
  const domain = process.argv[3];
  if (!domain) {
    console.error('Usage: pnpm seo pages <domain>');
    process.exit(1);
  }
  const siteUrl = domain.startsWith('sc-domain:') || domain.startsWith('http') ? domain : `sc-domain:${domain}`;

  const end = new Date(); end.setDate(end.getDate() - 1);
  const start = new Date(); start.setDate(start.getDate() - 30);

  const res = await sc.searchanalytics.query({
    siteUrl,
    requestBody: {
      startDate: start.toISOString().split('T')[0],
      endDate: end.toISOString().split('T')[0],
      dimensions: ['page'],
      rowLimit: 50,
    },
  });

  console.log(`Pages for ${domain} (last 30 days):\n`);
  console.log('Page'.padEnd(60) + 'Clicks'.padStart(10) + 'Impressions'.padStart(14));
  console.log('-'.repeat(84));

  for (const row of res.data.rows || []) {
    console.log((row.keys?.[0] || '').padEnd(60) + String(row.clicks || 0).padStart(10) + String(row.impressions || 0).padStart(14));
  }
}

async function takeSnapshot() {
  const { BetaAnalyticsDataClient } = await import('@google-analytics/data');

  const today = new Date().toISOString().split('T')[0];

  db.exec(`
    CREATE TABLE IF NOT EXISTS sc_snapshots (id INTEGER PRIMARY KEY AUTOINCREMENT, site_id TEXT NOT NULL, date TEXT NOT NULL, page_url TEXT NOT NULL, clicks INTEGER NOT NULL DEFAULT 0, impressions INTEGER NOT NULL DEFAULT 0, ctr REAL NOT NULL DEFAULT 0, position REAL NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT (datetime('now')));
    CREATE TABLE IF NOT EXISTS ga4_snapshots (id INTEGER PRIMARY KEY AUTOINCREMENT, site_id TEXT NOT NULL, date TEXT NOT NULL, users INTEGER NOT NULL DEFAULT 0, sessions INTEGER NOT NULL DEFAULT 0, views INTEGER NOT NULL DEFAULT 0, bounce_rate REAL NOT NULL DEFAULT 0, avg_duration REAL NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT (datetime('now')));
    CREATE INDEX IF NOT EXISTS idx_sc_site_date ON sc_snapshots(site_id, date);
    CREATE INDEX IF NOT EXISTS idx_ga4_site_date ON ga4_snapshots(site_id, date);
  `);

  const sites = loadSites();
  if (sites.length === 0) {
    console.log('No sites configured in DB — add sites via the Config tab first.');
    return;
  }

  const end = new Date(); end.setDate(end.getDate() - 1);
  const start = new Date(); start.setDate(start.getDate() - 7);
  const startDate = start.toISOString().split('T')[0];
  const endDate = end.toISOString().split('T')[0];

  console.log(`Taking snapshot for ${today}...\n`);

  const scInsert = db.prepare('INSERT INTO sc_snapshots (site_id, date, page_url, clicks, impressions, ctr, position) VALUES (?, ?, ?, ?, ?, ?, ?)');
  for (const site of sites) {
    try {
      const q = await sc.searchanalytics.query({
        siteUrl: site.scUrl,
        requestBody: { startDate, endDate, dimensions: ['page'], rowLimit: 100 },
      });
      const rows = q.data.rows || [];
      const insertAll = db.transaction(() => {
        for (const row of rows) {
          scInsert.run(site.id, today, row.keys?.[0] || '', row.clicks || 0, row.impressions || 0, row.ctr || 0, row.position || 0);
        }
      });
      insertAll();
      console.log(`  SC ${site.id}: ${rows.length} pages`);
    } catch (e) {
      console.log(`  SC ${site.id}: error - ${e.message.slice(0, 60)}`);
    }
  }

  const ga4Auth = new GoogleAuth({
    credentials: creds,
    scopes: ['https://www.googleapis.com/auth/analytics.readonly'],
  });
  const ga4Client = new BetaAnalyticsDataClient({ auth: ga4Auth });
  const ga4Insert = db.prepare('INSERT INTO ga4_snapshots (site_id, date, users, sessions, views, bounce_rate, avg_duration) VALUES (?, ?, ?, ?, ?, ?, ?)');

  for (const site of sites) {
    if (!site.ga4) continue;
    try {
      const [report] = await ga4Client.runReport({
        property: `properties/${site.ga4}`,
        dateRanges: [{ startDate: '7daysAgo', endDate: 'yesterday' }],
        metrics: [
          { name: 'activeUsers' },
          { name: 'sessions' },
          { name: 'screenPageViews' },
          { name: 'bounceRate' },
          { name: 'averageSessionDuration' },
        ],
      });
      const row = report.rows?.[0];
      const users = parseInt(row?.metricValues?.[0]?.value || '0');
      const sessions = parseInt(row?.metricValues?.[1]?.value || '0');
      const views = parseInt(row?.metricValues?.[2]?.value || '0');
      const bounce = parseFloat(row?.metricValues?.[3]?.value || '0');
      const duration = parseFloat(row?.metricValues?.[4]?.value || '0');
      ga4Insert.run(site.id, today, users, sessions, views, bounce, duration);
      console.log(`  GA4 ${site.id}: ${users} users, ${views} views`);
    } catch (e) {
      console.log(`  GA4 ${site.id}: error - ${e.message.slice(0, 60)}`);
    }
  }

  console.log(`\nSnapshot saved for ${today}`);
}

const UAS = [
  { name: 'Googlebot', ua: 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)' },
];

async function checkReachability() {
  const sites = loadSites();
  if (sites.length === 0) {
    console.log('No sites configured in DB — add sites via the Config tab first.');
    return;
  }

  const domainArg = process.argv[3];
  const targets = domainArg
    ? sites.filter(s => s.domain === domainArg || s.id === domainArg)
    : sites;

  if (targets.length === 0) {
    console.error(`Unknown site: ${domainArg}`);
    console.error(`Available: ${sites.map(s => s.id).join(', ')}`);
    process.exit(1);
  }

  console.log('Reachability check\n');
  console.log('Site'.padEnd(22) + 'Page'.padEnd(35) + 'UA'.padEnd(12) + 'Status'.padStart(8) + '  Time'.padStart(8) + '  Notes');
  console.log('-'.repeat(100));

  for (const site of targets) {
    await checkUrl(site.domain, '/robots.txt', 'Googlebot', UAS[0].ua);
    for (const page of (site.pages.length ? site.pages : ['/'])) {
      for (const { name, ua } of UAS) {
        await checkUrl(site.domain, page, name, ua);
      }
    }
    console.log('');
  }
}

async function checkUrl(domain, pagePath, uaName, ua) {
  const url = `https://${domain}${pagePath}`;
  const start = Date.now();
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const initial = await fetch(url, {
      signal: controller.signal,
      headers: ua ? { 'User-Agent': ua } : undefined,
      redirect: 'manual',
    });

    let finalStatus = initial.status;
    let notes = '';
    let finalMs = Date.now() - start;

    if ([301, 302, 307].includes(initial.status)) {
      const location = initial.headers.get('location') || '';
      try {
        const followed = await fetch(location, {
          signal: controller.signal,
          headers: ua ? { 'User-Agent': ua } : undefined,
          redirect: 'follow',
        });
        finalMs = Date.now() - start;
        finalStatus = followed.status;
        notes = `→ ${new URL(location).hostname}${new URL(location).pathname} → ${followed.status}`;
      } catch {
        finalMs = Date.now() - start;
        notes = `→ ${location} → TIMEOUT`;
        finalStatus = 0;
      }
    }

    clearTimeout(timeout);
    if (finalStatus === 429) notes = 'BLOCKED (challenge)';

    const color = finalStatus === 200 ? '\x1b[32m'
      : finalStatus === 429 ? '\x1b[31m'
      : finalStatus === 0 ? '\x1b[31m'
      : '\x1b[33m';

    console.log(
      domain.padEnd(22) + pagePath.padEnd(35) + uaName.padEnd(12) +
      color + String(finalStatus || 'FAIL').padStart(8) + '\x1b[0m' +
      (finalMs + 'ms').padStart(8) + '  ' + notes,
    );
  } catch (e) {
    const ms = Date.now() - start;
    const msg = e.name === 'AbortError' ? 'TIMEOUT' : e.message.slice(0, 30);
    console.log(
      domain.padEnd(22) + pagePath.padEnd(35) + uaName.padEnd(12) +
      '\x1b[31m   FAIL\x1b[0m' + (ms + 'ms').padStart(8) + '  ' + msg,
    );
  }
}

function showHelp() {
  console.log(`Usage: pnpm seo <command>

Commands:
  sites             List all sites in Search Console
  sitemaps          List sitemaps for all sites
  submit-sitemap    Submit a sitemap (domain + url)
  stats             Show 7-day Search Console stats
  snapshot          Take a data snapshot (SC + GA4) for trend tracking
  check [id]        Check reachability of all sites (or one) with different UAs
  help              Show this help`);
}

const cmd = process.argv[2] || 'help';
const fn = commands[cmd];
if (!fn) {
  console.error(`Unknown command: ${cmd}`);
  showHelp();
  process.exit(1);
}
fn().catch(e => { console.error(e.message); process.exit(1); });
