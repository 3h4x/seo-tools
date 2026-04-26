import { getAuth } from './google-auth';
import { searchconsole_v1 } from '@googleapis/searchconsole';
import { BetaAnalyticsDataClient } from '@google-analytics/data';
import { getDb, upsertScDaily, upsertGa4Daily } from './db';
import { getManagedSites, getSCUrl } from './sites';
import { discoverPropertyIds } from './ga4';

const LOOKBACK_DAYS = 90;
const COLLECT_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

function dateStr(d: Date): string {
  return d.toISOString().split('T')[0];
}

function daysBack(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

function getGenesis(siteId: string, source: string): string | null {
  const db = getDb();
  const row = db.prepare(
    'SELECT genesis_date FROM daily_genesis WHERE site_id = ? AND source = ?',
  ).get(siteId, source) as { genesis_date: string } | undefined;
  return row?.genesis_date ?? null;
}

function setGenesis(siteId: string, source: string, date: string): void {
  const db = getDb();
  db.prepare(
    'INSERT OR REPLACE INTO daily_genesis (site_id, source, genesis_date) VALUES (?, ?, ?)',
  ).run(siteId, source, date);
  console.log(`[collect-daily] Set genesis for ${source}/${siteId}: ${date}`);
}

function getMissingDates(table: string, siteId: string, source: string, startDate: string, endDate: string): string[] {
  const db = getDb();

  // Don't look before genesis date
  const genesis = getGenesis(siteId, source);
  const effectiveStart = genesis && genesis > startDate ? genesis : startDate;

  // Find the latest date we already have — only fetch after that
  const latestRow = db.prepare(
    `SELECT MAX(date) as latest FROM ${table} WHERE site_id = ?`,
  ).get(siteId) as { latest: string | null } | undefined;
  const latest = latestRow?.latest;

  // If we have data, only look for dates after the latest collected date
  // (don't try to backfill old gaps)
  const fetchFrom = latest && latest >= effectiveStart ? latest : effectiveStart;

  const existing = db.prepare(
    `SELECT date FROM ${table} WHERE site_id = ? AND date >= ? AND date <= ?`,
  ).all(siteId, fetchFrom, endDate) as Array<{ date: string }>;
  const existingSet = new Set(existing.map(r => r.date));

  const missing: string[] = [];
  const cur = new Date(fetchFrom);
  const end = new Date(endDate);
  while (cur <= end) {
    const d = dateStr(cur);
    if (!existingSet.has(d)) missing.push(d);
    cur.setDate(cur.getDate() + 1);
  }
  return missing;
}

export function batchRanges(dates: string[]): Array<{ start: string; end: string }> {
  if (dates.length === 0) return [];
  const sorted = [...dates].sort();
  const ranges: Array<{ start: string; end: string }> = [];
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

export async function collectDaily(): Promise<void> {
  const startDate = dateStr(daysBack(LOOKBACK_DAYS));
  const scEndDate = dateStr(daysBack(2)); // SC data delayed ~2 days
  const ga4EndDate = dateStr(daysBack(1)); // GA4 has near-realtime data; yesterday is fully complete

  console.log(`[collect-daily] Collecting ${startDate} → SC:${scEndDate} GA4:${ga4EndDate}`);

  const sc = new searchconsole_v1.Searchconsole({ auth: getAuth() });

  // --- Search Console ---
  const sites = await getManagedSites();
  for (const site of sites) {
    if (!site.searchConsole) continue;
    const missing = getMissingDates('sc_daily', site.id, 'sc', startDate, scEndDate);
    if (missing.length === 0) {
      console.log(`[collect-daily] SC ${site.domain}: up to date`);
      continue;
    }

    const ranges = batchRanges(missing);
    let total = 0;

    for (const range of ranges) {
      try {
        const q = await sc.searchanalytics.query({
          siteUrl: getSCUrl(site),
          requestBody: {
            startDate: range.start,
            endDate: range.end,
            dimensions: ['date'],
            rowLimit: 500,
          },
        });

        const rows = (q.data.rows || []).map(row => ({
          date: row.keys?.[0] || '',
          clicks: row.clicks || 0,
          impressions: row.impressions || 0,
          ctr: row.ctr || 0,
          position: row.position || 0,
        }));

        if (rows.length === 0 && !getGenesis(site.id, 'sc')) {
          // No data for this entire range — set genesis to day after end so we skip it next time
          const nextDay = new Date(range.end);
          nextDay.setDate(nextDay.getDate() + 1);
          setGenesis(site.id, 'sc', dateStr(nextDay));
        } else if (rows.length > 0 && !getGenesis(site.id, 'sc')) {
          // First data found — set genesis to earliest date with data
          const earliest = rows.reduce((min, r) => r.date < min ? r.date : min, rows[0].date);
          setGenesis(site.id, 'sc', earliest);
        }

        upsertScDaily(site.id, rows);
        total += rows.length;
      } catch (e) {
        console.error(`[collect-daily] SC ${site.domain} error (${range.start} → ${range.end}):`, (e as Error).message?.slice(0, 120));
      }
    }

    console.log(`[collect-daily] SC ${site.domain}: ${total}/${missing.length} days collected`);
  }

  // --- GA4 ---
  const ga4Client = new BetaAnalyticsDataClient({ auth: getAuth() });

  // Resolve GA4 property IDs (auto-discovery for sites without explicit IDs)
  const enrichedSites = await discoverPropertyIds();

  for (const site of enrichedSites) {
    if (!site.ga4PropertyId) continue;

    const missing = getMissingDates('ga4_daily', site.id, 'ga4', startDate, ga4EndDate);
    if (missing.length === 0) {
      console.log(`[collect-daily] GA4 ${site.domain}: up to date`);
      continue;
    }

    const ranges = batchRanges(missing);
    let total = 0;

    for (const range of ranges) {
      try {
        const [report] = await ga4Client.runReport({
          property: `properties/${site.ga4PropertyId}`,
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

        const rows = (report.rows || []).map(row => {
          const dateRaw = row.dimensionValues?.[0]?.value || '';
          const date = dateRaw.length === 8
            ? `${dateRaw.slice(0, 4)}-${dateRaw.slice(4, 6)}-${dateRaw.slice(6, 8)}`
            : dateRaw;
          return {
            date,
            users: parseInt(row.metricValues?.[0]?.value || '0'),
            sessions: parseInt(row.metricValues?.[1]?.value || '0'),
            views: parseInt(row.metricValues?.[2]?.value || '0'),
            bounceRate: parseFloat(row.metricValues?.[3]?.value || '0'),
            avgDuration: parseFloat(row.metricValues?.[4]?.value || '0'),
          };
        });

        if (rows.length === 0 && !getGenesis(site.id, 'ga4')) {
          const nextDay = new Date(range.end);
          nextDay.setDate(nextDay.getDate() + 1);
          setGenesis(site.id, 'ga4', dateStr(nextDay));
        } else if (rows.length > 0 && !getGenesis(site.id, 'ga4')) {
          const earliest = rows.reduce((min, r) => r.date < min ? r.date : min, rows[0].date);
          setGenesis(site.id, 'ga4', earliest);
        }

        upsertGa4Daily(site.id, rows);
        total += rows.length;
      } catch (e) {
        console.error(`[collect-daily] GA4 ${site.domain} error (${range.start} → ${range.end}):`, (e as Error).message?.slice(0, 120));
      }
    }

    console.log(`[collect-daily] GA4 ${site.domain}: ${total}/${missing.length} days collected`);
  }

  console.log('[collect-daily] Done');
}

let _intervalId: ReturnType<typeof setInterval> | null = null;

export function startCollector(): void {
  if (_intervalId) return; // already running

  collectDaily().catch(e => console.error('[collect-daily] startup error:', e.message));

  _intervalId = setInterval(() => {
    collectDaily().catch(e => console.error('[collect-daily] interval error:', e.message));
  }, COLLECT_INTERVAL_MS);

  console.log(`[collect-daily] Scheduled every ${COLLECT_INTERVAL_MS / 60000}m`);
}
