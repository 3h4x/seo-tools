import { randomUUID } from 'node:crypto';
import { searchconsole_v1 } from '@googleapis/searchconsole';
import { BetaAnalyticsDataClient } from '@google-analytics/data';
import { getAuth } from './google-auth';
import { getDb } from './db';
import { discoverPropertyIds } from './ga4';
import { normalizeGa4PropertyId } from './ga4-property';
import { getSCUrl } from './sites';
import { runSiteAudit } from './audit';
import { normalizeSkipChecks } from './skip-checks';
import { processSnapshotAlerts } from './alerts';
import { dateOnlyDaysBack, todayDateOnly } from './date-only';

export interface SnapshotResult {
  date: string;
  sc: number;
  keywords: number;
  ga4: number;
  ttfb: number;
  errors: string[];
}

interface SnapshotRunRow {
  status: 'idle' | 'running';
  last_started_at: number | null;
  last_finished_at: number | null;
  last_success_at: number | null;
  last_failure_at: number | null;
  last_error: string | null;
}

type ScheduledSnapshotResult = 'started' | 'skipped-not-due' | 'skipped-running';

const GOOGLE_API_TIMEOUT_MS = 30_000;
const SNAPSHOT_JOB_KEY = 'daily';
const SNAPSHOT_INTERVAL_MS = 24 * 60 * 60 * 1000;
const SNAPSHOT_CHECK_INTERVAL_MS = 60 * 60 * 1000;
const SNAPSHOT_STALE_LOCK_MS = 6 * 60 * 60 * 1000;

let snapshotRunning = false;
let schedulerIntervalId: ReturnType<typeof setInterval> | null = null;

type SnapshotShutdownGlobal = typeof globalThis & {
  __seoToolsSnapshotStop?: () => void;
  __seoToolsSnapshotShutdownRegistered?: boolean;
};

const snapshotShutdownState = globalThis as SnapshotShutdownGlobal;

export class SnapshotAlreadyRunningError extends Error {
  constructor() {
    super('snapshot_in_progress');
    this.name = 'SnapshotAlreadyRunningError';
  }
}

export function isSnapshotRunning(): boolean {
  if (snapshotRunning) {
    return true;
  }
  return hasFreshLock(getSnapshotRunState());
}

export async function runSnapshot(): Promise<SnapshotResult> {
  if (snapshotRunning) {
    throw new SnapshotAlreadyRunningError();
  }
  const lockOwner = acquireSnapshotLock();
  snapshotRunning = true;
  try {
    const result = await doSnapshot();
    finishSnapshotRun({ lockOwner, success: true });
    return result;
  } catch (error) {
    finishSnapshotRun({ lockOwner, success: false, error });
    throw error;
  } finally {
    snapshotRunning = false;
  }
}

export function getSnapshotRunState(): SnapshotRunRow {
  const db = getDb();
  const row = db.prepare(
    `SELECT status, last_started_at, last_finished_at, last_success_at, last_failure_at, last_error
     FROM snapshot_runs WHERE job_key = ?`,
  ).get(SNAPSHOT_JOB_KEY) as SnapshotRunRow | undefined;

  return row ?? {
    status: 'idle',
    last_started_at: null,
    last_finished_at: null,
    last_success_at: null,
    last_failure_at: null,
    last_error: null,
  };
}

export async function runSnapshotIfDue(now: number = Date.now()): Promise<ScheduledSnapshotResult> {
  const state = getSnapshotRunState();
  if (snapshotRunning || hasFreshLock(state, now)) {
    return 'skipped-running';
  }
  if (!isSnapshotDue(state, now)) {
    return 'skipped-not-due';
  }

  await runSnapshot();
  return 'started';
}

export function startSnapshotScheduler(): void {
  if (schedulerIntervalId) {
    return;
  }

  runSnapshotIfDue().catch((error) => {
    console.error('[snapshot] startup check failed:', (error as Error).message);
  });

  schedulerIntervalId = setInterval(() => {
    runSnapshotIfDue().catch((error) => {
      console.error('[snapshot] scheduled run failed:', (error as Error).message);
    });
  }, SNAPSHOT_CHECK_INTERVAL_MS);
  registerSnapshotSchedulerShutdown();

  console.log(
    `[snapshot] Scheduled due-check every ${SNAPSHOT_CHECK_INTERVAL_MS / 3_600_000}h (window ${SNAPSHOT_INTERVAL_MS / 3_600_000}h)`,
  );
}

export function stopSnapshotScheduler(): void {
  if (!schedulerIntervalId) return;
  clearInterval(schedulerIntervalId);
  schedulerIntervalId = null;
}

function registerSnapshotSchedulerShutdown(): void {
  snapshotShutdownState.__seoToolsSnapshotStop = stopSnapshotScheduler;
  if (snapshotShutdownState.__seoToolsSnapshotShutdownRegistered) return;
  snapshotShutdownState.__seoToolsSnapshotShutdownRegistered = true;
  process.once('SIGTERM', () => snapshotShutdownState.__seoToolsSnapshotStop?.());
}

function isSnapshotDue(state: SnapshotRunRow, now: number): boolean {
  if (state.last_success_at === null) {
    return true;
  }
  return now - state.last_success_at >= SNAPSHOT_INTERVAL_MS;
}

function hasFreshLock(state: SnapshotRunRow, now: number = Date.now()): boolean {
  return state.status === 'running'
    && typeof state.last_started_at === 'number'
    && now - state.last_started_at < SNAPSHOT_STALE_LOCK_MS;
}

function acquireSnapshotLock(now: number = Date.now()): string {
  const db = getDb();
  const lockOwner = randomUUID();
  const upsertRunning = db.prepare(
    `INSERT INTO snapshot_runs (
       job_key, status, last_started_at, last_finished_at, last_error, lock_owner
     )
     VALUES (?, 'running', ?, NULL, NULL, ?)
     ON CONFLICT(job_key) DO UPDATE SET
       status = 'running',
       last_started_at = excluded.last_started_at,
       last_finished_at = NULL,
       last_error = NULL,
       lock_owner = excluded.lock_owner
     WHERE snapshot_runs.status != 'running'
       OR snapshot_runs.last_started_at IS NULL
       OR ? - snapshot_runs.last_started_at >= ?`,
  );

  const result = upsertRunning.run(SNAPSHOT_JOB_KEY, now, lockOwner, now, SNAPSHOT_STALE_LOCK_MS);
  if (result.changes === 0) {
    throw new SnapshotAlreadyRunningError();
  }
  return lockOwner;
}

function finishSnapshotRun({
  lockOwner,
  success,
  error,
  now = Date.now(),
}: {
  lockOwner: string;
  success: boolean;
  error?: unknown;
  now?: number;
}): void {
  const db = getDb();
  if (success) {
    db.prepare(
      `UPDATE snapshot_runs
       SET status = 'idle',
         last_finished_at = ?,
         last_success_at = ?,
         last_error = NULL,
         lock_owner = NULL
       WHERE job_key = ? AND lock_owner = ?`,
    ).run(now, now, SNAPSHOT_JOB_KEY, lockOwner);
    return;
  }

  db.prepare(
    `UPDATE snapshot_runs
     SET status = 'idle',
       last_finished_at = ?,
       last_failure_at = ?,
       last_error = ?,
       lock_owner = NULL
     WHERE job_key = ? AND lock_owner = ?`,
  ).run(
    now,
    now,
    error instanceof Error ? error.message : String(error),
    SNAPSHOT_JOB_KEY,
    lockOwner,
  );
}

async function doSnapshot(): Promise<SnapshotResult> {
  const today = todayDateOnly();
  const errors: string[] = [];

  const sites = await discoverPropertyIds();
  if (sites.length === 0) {
    return { date: today, sc: 0, keywords: 0, ga4: 0, ttfb: 0, errors: ['No sites configured'] };
  }

  const sc = new searchconsole_v1.Searchconsole({ auth: getAuth() });
  const db = getDb();

  const endDate = dateOnlyDaysBack(1);
  const startDate = dateOnlyDaysBack(7);

  const scDelete = db.prepare('DELETE FROM sc_snapshots WHERE site_id = ? AND date = ?');
  const scInsert = db.prepare(
    'INSERT INTO sc_snapshots (site_id, date, page_url, clicks, impressions, ctr, position) VALUES (?, ?, ?, ?, ?, ?, ?)',
  );
  let scCount = 0;
  for (const site of sites) {
    if (site.searchConsole === false) continue;
    try {
      const q = await sc.searchanalytics.query({
        siteUrl: getSCUrl(site),
        requestBody: { startDate, endDate, dimensions: ['page'], rowLimit: 100 },
      }, { timeout: GOOGLE_API_TIMEOUT_MS });
      const rows = q.data.rows || [];
      db.transaction(() => {
        scDelete.run(site.id, today);
        for (const row of rows) {
          scInsert.run(site.id, today, row.keys?.[0] || '', row.clicks || 0, row.impressions || 0, row.ctr || 0, row.position || 0);
        }
      })();
      scCount += rows.length;
    } catch (e) {
      errors.push(`SC pages ${site.id}: ${String(e).slice(0, 80)}`);
    }
  }

  const kwInsert = db.prepare(
    `INSERT INTO keyword_history (site_id, date, query, clicks, impressions, ctr, position)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(site_id, date, query) DO UPDATE SET
       clicks = excluded.clicks, impressions = excluded.impressions,
       ctr = excluded.ctr, position = excluded.position`,
  );
  let kwCount = 0;
  for (const site of sites) {
    if (site.searchConsole === false) continue;
    try {
      const q = await sc.searchanalytics.query({
        siteUrl: getSCUrl(site),
        requestBody: { startDate, endDate, dimensions: ['query'], rowLimit: 50 },
      }, { timeout: GOOGLE_API_TIMEOUT_MS });
      const rows = q.data.rows || [];
      db.transaction(() => {
        for (const row of rows) {
          kwInsert.run(site.id, today, row.keys?.[0] || '', row.clicks || 0, row.impressions || 0, row.ctr || 0, row.position || 0);
        }
      })();
      kwCount += rows.length;
    } catch (e) {
      errors.push(`SC keywords ${site.id}: ${String(e).slice(0, 80)}`);
    }
  }

  const ga4Client = new BetaAnalyticsDataClient({ auth: getAuth() });
  const ga4Delete = db.prepare('DELETE FROM ga4_snapshots WHERE site_id = ? AND date = ?');
  const ga4Insert = db.prepare(
    'INSERT INTO ga4_snapshots (site_id, date, users, sessions, views, bounce_rate, avg_duration) VALUES (?, ?, ?, ?, ?, ?, ?)',
  );
  const ga4Upsert = db.transaction((siteId: string, date: string, users: number, sessions: number, views: number, bounce: number, duration: number) => {
    ga4Delete.run(siteId, date);
    ga4Insert.run(siteId, date, users, sessions, views, bounce, duration);
  });
  let ga4Count = 0;
  for (const site of sites) {
    if (!site.ga4PropertyId) continue;
    try {
      const prop = normalizeGa4PropertyId(site.ga4PropertyId);
      if (!prop) continue;
      const [report] = await ga4Client.runReport({
        property: prop,
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
      ga4Count++;
    } catch (e) {
      errors.push(`GA4 ${site.id}: ${String(e).slice(0, 80)}`);
    }
  }

  const auditDelete = db.prepare('DELETE FROM audit_snapshots WHERE site_id = ? AND date = ?');
  const auditInsert = db.prepare(
    `INSERT INTO audit_snapshots (
      site_id, date, pass_count, warn_count, fail_count, checks_json, ttfb_ms,
      sitemap_urls, indexed_pages, coverage_pct
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  let ttfbCount = 0;
  for (const site of sites) {
    try {
      const audit = await runSiteAudit(site);
      const ttfbMs = audit.ttfb.ms;
      const skipChecks = normalizeSkipChecks(site.skipChecks);
      const shouldStoreIndexingCoverage = !skipChecks.includes('indexing');
      const { sitemapUrls, indexedPages, coveragePct } = shouldStoreIndexingCoverage
        ? audit.indexingCoverage
        : { sitemapUrls: null, indexedPages: null, coveragePct: null };
      db.transaction(() => {
        auditDelete.run(site.id, today);
        auditInsert.run(
          site.id,
          today,
          audit.score.pass,
          audit.score.warn,
          audit.score.fail,
          JSON.stringify(audit),
          ttfbMs ?? null,
          sitemapUrls ?? null,
          indexedPages ?? null,
          coveragePct ?? null,
        );
      })();
      if (typeof ttfbMs === 'number') {
        ttfbCount++;
      }
    } catch (e) {
      errors.push(`Audit ${site.id}: ${String(e).slice(0, 80)}`);
    }
  }

  const alertResult = await processSnapshotAlerts(today);
  errors.push(...alertResult.errors);

  return { date: today, sc: scCount, keywords: kwCount, ga4: ga4Count, ttfb: ttfbCount, errors };
}
