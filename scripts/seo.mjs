#!/usr/bin/env node
import { randomUUID } from 'node:crypto';
import { GoogleAuth } from 'google-auth-library';
import { searchconsole_v1 } from '@googleapis/searchconsole';
import { AnalyticsAdminServiceClient } from '@google-analytics/admin';
import path from 'node:path';
import fs from 'node:fs';
import { openDatabase } from '../src/lib/sqlite-driver.js';
import { normalizeGa4PropertyId } from './ga4-property.mjs';
import { ALERT_SCHEMA_SQL, processSnapshotAlertsForCli, processWeeklyDigestForCli } from './snapshot-alerts.mjs';
import { loadCliSites } from './seo-sites.mjs';

// Init DB and load SA key
const dbDir = path.join(process.cwd(), 'data');
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });
const db = openDatabase(path.join(dbDir, 'seo-tools.db'));
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
const analyticsAdminAuth = new GoogleAuth({ credentials: creds, scopes: ['https://www.googleapis.com/auth/analytics.edit'] });
const analyticsAdmin = new AnalyticsAdminServiceClient({ auth: analyticsAdminAuth });
const SNAPSHOT_JOB_KEY = 'daily';
const SNAPSHOT_STALE_LOCK_MS = 6 * 60 * 60 * 1000;

function dateStr(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function daysBack(days) {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() - days);
  return dateStr(date);
}

function loadSites() {
  return loadCliSites(db);
}

const commands = {
  sites: listSites,
  sitemaps: listSitemaps,
  'submit-sitemap': submitSitemap,
  stats: showStats,
  snapshot: takeSnapshot,
  pages: showPages,
  check: checkReachability,
  'register-cwv': registerCwv,
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
  const startDate = daysBack(7);
  const endDate = daysBack(1);

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

  const res = await sc.searchanalytics.query({
    siteUrl,
    requestBody: {
      startDate: daysBack(30),
      endDate: daysBack(1),
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

  const today = daysBack(0);

  db.exec(`
    CREATE TABLE IF NOT EXISTS sc_snapshots (id INTEGER PRIMARY KEY AUTOINCREMENT, site_id TEXT NOT NULL, date TEXT NOT NULL, page_url TEXT NOT NULL, clicks INTEGER NOT NULL DEFAULT 0, impressions INTEGER NOT NULL DEFAULT 0, ctr REAL NOT NULL DEFAULT 0, position REAL NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT (datetime('now')));
    CREATE TABLE IF NOT EXISTS ga4_snapshots (id INTEGER PRIMARY KEY AUTOINCREMENT, site_id TEXT NOT NULL, date TEXT NOT NULL, users INTEGER NOT NULL DEFAULT 0, sessions INTEGER NOT NULL DEFAULT 0, views INTEGER NOT NULL DEFAULT 0, bounce_rate REAL NOT NULL DEFAULT 0, avg_duration REAL NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT (datetime('now')));
    CREATE INDEX IF NOT EXISTS idx_sc_site_date ON sc_snapshots(site_id, date);
    CREATE INDEX IF NOT EXISTS idx_ga4_site_date ON ga4_snapshots(site_id, date);
    CREATE TABLE IF NOT EXISTS snapshot_runs (
      job_key TEXT NOT NULL PRIMARY KEY,
      status TEXT NOT NULL DEFAULT 'idle',
      last_started_at INTEGER,
      last_finished_at INTEGER,
      last_success_at INTEGER,
      last_failure_at INTEGER,
      last_error TEXT,
      lock_owner TEXT
    );
    -- keyword_history is also created in src/lib/db.ts (app initSchema); keep schemas in sync
    CREATE TABLE IF NOT EXISTS keyword_history (site_id TEXT NOT NULL, date TEXT NOT NULL, query TEXT NOT NULL, clicks INTEGER NOT NULL DEFAULT 0, impressions INTEGER NOT NULL DEFAULT 0, ctr REAL NOT NULL DEFAULT 0, position REAL NOT NULL DEFAULT 0, PRIMARY KEY (site_id, date, query));
    CREATE INDEX IF NOT EXISTS idx_kw_history_site_query ON keyword_history(site_id, query, date);
    ${ALERT_SCHEMA_SQL}
  `);
  try { db.exec(`ALTER TABLE snapshot_runs ADD COLUMN lock_owner TEXT`); } catch { /* already exists */ }

  const sites = loadSites();
  if (sites.length === 0) {
    console.log('No sites configured in DB — add sites via the Config tab first.');
    return;
  }

  const lockOwner = acquireSnapshotLock();
  try {
    const startDate = daysBack(7);
    const endDate = daysBack(1);

    console.log(`Taking snapshot for ${today}...\n`);

    const scDelete = db.prepare('DELETE FROM sc_snapshots WHERE site_id = ? AND date = ?');
    const scInsert = db.prepare('INSERT INTO sc_snapshots (site_id, date, page_url, clicks, impressions, ctr, position) VALUES (?, ?, ?, ?, ?, ?, ?)');
    for (const site of sites) {
      if (!site.searchConsole) {
        console.log(`  SC ${site.id}: skipped (Search Console disabled)`);
        continue;
      }
      try {
        const q = await sc.searchanalytics.query({
          siteUrl: site.scUrl,
          requestBody: { startDate, endDate, dimensions: ['page'], rowLimit: 100 },
        });
        const rows = q.data.rows || [];
        const insertAll = db.transaction(() => {
          scDelete.run(site.id, today);
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

    const kwInsert = db.prepare(
      `INSERT INTO keyword_history (site_id, date, query, clicks, impressions, ctr, position)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(site_id, date, query) DO UPDATE SET
         clicks = excluded.clicks, impressions = excluded.impressions,
         ctr = excluded.ctr, position = excluded.position`,
    );
    for (const site of sites) {
      if (!site.searchConsole) {
        console.log(`  KW ${site.id}: skipped (Search Console disabled)`);
        continue;
      }
      try {
        const q = await sc.searchanalytics.query({
          siteUrl: site.scUrl,
          requestBody: { startDate, endDate, dimensions: ['query'], rowLimit: 50 },
        });
        const rows = q.data.rows || [];
        const insertAll = db.transaction(() => {
          for (const row of rows) {
            kwInsert.run(site.id, today, row.keys?.[0] || '', row.clicks || 0, row.impressions || 0, row.ctr || 0, row.position || 0);
          }
        });
        insertAll();
        console.log(`  KW ${site.id}: ${rows.length} queries`);
      } catch (e) {
        console.log(`  KW ${site.id}: error - ${e.message.slice(0, 60)}`);
      }
    }

    const ga4Auth = new GoogleAuth({
      credentials: creds,
      scopes: ['https://www.googleapis.com/auth/analytics.readonly'],
    });
    const ga4Client = new BetaAnalyticsDataClient({ auth: ga4Auth });
    const ga4Delete = db.prepare('DELETE FROM ga4_snapshots WHERE site_id = ? AND date = ?');
    const ga4Insert = db.prepare('INSERT INTO ga4_snapshots (site_id, date, users, sessions, views, bounce_rate, avg_duration) VALUES (?, ?, ?, ?, ?, ?, ?)');
    const ga4Upsert = db.transaction((siteId, date, users, sessions, views, bounce, duration) => {
      ga4Delete.run(siteId, date);
      ga4Insert.run(siteId, date, users, sessions, views, bounce, duration);
    });

    for (const site of sites) {
      const ga4PropertyId = normalizeGa4PropertyId(site.ga4);
      if (!ga4PropertyId) continue;
      try {
        const [report] = await ga4Client.runReport({
          property: ga4PropertyId,
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
        ga4Upsert(site.id, today, users, sessions, views, bounce, duration);
        console.log(`  GA4 ${site.id}: ${users} users, ${views} views`);
      } catch (e) {
        console.log(`  GA4 ${site.id}: error - ${e.message.slice(0, 60)}`);
      }
    }

    const alertResult = await processSnapshotAlertsForCli(db, today);
    if (alertResult.fired > 0) {
      console.log(`  Alerts: ${alertResult.fired} fired`);
    }
    for (const error of alertResult.errors) {
      console.log(`  Alerts: ${error}`);
    }

    const digestResult = await processWeeklyDigestForCli(db, today);
    if (digestResult.sent) {
      console.log('  Weekly digest: sent');
    }
    if (digestResult.deliveryError) {
      console.log(`  Weekly digest: ${digestResult.deliveryError}`);
    }

    finishSnapshotRun({ lockOwner, success: true });
    console.log(`\nSnapshot saved for ${today}`);
  } catch (error) {
    finishSnapshotRun({ lockOwner, success: false, error });
    throw error;
  }
}

function acquireSnapshotLock(now = Date.now()) {
  const lockOwner = randomUUID();
  const upsertRunning = db.prepare(`
    INSERT INTO snapshot_runs (job_key, status, last_started_at, last_finished_at, last_error, lock_owner)
    VALUES (?, 'running', ?, NULL, NULL, ?)
    ON CONFLICT(job_key) DO UPDATE SET
      status = 'running',
      last_started_at = excluded.last_started_at,
      last_finished_at = NULL,
      last_error = NULL,
      lock_owner = excluded.lock_owner
    WHERE snapshot_runs.status != 'running'
      OR snapshot_runs.last_started_at IS NULL
      OR ? - snapshot_runs.last_started_at >= ?
  `);

  const result = upsertRunning.run(SNAPSHOT_JOB_KEY, now, lockOwner, now, SNAPSHOT_STALE_LOCK_MS);
  if (result.changes === 0) {
    throw new Error('snapshot_in_progress');
  }
  return lockOwner;
}

function finishSnapshotRun({ lockOwner, success, error, now = Date.now() }) {
  if (success) {
    db.prepare(`
      UPDATE snapshot_runs
      SET status = 'idle',
        last_finished_at = ?,
        last_success_at = ?,
        last_error = NULL,
        lock_owner = NULL
      WHERE job_key = ? AND lock_owner = ?
    `).run(now, now, SNAPSHOT_JOB_KEY, lockOwner);
    return;
  }

  db.prepare(`
    UPDATE snapshot_runs
    SET status = 'idle',
      last_finished_at = ?,
      last_failure_at = ?,
      last_error = ?,
      lock_owner = NULL
    WHERE job_key = ? AND lock_owner = ?
  `).run(
    now,
    now,
    error instanceof Error ? error.message : String(error),
    SNAPSHOT_JOB_KEY,
    lockOwner,
  );
}

const UAS = [
  { name: 'Googlebot', ua: 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)' },
];

const CWV_DIMENSION_DEFS = [
  { parameterName: 'metric_name', displayName: 'Metric Name', description: 'Core Web Vitals metric name (LCP, INP, CLS, FCP, TTFB)' },
  { parameterName: 'metric_rating', displayName: 'Metric Rating', description: 'Core Web Vitals rating (good, needs-improvement, poor)' },
];
const CWV_METRIC_PARAM = 'metric_value';

async function registerCwv() {
  const domainArg = process.argv[3];
  if (!domainArg) {
    console.error('Usage: pnpm seo register-cwv <domain>');
    process.exit(1);
  }

  const sites = loadSites();
  const site = sites.find(s => s.domain === domainArg || s.id === domainArg);
  if (!site) {
    console.error(`Unknown site: ${domainArg}`);
    console.error(`Available: ${sites.map(s => s.id).join(', ')}`);
    process.exit(1);
  }
  if (!site.ga4PropertyId) {
    console.error(`${site.id} has no GA4 property configured`);
    process.exit(1);
  }

  const parent = normalizeGa4PropertyId(site.ga4PropertyId).startsWith('properties/')
    ? normalizeGa4PropertyId(site.ga4PropertyId)
    : `properties/${normalizeGa4PropertyId(site.ga4PropertyId)}`;

  const [existingDimensions] = await analyticsAdmin.listCustomDimensions({ parent });
  const existingDimensionParams = new Set((existingDimensions ?? []).map(d => d.parameterName));

  for (const dim of CWV_DIMENSION_DEFS) {
    if (existingDimensionParams.has(dim.parameterName)) {
      console.log(`Dimension already exists: ${dim.parameterName}`);
      continue;
    }
    await analyticsAdmin.createCustomDimension({
      parent,
      customDimension: { parameterName: dim.parameterName, displayName: dim.displayName, description: dim.description, scope: 'EVENT' },
    });
    console.log(`Created dimension: ${dim.parameterName}`);
  }

  const [existingMetrics] = await analyticsAdmin.listCustomMetrics({ parent });
  const existingMetricParams = new Set((existingMetrics ?? []).map(m => m.parameterName));

  if (existingMetricParams.has(CWV_METRIC_PARAM)) {
    console.log(`Metric already exists: ${CWV_METRIC_PARAM}`);
  } else {
    await analyticsAdmin.createCustomMetric({
      parent,
      customMetric: {
        parameterName: CWV_METRIC_PARAM,
        displayName: 'Metric Value',
        description: 'Core Web Vitals metric value (milliseconds for timing metrics; CLS is unitless but shares this param)',
        measurementUnit: 'MILLISECONDS',
        scope: 'EVENT',
      },
    });
    console.log(`Created metric: ${CWV_METRIC_PARAM}`);
  }

  console.log(`\nDone. GA4 Data API queries for ${site.id} may take 24–48h to reflect new custom definitions.`);
}

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
  pages             Show top Search Console pages for a site
  snapshot          Take a data snapshot (SC + GA4) and process alerts
  check [id]        Check reachability of all sites (or one) with different UAs
  register-cwv      Register GA4 custom dimensions/metric for CWV RUM (domain or id)
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
