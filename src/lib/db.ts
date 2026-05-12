import path from 'node:path';
import fs from 'node:fs';
import { AnalyticsAdminServiceClient } from '@google-analytics/admin';
import { computeKeywordDeltas, type KeywordDelta } from './keyword-history';
import {
  GA4_DISCOVERY_CACHE_KEY,
  GA4_DISCOVERY_CACHE_SITE_ID,
  resolveSiteGa4PropertyId,
  type DiscoveredGa4Property,
} from './ga4-discovery';
import { getAuth } from './google-auth';
import { openDatabase } from './sqlite-driver.js';

const DB_PATH = path.join(process.cwd(), 'data', 'seo-tools.db');

interface SqliteStatement<Result = unknown> {
  get(...params: unknown[]): Result;
  all(...params: unknown[]): Result[];
  run(...params: unknown[]): unknown;
}

export interface SqliteDatabase {
  pragma(value: string): void;
  exec(sql: string): void;
  prepare<Result = unknown>(sql: string): SqliteStatement<Result>;
  transaction<TArgs extends unknown[], TResult>(fn: (...args: TArgs) => TResult): (...args: TArgs) => TResult;
  close?(): void;
}

let _db: SqliteDatabase | null = null;

export function getDb(): SqliteDatabase {
  if (!_db) {
    const dir = path.dirname(DB_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    _db = openDatabase(DB_PATH) as SqliteDatabase;
    _db.pragma('journal_mode = WAL');
    _db.pragma('foreign_keys = ON');
    initSchema(_db);
  }
  return _db;
}

function initSchema(db: SqliteDatabase): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS sc_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      site_id TEXT NOT NULL,
      date TEXT NOT NULL,
      page_url TEXT NOT NULL,
      clicks INTEGER NOT NULL DEFAULT 0,
      impressions INTEGER NOT NULL DEFAULT 0,
      ctr REAL NOT NULL DEFAULT 0,
      position REAL NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS ga4_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      site_id TEXT NOT NULL,
      date TEXT NOT NULL,
      users INTEGER NOT NULL DEFAULT 0,
      sessions INTEGER NOT NULL DEFAULT 0,
      views INTEGER NOT NULL DEFAULT 0,
      bounce_rate REAL NOT NULL DEFAULT 0,
      avg_duration REAL NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS audit_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      site_id TEXT NOT NULL,
      date TEXT NOT NULL,
      pass_count INTEGER NOT NULL DEFAULT 0,
      warn_count INTEGER NOT NULL DEFAULT 0,
      fail_count INTEGER NOT NULL DEFAULT 0,
      checks_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_sc_site_date ON sc_snapshots(site_id, date);
    CREATE INDEX IF NOT EXISTS idx_ga4_site_date ON ga4_snapshots(site_id, date);
    CREATE INDEX IF NOT EXISTS idx_audit_site_date ON audit_snapshots(site_id, date);

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

    CREATE TABLE IF NOT EXISTS api_cache (
      cache_key TEXT NOT NULL,
      site_id TEXT NOT NULL,
      data_json TEXT NOT NULL,
      fetched_at INTEGER NOT NULL,
      PRIMARY KEY (cache_key, site_id)
    );

    CREATE TABLE IF NOT EXISTS daily_genesis (
      site_id TEXT NOT NULL,
      source TEXT NOT NULL,
      genesis_date TEXT NOT NULL,
      PRIMARY KEY (site_id, source)
    );

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

    CREATE TABLE IF NOT EXISTS config (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sites (
      id              TEXT PRIMARY KEY,
      name            TEXT NOT NULL,
      domain          TEXT NOT NULL,
      sc_url          TEXT,
      ga4_property_id TEXT,
      search_console  INTEGER NOT NULL DEFAULT 1,
      color           TEXT,
      test_pages      TEXT NOT NULL DEFAULT '[]',
      skip_checks     TEXT NOT NULL DEFAULT '[]',
      sort_order      INTEGER NOT NULL DEFAULT 0
    );

    -- keyword_history is also created in scripts/seo.mjs (standalone CLI); keep schemas in sync
    CREATE TABLE IF NOT EXISTS keyword_history (
      site_id     TEXT NOT NULL,
      date        TEXT NOT NULL,
      query       TEXT NOT NULL,
      clicks      INTEGER NOT NULL DEFAULT 0,
      impressions INTEGER NOT NULL DEFAULT 0,
      ctr         REAL NOT NULL DEFAULT 0,
      position    REAL NOT NULL DEFAULT 0,
      PRIMARY KEY (site_id, date, query)
    );

    CREATE INDEX IF NOT EXISTS idx_kw_history_site_query ON keyword_history(site_id, query, date);
  `);
  // Migrations for existing DBs
  try { db.exec(`ALTER TABLE sites ADD COLUMN color TEXT`); } catch { /* already exists */ }
}

// --- Cache helpers ---

const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes
export const CACHE_TTL_WEEK = 7 * 24 * 60 * 60 * 1000; // 1 week

export function getCached<T>(key: string, siteId: string, ttlMs: number = CACHE_TTL_MS): T | null {
  try {
    const db = getDb();
    const row = db.prepare(
      'SELECT data_json, fetched_at FROM api_cache WHERE cache_key = ? AND site_id = ?',
    ).get(key, siteId) as { data_json: string; fetched_at: number } | undefined;

    if (!row) return null;
    if (Date.now() - row.fetched_at > ttlMs) return null;

    return JSON.parse(row.data_json) as T;
  } catch {
    return null;
  }
}

export function setCache(key: string, siteId: string, data: unknown): void {
  try {
    const db = getDb();
    db.prepare(
      'INSERT OR REPLACE INTO api_cache (cache_key, site_id, data_json, fetched_at) VALUES (?, ?, ?, ?)',
    ).run(key, siteId, JSON.stringify(data), Date.now());
  } catch {
    // silently fail — cache is best-effort
  }
}

export type ProviderResult<T> = { data: T | null; error: boolean };

export async function withCache<T>(
  key: string,
  id: string,
  fetcher: () => Promise<T | null>,
  ttlMs?: number,
): Promise<T | null> {
  const cached = getCached<T>(key, id, ttlMs);
  if (cached !== null) return cached;
  const result = await fetcher();
  if (result != null) setCache(key, id, result);
  return result;
}

export function clearCache(keyPattern?: string): void {
  try {
    const db = getDb();
    if (keyPattern) {
      db.prepare('DELETE FROM api_cache WHERE cache_key LIKE ?').run(`${keyPattern}%`);
    } else {
      db.prepare('DELETE FROM api_cache').run();
    }
  } catch {
    // silently fail
  }
}

export function clearCacheEntry(cacheKey: string, siteId: string): void {
  try {
    const db = getDb();
    db.prepare('DELETE FROM api_cache WHERE cache_key = ? AND site_id = ?').run(cacheKey, siteId);
  } catch {
    // silently fail
  }
}

export function clearCacheEntriesByPrefix(cacheKeyPrefix: string, siteId: string): void {
  try {
    const db = getDb();
    db.prepare('DELETE FROM api_cache WHERE cache_key LIKE ? AND site_id = ?').run(`${cacheKeyPrefix}%`, siteId);
  } catch {
    // silently fail
  }
}

export function clearSitemapSyncState(siteId: string): void {
  try {
    const db = getDb();
    db.prepare('DELETE FROM sitemap_state WHERE site_id = ?').run(siteId);
  } catch {
    // silently fail
  }
}

// --- Query helpers ---

interface ScTrendPoint {
  date: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

interface Ga4TrendPoint {
  date: string;
  users: number;
  sessions: number;
  views: number;
  bounceRate: number;
  avgDuration: number;
}

interface AuditTrendPoint {
  date: string;
  pass: number;
  warn: number;
  fail: number;
}

export function getScTrends(siteId: string, limit: number = 90): ScTrendPoint[] {
  const db = getDb();
  const rows = db.prepare(`
    SELECT date, SUM(clicks) as clicks, SUM(impressions) as impressions,
           AVG(ctr) as ctr, AVG(position) as position
    FROM sc_snapshots WHERE site_id = ?
    GROUP BY date ORDER BY date DESC LIMIT ?
  `).all(siteId, limit) as Array<{ date: string; clicks: number; impressions: number; ctr: number; position: number }>;

  return rows.reverse().map(r => ({
    date: r.date,
    clicks: r.clicks,
    impressions: r.impressions,
    ctr: r.ctr,
    position: r.position,
  }));
}

export function getGa4Trends(siteId: string, limit: number = 90): Ga4TrendPoint[] {
  const db = getDb();
  const rows = db.prepare(`
    SELECT date, users, sessions, views, bounce_rate, avg_duration
    FROM ga4_snapshots WHERE site_id = ?
    ORDER BY date DESC LIMIT ?
  `).all(siteId, limit) as Array<{ date: string; users: number; sessions: number; views: number; bounce_rate: number; avg_duration: number }>;

  return rows.reverse().map(r => ({
    date: r.date,
    users: r.users,
    sessions: r.sessions,
    views: r.views,
    bounceRate: r.bounce_rate,
    avgDuration: r.avg_duration,
  }));
}

export function getAuditTrends(siteId: string, limit: number = 90): AuditTrendPoint[] {
  const db = getDb();
  const rows = db.prepare(`
    SELECT date, pass_count, warn_count, fail_count
    FROM audit_snapshots WHERE site_id = ?
    ORDER BY date DESC LIMIT ?
  `).all(siteId, limit) as Array<{ date: string; pass_count: number; warn_count: number; fail_count: number }>;

  return rows.reverse().map(r => ({
    date: r.date,
    pass: r.pass_count,
    warn: r.warn_count,
    fail: r.fail_count,
  }));
}

// --- Daily SC/GA4 helpers ---

interface DailyPoint {
  date: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

interface Ga4DailyPoint {
  date: string;
  users: number;
  sessions: number;
  views: number;
  bounceRate: number;
  avgDuration: number;
}

export function upsertScDaily(
  siteId: string,
  rows: Array<{ date: string; clicks: number; impressions: number; ctr: number; position: number }>,
): void {
  const db = getDb();
  const stmt = db.prepare(
    `INSERT INTO sc_daily (site_id, date, clicks, impressions, ctr, position)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(site_id, date) DO UPDATE SET
       clicks = excluded.clicks, impressions = excluded.impressions,
       ctr = excluded.ctr, position = excluded.position,
       created_at = datetime('now')`,
  );
  const insertMany = db.transaction((items: typeof rows) => {
    for (const r of items) {
      stmt.run(siteId, r.date, r.clicks, r.impressions, r.ctr, r.position);
    }
  });
  insertMany(rows);
}

export function upsertGa4Daily(
  siteId: string,
  rows: Array<{ date: string; users: number; sessions: number; views: number; bounceRate: number; avgDuration: number }>,
): void {
  const db = getDb();
  const stmt = db.prepare(
    `INSERT INTO ga4_daily (site_id, date, users, sessions, views, bounce_rate, avg_duration)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(site_id, date) DO UPDATE SET
       users = excluded.users, sessions = excluded.sessions, views = excluded.views,
       bounce_rate = excluded.bounce_rate, avg_duration = excluded.avg_duration,
       created_at = datetime('now')`,
  );
  const insertMany = db.transaction((items: typeof rows) => {
    for (const r of items) {
      stmt.run(siteId, r.date, r.users, r.sessions, r.views, r.bounceRate, r.avgDuration);
    }
  });
  insertMany(rows);
}

export function getScDaily(siteId: string, limit: number = 90): DailyPoint[] {
  const db = getDb();
  const rows = db.prepare(
    'SELECT date, clicks, impressions, ctr, position FROM sc_daily WHERE site_id = ? ORDER BY date DESC LIMIT ?',
  ).all(siteId, limit) as DailyPoint[];
  return rows.reverse();
}

export function getGa4Daily(siteId: string, limit: number = 90): Ga4DailyPoint[] {
  const db = getDb();
  const rows = db.prepare(
    'SELECT date, users, sessions, views, bounce_rate as bounceRate, avg_duration as avgDuration FROM ga4_daily WHERE site_id = ? ORDER BY date DESC LIMIT ?',
  ).all(siteId, limit) as Ga4DailyPoint[];
  return rows.reverse();
}

export function getSnapshotCount(): number {
  const db = getDb();
  const row = db.prepare('SELECT COUNT(DISTINCT date) as count FROM sc_snapshots').get() as { count: number };
  return row.count;
}

export type OperationalStatusState = 'fresh' | 'stale' | 'never';

export interface OperationalStatus {
  key: 'sc-daily' | 'ga4-daily' | 'sitemap-sync' | 'snapshots';
  label: string;
  state: OperationalStatusState;
  timestamp: number | null;
  reason: string;
  details?: string;
}

interface SiteIdRow {
  id: string;
}

interface PerSiteDateFreshnessRow {
  site_id: string;
  latest_date: string | null;
  latest_created_at: string | null;
}

interface SitemapStateRow {
  site_id: string;
  last_checked_at: number;
  last_submitted_at: number | null;
}

interface SourceOperationalSummary {
  label: string;
  missingSites: string[];
  staleSites: string[];
  latestDate: string | null;
  latestTimestamp: number | null;
  hasData: boolean;
}

interface ResolvedGa4SiteScope {
  siteIds: string[];
  discoveryState: 'resolved' | 'configured-only';
  excludedSiteIds: string[];
}

const HOUR_MS = 60 * 60 * 1000;
const DAILY_STATUS_MAX_AGE_MS = 26 * HOUR_MS;
const SITEMAP_STATUS_MAX_AGE_MS = 8 * HOUR_MS;
const SNAPSHOT_STATUS_MAX_AGE_MS = 36 * HOUR_MS;

function localDateStr(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function localDaysBack(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return localDateStr(date);
}

function parseSqliteTimestamp(value: string | null): number | null {
  if (!value) return null;
  const ms = Date.parse(value.replace(' ', 'T') + 'Z');
  return Number.isNaN(ms) ? null : ms;
}

function ageHours(timestamp: number | null): number | null {
  if (timestamp === null) return null;
  return Math.floor((Date.now() - timestamp) / HOUR_MS);
}

function buildNeverStatus(
  key: OperationalStatus['key'],
  label: string,
  reason: string,
): OperationalStatus {
  return { key, label, state: 'never', timestamp: null, reason };
}

function pluralizeSites(count: number): string {
  return `${count} site${count === 1 ? '' : 's'}`;
}

function summarizeSites(siteIds: string[]): string {
  if (siteIds.length === 0) return '';
  if (siteIds.length <= 3) return siteIds.join(', ');
  return `${siteIds.slice(0, 3).join(', ')} +${siteIds.length - 3} more`;
}

function getManagedSiteIds(filter: 'all' | 'search-console' | 'ga4'): string[] {
  const db = getDb();
  let sql = 'SELECT id FROM sites';
  if (filter === 'search-console') {
    sql += ' WHERE search_console = 1';
  } else if (filter === 'ga4') {
    sql += " WHERE ga4_property_id IS NOT NULL AND ga4_property_id != ''";
  }
  sql += ' ORDER BY sort_order ASC, id ASC';
  return (db.prepare(sql).all() as SiteIdRow[]).map((row) => row.id);
}

async function fetchDiscoveredGa4Properties(): Promise<DiscoveredGa4Property[] | null> {
  try {
    const client = new AnalyticsAdminServiceClient({ auth: getAuth() });
    const [summaries] = await client.listAccountSummaries({});
    return summaries.flatMap((account) => (
      (account.propertySummaries ?? []).flatMap((property) => {
        const displayName = property.displayName?.trim();
        const propertyId = property.property?.split('/')[1]?.trim();
        if (!displayName || !propertyId) return [];
        return [{ displayName, propertyId }];
      })
    ));
  } catch (error) {
    console.error('[getOperationalStatuses] failed to discover GA4 properties:', error);
    return null;
  }
}

async function getResolvedGa4SiteScope(): Promise<ResolvedGa4SiteScope> {
  const sites = dbGetSites();
  const configuredSiteIds = sites
    .filter((site) => typeof site.ga4PropertyId === 'string' && site.ga4PropertyId.trim() !== '')
    .map((site) => site.id);
  const properties = await withCache<DiscoveredGa4Property[]>(
    GA4_DISCOVERY_CACHE_KEY,
    GA4_DISCOVERY_CACHE_SITE_ID,
    fetchDiscoveredGa4Properties,
  );
  if (!properties) {
    return {
      siteIds: configuredSiteIds,
      discoveryState: 'configured-only',
      excludedSiteIds: sites
        .filter((site) => !(typeof site.ga4PropertyId === 'string' && site.ga4PropertyId.trim() !== ''))
        .map((site) => site.id),
    };
  }

  return {
    siteIds: sites.flatMap((site) => (
      resolveSiteGa4PropertyId(site, properties) ? [site.id] : []
    )),
    discoveryState: 'resolved',
    excludedSiteIds: [],
  };
}

function getPerSiteDateFreshness(
  table: 'sc_daily' | 'ga4_daily' | 'sc_snapshots' | 'ga4_snapshots',
): Map<string, PerSiteDateFreshnessRow> {
  const db = getDb();
  const rows = db.prepare(
    `SELECT site_id, MAX(date) as latest_date, MAX(created_at) as latest_created_at
     FROM ${table}
     GROUP BY site_id`,
  ).all() as PerSiteDateFreshnessRow[];
  return new Map(rows.map((row) => [row.site_id, row]));
}

function getLatestTimestamp(timestamps: Array<number | null>): number | null {
  return timestamps.reduce<number | null>((max, timestamp) => {
    if (timestamp === null) return max;
    if (max === null || timestamp > max) return timestamp;
    return max;
  }, null);
}

function getLatestDate(dates: Array<string | null>): string | null {
  return dates.reduce<string | null>((max, date) => {
    if (!date) return max;
    if (max === null || date > max) return date;
    return max;
  }, null);
}

function collectCoverageDetails(missingSites: string[], staleSites: string[]): string[] {
  const details: string[] = [];
  if (missingSites.length > 0) {
    details.push(`Missing: ${summarizeSites(missingSites)}`);
  }
  if (staleSites.length > 0) {
    details.push(`Stale: ${summarizeSites(staleSites)}`);
  }
  return details;
}

function getGa4DiscoveryFallbackDetail(scope: ResolvedGa4SiteScope): string | null {
  if (scope.discoveryState !== 'configured-only' || scope.excludedSiteIds.length === 0) {
    return null;
  }

  return `GA4 discovery unavailable; excluding sites without saved GA4 property IDs: ${summarizeSites(scope.excludedSiteIds)}`;
}

function appendStatusDetail(details: string | undefined, extraDetail: string | null): string | undefined {
  if (!extraDetail) return details;
  if (!details) return extraDetail;
  return `${details} · ${extraDetail}`;
}

function getDailyCollectorStatus(
  table: 'sc_daily' | 'ga4_daily',
  key: OperationalStatus['key'],
  label: string,
  expectedLagDays: number,
  managedSiteFilter: 'search-console' | 'ga4',
): OperationalStatus {
  const expectedSiteIds = getManagedSiteIds(managedSiteFilter);
  if (expectedSiteIds.length === 0) {
    return buildNeverStatus(key, label, `No configured ${label.toLowerCase()} sites yet`);
  }

  const latestExpectedDate = localDaysBack(expectedLagDays);
  const perSiteRows = getPerSiteDateFreshness(table);
  const missingSites: string[] = [];
  const staleSites: string[] = [];
  const populatedRows: PerSiteDateFreshnessRow[] = [];

  for (const siteId of expectedSiteIds) {
    const row = perSiteRows.get(siteId);
    if (!row || !row.latest_date) {
      missingSites.push(siteId);
      continue;
    }

    populatedRows.push(row);
    const timestamp = parseSqliteTimestamp(row.latest_created_at);
    const dateFresh = row.latest_date >= latestExpectedDate;
    const writeFresh = timestamp !== null && Date.now() - timestamp <= DAILY_STATUS_MAX_AGE_MS;
    if (!dateFresh || !writeFresh) {
      staleSites.push(siteId);
    }
  }

  if (populatedRows.length === 0) {
    return buildNeverStatus(
      key,
      label,
      `No daily rows collected yet for ${pluralizeSites(expectedSiteIds.length)}`,
    );
  }

  const latestDate = getLatestDate(populatedRows.map((row) => row.latest_date));
  const latestTimestamp = getLatestTimestamp(
    populatedRows.map((row) => parseSqliteTimestamp(row.latest_created_at)),
  );

  if (missingSites.length === 0 && staleSites.length === 0) {
    return {
      key,
      label,
      state: 'fresh',
      timestamp: latestTimestamp,
      reason: `Collected ${pluralizeSites(expectedSiteIds.length)} through ${latestDate}`,
      details: 'Collector writes are current',
    };
  }

  const detailParts = collectCoverageDetails(missingSites, staleSites);
  return {
    key,
    label,
    state: 'stale',
    timestamp: latestTimestamp,
    reason: `Expected ${pluralizeSites(expectedSiteIds.length)} through at least ${latestExpectedDate}`,
    details: detailParts.join(' · '),
  };
}

export function getScDailyOperationalStatus(): OperationalStatus {
  return getDailyCollectorStatus('sc_daily', 'sc-daily', 'Daily Search Console', 2, 'search-console');
}

export async function getGa4DailyOperationalStatus(): Promise<OperationalStatus> {
  const scope = await getResolvedGa4SiteScope();
  const expectedSiteIds = scope.siteIds;
  const fallbackDetail = getGa4DiscoveryFallbackDetail(scope);
  if (expectedSiteIds.length === 0) {
    return {
      ...buildNeverStatus('ga4-daily', 'Daily GA4', 'No GA4 sites could be resolved for status checks'),
      details: fallbackDetail ?? undefined,
    };
  }

  const latestExpectedDate = localDaysBack(1);
  const perSiteRows = getPerSiteDateFreshness('ga4_daily');
  const missingSites: string[] = [];
  const staleSites: string[] = [];
  const populatedRows: PerSiteDateFreshnessRow[] = [];

  for (const siteId of expectedSiteIds) {
    const row = perSiteRows.get(siteId);
    if (!row || !row.latest_date) {
      missingSites.push(siteId);
      continue;
    }

    populatedRows.push(row);
    const timestamp = parseSqliteTimestamp(row.latest_created_at);
    const dateFresh = row.latest_date >= latestExpectedDate;
    const writeFresh = timestamp !== null && Date.now() - timestamp <= DAILY_STATUS_MAX_AGE_MS;
    if (!dateFresh || !writeFresh) {
      staleSites.push(siteId);
    }
  }

  if (populatedRows.length === 0) {
    return {
      ...buildNeverStatus(
        'ga4-daily',
        'Daily GA4',
        `No daily rows collected yet for ${pluralizeSites(expectedSiteIds.length)}`,
      ),
      details: fallbackDetail ?? undefined,
    };
  }

  const latestDate = getLatestDate(populatedRows.map((row) => row.latest_date));
  const latestTimestamp = getLatestTimestamp(
    populatedRows.map((row) => parseSqliteTimestamp(row.latest_created_at)),
  );

  if (missingSites.length === 0 && staleSites.length === 0) {
    return {
      key: 'ga4-daily',
      label: 'Daily GA4',
      state: 'fresh',
      timestamp: latestTimestamp,
      reason: `Collected ${pluralizeSites(expectedSiteIds.length)} through ${latestDate}`,
      details: appendStatusDetail('Collector writes are current', fallbackDetail),
    };
  }

  const detailParts = collectCoverageDetails(missingSites, staleSites);
  return {
    key: 'ga4-daily',
    label: 'Daily GA4',
    state: 'stale',
    timestamp: latestTimestamp,
    reason: `Expected ${pluralizeSites(expectedSiteIds.length)} through at least ${latestExpectedDate}`,
    details: appendStatusDetail(detailParts.join(' · '), fallbackDetail),
  };
}

export function getSitemapSyncOperationalStatus(): OperationalStatus {
  const db = getDb();
  const expectedSiteIds = getManagedSiteIds('all');
  if (expectedSiteIds.length === 0) {
    return buildNeverStatus('sitemap-sync', 'Sitemap Sync', 'No managed sites configured yet');
  }

  const staleCutoff = Date.now() - SITEMAP_STATUS_MAX_AGE_MS;
  const rows = db.prepare(
    'SELECT site_id, last_checked_at, last_submitted_at FROM sitemap_state',
  ).all() as SitemapStateRow[];
  const rowMap = new Map(rows.map((row) => [row.site_id, row]));
  const missingSites: string[] = [];
  const staleSites: string[] = [];
  const presentRows: SitemapStateRow[] = [];

  for (const siteId of expectedSiteIds) {
    const row = rowMap.get(siteId);
    if (!row || row.last_checked_at === 0) {
      missingSites.push(siteId);
      continue;
    }

    presentRows.push(row);
    if (row.last_checked_at < staleCutoff) {
      staleSites.push(siteId);
    }
  }

  if (presentRows.length === 0) {
    return buildNeverStatus(
      'sitemap-sync',
      'Sitemap Sync',
      `No sitemap sync state recorded yet for ${pluralizeSites(expectedSiteIds.length)}`,
    );
  }

  const latestCheckedAt = getLatestTimestamp(presentRows.map((row) => row.last_checked_at));
  const latestSubmittedAt = getLatestTimestamp(presentRows.map((row) => row.last_submitted_at));
  const detailParts = collectCoverageDetails(missingSites, staleSites);
  detailParts.unshift(
    latestSubmittedAt === null
      ? 'No sitemap submissions recorded yet'
      : `Last submit ${ageHours(latestSubmittedAt)}h ago`,
  );

  if (missingSites.length === 0 && staleSites.length === 0) {
    return {
      key: 'sitemap-sync',
      label: 'Sitemap Sync',
      state: 'fresh',
      timestamp: latestCheckedAt,
      reason: `Checked all ${pluralizeSites(expectedSiteIds.length)} within 8h`,
      details: detailParts[0],
    };
  }

  return {
    key: 'sitemap-sync',
    label: 'Sitemap Sync',
    state: 'stale',
    timestamp: latestCheckedAt,
    reason: `${missingSites.length + staleSites.length}/${expectedSiteIds.length} sites missing or overdue`,
    details: detailParts.join(' · '),
  };
}

export async function getSnapshotOperationalStatus(): Promise<OperationalStatus> {
  const expectedDate = localDaysBack(1);
  const ga4Scope = await getResolvedGa4SiteScope();
  const fallbackDetail = getGa4DiscoveryFallbackDetail(ga4Scope);
  const sources: Array<{
    label: string;
    expectedSiteIds: string[];
    rows: Map<string, PerSiteDateFreshnessRow>;
  }> = [
    {
      label: 'SC',
      expectedSiteIds: getManagedSiteIds('search-console'),
      rows: getPerSiteDateFreshness('sc_snapshots'),
    },
    {
      label: 'GA4',
      expectedSiteIds: ga4Scope.siteIds,
      rows: getPerSiteDateFreshness('ga4_snapshots'),
    },
  ].filter((source) => source.expectedSiteIds.length > 0);

  if (sources.length === 0) {
    return {
      ...buildNeverStatus('snapshots', 'Snapshots', 'No managed snapshot sources configured yet'),
      details: fallbackDetail ?? undefined,
    };
  }

  const summaries: SourceOperationalSummary[] = sources.map((source) => {
    const missingSites: string[] = [];
    const staleSites: string[] = [];
    const presentRows: PerSiteDateFreshnessRow[] = [];

    for (const siteId of source.expectedSiteIds) {
      const row = source.rows.get(siteId);
      if (!row || !row.latest_date) {
        missingSites.push(siteId);
        continue;
      }

      presentRows.push(row);
      const timestamp = parseSqliteTimestamp(row.latest_created_at);
      if (
        row.latest_date < expectedDate
        || timestamp === null
        || Date.now() - timestamp > SNAPSHOT_STATUS_MAX_AGE_MS
      ) {
        staleSites.push(siteId);
      }
    }

    return {
      label: source.label,
      missingSites,
      staleSites,
      latestDate: getLatestDate(presentRows.map((row) => row.latest_date)),
      latestTimestamp: getLatestTimestamp(
        presentRows.map((row) => parseSqliteTimestamp(row.latest_created_at)),
      ),
      hasData: presentRows.length > 0,
    };
  });

  const populated = summaries.filter((summary) => summary.hasData);
  if (populated.length === 0) {
    return {
      ...buildNeverStatus('snapshots', 'Snapshots', 'No snapshot history recorded yet'),
      details: fallbackDetail ?? undefined,
    };
  }

  const latestTimestamp = getLatestTimestamp(populated.map((summary) => summary.latestTimestamp));
  const latestDate = getLatestDate(populated.map((summary) => summary.latestDate));
  const staleSources = summaries.filter(
    (summary) => summary.missingSites.length > 0 || summary.staleSites.length > 0,
  );

  if (staleSources.length === 0) {
    return {
      key: 'snapshots',
      label: 'Snapshots',
      state: 'fresh',
      timestamp: latestTimestamp,
      reason: `Latest snapshot date ${latestDate}`,
      details: appendStatusDetail('SC and GA4 snapshots are current', fallbackDetail),
    };
  }

  return {
    key: 'snapshots',
    label: 'Snapshots',
    state: 'stale',
    timestamp: latestTimestamp,
    reason: `Latest snapshot date ${latestDate}`,
    details: appendStatusDetail(
      `Stale or missing sources: ${staleSources.map((summary) => summary.label).join(', ')}`,
      fallbackDetail,
    ),
  };
}

export async function getOperationalStatuses(): Promise<OperationalStatus[]> {
  return [
    getScDailyOperationalStatus(),
    await getGa4DailyOperationalStatus(),
    getSitemapSyncOperationalStatus(),
    await getSnapshotOperationalStatus(),
  ];
}

// --- Config helpers ---

export function getConfig(key: string): string | null {
  try {
    const db = getDb();
    const row = db.prepare('SELECT value FROM config WHERE key = ?').get(key) as { value: string } | undefined;
    return row?.value ?? null;
  } catch (err) {
    console.error('[getConfig]', key, 'error:', err);
    return null;
  }
}

export function setConfig(key: string, value: string): void {
  const db = getDb();
  db.prepare('INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)').run(key, value);
}

export function deleteConfig(key: string): void {
  const db = getDb();
  db.prepare('DELETE FROM config WHERE key = ?').run(key);
}

// --- Sites helpers ---

interface SiteRow {
  id: string;
  name: string;
  domain: string;
  sc_url: string | null;
  ga4_property_id: string | null;
  search_console: number;
  color: string | null;
  test_pages: string;
  skip_checks: string;
  sort_order: number;
}

interface SiteRecord {
  id: string;
  name: string;
  domain: string;
  scUrl?: string;
  ga4PropertyId?: string;
  searchConsole?: boolean;
  color?: string;
  testPages: string[];
  skipChecks?: string[];
}

const SITE_OWNED_TABLES = [
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

function rowToSite(row: SiteRow): SiteRecord {
  return {
    id: row.id,
    name: row.name,
    domain: row.domain,
    scUrl: row.sc_url ?? undefined,
    ga4PropertyId: row.ga4_property_id ?? undefined,
    searchConsole: row.search_console === 1,
    color: row.color ?? undefined,
    testPages: JSON.parse(row.test_pages) as string[],
    skipChecks: JSON.parse(row.skip_checks) as string[],
  };
}

export function dbGetSites(): SiteRecord[] {
  const db = getDb();
  const rows = db.prepare(
    'SELECT * FROM sites ORDER BY sort_order ASC, id ASC',
  ).all() as SiteRow[];
  return rows.map(rowToSite);
}

export function dbUpsertSite(site: SiteRecord): void {
  const db = getDb();
  let order: number;
  const existing = db.prepare('SELECT sort_order FROM sites WHERE id = ?').get(site.id) as { sort_order: number } | undefined;
  if (existing !== undefined) {
    order = existing.sort_order;
  } else {
    const maxRow = db.prepare('SELECT MAX(sort_order) as m FROM sites').get() as { m: number | null };
    order = (maxRow.m ?? -1) + 1;
  }
  db.prepare(
    `INSERT OR REPLACE INTO sites
       (id, name, domain, sc_url, ga4_property_id, search_console, color, test_pages, skip_checks, sort_order)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    site.id,
    site.name,
    site.domain,
    site.scUrl ?? null,
    site.ga4PropertyId ?? null,
    site.searchConsole !== false ? 1 : 0,
    site.color ?? null,
    JSON.stringify(site.testPages),
    JSON.stringify(site.skipChecks ?? []),
    order,
  );
}

export function dbReorderSites(orderedIds: string[]): void {
  const db = getDb();
  const reorderSites = db.transaction((ids: string[]) => {
    const rows = db.prepare('SELECT id FROM sites ORDER BY sort_order ASC, id ASC').all() as Array<{ id: string }>;
    const currentIds = rows.map(row => row.id);
    const uniqueIds = new Set(ids);

    if (ids.length !== currentIds.length) {
      throw new Error('orderedIds must include every configured site exactly once');
    }
    if (uniqueIds.size !== ids.length) {
      throw new Error('orderedIds must not contain duplicates');
    }

    const currentIdSet = new Set(currentIds);
    const unknownId = ids.find(id => !currentIdSet.has(id));
    if (unknownId) {
      throw new Error(`unknown site id: ${unknownId}`);
    }

    const update = db.prepare('UPDATE sites SET sort_order = ? WHERE id = ?');
    ids.forEach((id, index) => {
      update.run(index, id);
    });
  });

  reorderSites(orderedIds);
}

export function dbDeleteSite(id: string): void {
  const db = getDb();
  const deleteSite = db.transaction((siteId: string) => {
    for (const table of SITE_OWNED_TABLES) {
      db.prepare(`DELETE FROM ${table} WHERE site_id = ?`).run(siteId);
    }
    db.prepare('DELETE FROM sites WHERE id = ?').run(siteId);
  });
  deleteSite(id);
}

// --- Keyword history ---

export interface KeywordHistoryPoint {
  date: string;
  query: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

function getKeywordHistory(siteId: string, days: number = 35): KeywordHistoryPoint[] {
  const db = getDb();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffDate = cutoff.toISOString().split('T')[0];
  return db.prepare(
    `SELECT date, query, clicks, impressions, ctr, position
     FROM keyword_history
     WHERE site_id = ? AND date >= ?
     ORDER BY date ASC, impressions DESC`,
  ).all(siteId, cutoffDate) as KeywordHistoryPoint[];
}

export function getTopKeywordsWithHistory(
  siteId: string,
  topN: number = 5,
  days: number = 30,
): { topQueries: string[]; history: KeywordHistoryPoint[] } {
  const db = getDb();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffDate = cutoff.toISOString().split('T')[0];

  const topRows = db.prepare(
    `SELECT query, SUM(impressions) as total
     FROM keyword_history
     WHERE site_id = ? AND date >= ?
     GROUP BY query
     ORDER BY total DESC
     LIMIT ?`,
  ).all(siteId, cutoffDate, topN) as Array<{ query: string; total: number }>;
  const topQueries = topRows.map((r) => r.query);

  if (topQueries.length === 0) return { topQueries: [], history: [] };

  const placeholders = topQueries.map(() => '?').join(',');
  const history = db.prepare(
    `SELECT date, query, clicks, impressions, ctr, position
     FROM keyword_history
     WHERE site_id = ? AND date >= ? AND query IN (${placeholders})
     ORDER BY date ASC`,
  ).all(siteId, cutoffDate, ...topQueries) as KeywordHistoryPoint[];

  return { topQueries, history };
}

export function getKeywordDeltas(siteId: string): KeywordDelta[] {
  const history = getKeywordHistory(siteId, 35);
  if (history.length === 0) return [];
  // Use the most recent snapshot date as "today" so stale DBs still compute deltas correctly.
  const latestDate = history.reduce((max, r) => (r.date > max ? r.date : max), history[0].date);
  return computeKeywordDeltas(
    history.map((r) => ({ date: r.date, query: r.query, position: r.position })),
    latestDate,
  );
}

export function getKeywordCount(): number {
  const db = getDb();
  const row = db.prepare('SELECT COUNT(DISTINCT query) as count FROM keyword_history').get() as { count: number };
  return row.count;
}
