#!/usr/bin/env node
/**
 * Collect daily SC + GA4 data into sc_daily / ga4_daily tables.
 * Automatically backfills any missing dates up to 90 days back.
 * Sites are read from the SQLite sites table — no hardcoded domains.
 *
 * Usage:
 *   pnpm collect-daily          # backfill missing + collect today
 *   pnpm collect-daily --days 30  # only look back 30 days
 */
import { GoogleAuth } from 'google-auth-library';
import { searchconsole_v1 } from '@googleapis/searchconsole';
import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';

// Init DB
const dbDir = path.join(process.cwd(), 'data');
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

const db = new Database(path.join(dbDir, 'seo-tools.db'));
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS sc_daily (
    site_id TEXT NOT NULL,
    date TEXT NOT NULL,
    clicks INTEGER NOT NULL DEFAULT 0,
    impressions INTEGER NOT NULL DEFAULT 0,
    ctr REAL NOT NULL DEFAULT 0,
    position REAL NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (site_id, date)
  );
  CREATE INDEX IF NOT EXISTS idx_sc_daily_site ON sc_daily(site_id, date);

  CREATE TABLE IF NOT EXISTS ga4_daily (
    site_id TEXT NOT NULL,
    date TEXT NOT NULL,
    users INTEGER NOT NULL DEFAULT 0,
    sessions INTEGER NOT NULL DEFAULT 0,
    views INTEGER NOT NULL DEFAULT 0,
    bounce_rate REAL NOT NULL DEFAULT 0,
    avg_duration REAL NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (site_id, date)
  );
  CREATE INDEX IF NOT EXISTS idx_ga4_daily_site ON ga4_daily(site_id, date);
`);

// Load sites from DB
const siteRows = db.prepare('SELECT id, domain, sc_url, ga4_property_id, search_console FROM sites ORDER BY sort_order ASC').all();
if (siteRows.length === 0) {
  console.log('No sites configured in DB — add sites via the Config tab first.');
  process.exit(0);
}
const SITES = siteRows.map(r => ({
  id: r.id,
  domain: r.domain,
  scUrl: r.sc_url ?? `sc-domain:${r.domain}`,
  ga4: r.ga4_property_id,
  searchConsole: r.search_console !== 0,
}));

// Load SA key from DB or env
const rawKey = (() => {
  const row = db.prepare("SELECT value FROM config WHERE key = 'google_sa_key'").get();
  return row?.value ?? process.env.GOOGLE_SA_KEY_JSON ?? '{}';
})();
const creds = JSON.parse(rawKey);
if (creds.private_key) creds.private_key = creds.private_key.replace(/\\n/g, '\n');

const auth = new GoogleAuth({
  credentials: creds,
  scopes: [
    'https://www.googleapis.com/auth/webmasters',
    'https://www.googleapis.com/auth/analytics.readonly',
  ],
});
const sc = new searchconsole_v1.Searchconsole({ auth });

function dateStr(d) {
  return d.toISOString().split('T')[0];
}

function daysBack(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

// Parse --days flag
const daysArg = process.argv.indexOf('--days');
const lookbackDays = daysArg !== -1 ? parseInt(process.argv[daysArg + 1]) || 90 : 90;

const startDate = dateStr(daysBack(lookbackDays));
// SC data is typically delayed by 2 days
const endDate = dateStr(daysBack(2));

// Find missing dates for a site
function getMissing(table, siteId) {
  const existing = db.prepare(
    `SELECT date FROM ${table} WHERE site_id = ? AND date >= ? AND date <= ?`,
  ).all(siteId, startDate, endDate);
  const existingSet = new Set(existing.map(r => r.date));

  const missing = [];
  const cur = new Date(startDate);
  const end = new Date(endDate);
  while (cur <= end) {
    const d = dateStr(cur);
    if (!existingSet.has(d)) missing.push(d);
    cur.setDate(cur.getDate() + 1);
  }
  return missing;
}

// Batch dates into contiguous ranges for fewer API calls
function batchRanges(dates) {
  if (dates.length === 0) return [];
  const sorted = [...dates].sort();
  const ranges = [];
  let rangeStart = sorted[0];
  let prev = sorted[0];

  for (let i = 1; i < sorted.length; i++) {
    const expected = new Date(prev);
    expected.setDate(expected.getDate() + 1);
    if (sorted[i] !== dateStr(expected)) {
      ranges.push({ start: rangeStart, end: prev });
      rangeStart = sorted[i];
    }
    prev = sorted[i];
  }
  ranges.push({ start: rangeStart, end: prev });
  return ranges;
}

const scUpsert = db.prepare(
  `INSERT INTO sc_daily (site_id, date, clicks, impressions, ctr, position)
   VALUES (?, ?, ?, ?, ?, ?)
   ON CONFLICT(site_id, date) DO UPDATE SET
     clicks = excluded.clicks, impressions = excluded.impressions,
     ctr = excluded.ctr, position = excluded.position,
     created_at = datetime('now')`,
);

const ga4Upsert = db.prepare(
  `INSERT INTO ga4_daily (site_id, date, users, sessions, views, bounce_rate, avg_duration)
   VALUES (?, ?, ?, ?, ?, ?, ?)
   ON CONFLICT(site_id, date) DO UPDATE SET
     users = excluded.users, sessions = excluded.sessions, views = excluded.views,
     bounce_rate = excluded.bounce_rate, avg_duration = excluded.avg_duration,
     created_at = datetime('now')`,
);

console.log(`Collecting daily data: ${startDate} → ${endDate} (${lookbackDays} days)\n`);

// --- Search Console ---
for (const site of SITES.filter(s => s.searchConsole)) {
  const missing = getMissing('sc_daily', site.id);
  if (missing.length === 0) {
    console.log(`  SC ${site.id}: up to date`);
    continue;
  }

  const ranges = batchRanges(missing);
  let total = 0;

  for (const range of ranges) {
    try {
      const q = await sc.searchanalytics.query({
        siteUrl: site.scUrl,
        requestBody: {
          startDate: range.start,
          endDate: range.end,
          dimensions: ['date'],
          rowLimit: 500,
        },
      });

      const rows = q.data.rows || [];
      const insert = db.transaction(() => {
        for (const row of rows) {
          scUpsert.run(
            site.id,
            row.keys?.[0] || '',
            row.clicks || 0,
            row.impressions || 0,
            row.ctr || 0,
            row.position || 0,
          );
        }
      });
      insert();
      total += rows.length;
    } catch (e) {
      console.log(`  SC ${site.id}: error ${range.start}-${range.end} — ${e.message.slice(0, 60)}`);
    }
  }

  console.log(`  SC ${site.id}: ${total} days collected (${missing.length} were missing)`);
}

// --- GA4 ---
const { BetaAnalyticsDataClient } = await import('@google-analytics/data');
const ga4Auth = new GoogleAuth({
  credentials: creds,
  scopes: ['https://www.googleapis.com/auth/analytics.readonly'],
});
const ga4Client = new BetaAnalyticsDataClient({ auth: ga4Auth });

for (const site of SITES.filter(s => s.ga4)) {
  const missing = getMissing('ga4_daily', site.id);
  if (missing.length === 0) {
    console.log(`  GA4 ${site.id}: up to date`);
    continue;
  }

  const ranges = batchRanges(missing);
  let total = 0;

  for (const range of ranges) {
    try {
      const [report] = await ga4Client.runReport({
        property: `properties/${site.ga4}`,
        dateRanges: [{ startDate: range.start, endDate: range.end }],
        dimensions: [{ name: 'date' }],
        metrics: [
          { name: 'activeUsers' },
          { name: 'sessions' },
          { name: 'screenPageViews' },
          { name: 'bounceRate' },
          { name: 'averageSessionDuration' },
        ],
        orderBys: [{ dimension: { dimensionName: 'date' } }],
      });

      const rows = report.rows || [];
      const insert = db.transaction(() => {
        for (const row of rows) {
          const dateRaw = row.dimensionValues?.[0]?.value || '';
          // GA4 returns date as YYYYMMDD
          const date = dateRaw.length === 8
            ? `${dateRaw.slice(0, 4)}-${dateRaw.slice(4, 6)}-${dateRaw.slice(6, 8)}`
            : dateRaw;
          ga4Upsert.run(
            site.id,
            date,
            parseInt(row.metricValues?.[0]?.value || '0'),
            parseInt(row.metricValues?.[1]?.value || '0'),
            parseInt(row.metricValues?.[2]?.value || '0'),
            parseFloat(row.metricValues?.[3]?.value || '0'),
            parseFloat(row.metricValues?.[4]?.value || '0'),
          );
        }
      });
      insert();
      total += rows.length;
    } catch (e) {
      console.log(`  GA4 ${site.id}: error ${range.start}-${range.end} — ${e.message.slice(0, 60)}`);
    }
  }

  console.log(`  GA4 ${site.id}: ${total} days collected (${missing.length} were missing)`);
}

console.log('\nDone.');
db.close();
