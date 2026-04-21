import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';

const DB_PATH = path.join(process.cwd(), 'data', 'seo-tools.db');

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!_db) {
    const dir = path.dirname(DB_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    _db = new Database(DB_PATH);
    _db.pragma('journal_mode = WAL');
    _db.pragma('foreign_keys = ON');
    initSchema(_db);
  }
  return _db;
}

function initSchema(db: Database.Database): void {
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

// --- Insert helpers ---

export function insertScSnapshot(
  siteId: string,
  date: string,
  pages: Array<{ page: string; clicks: number; impressions: number; ctr: number; position: number }>,
): void {
  const db = getDb();
  const stmt = db.prepare(
    'INSERT INTO sc_snapshots (site_id, date, page_url, clicks, impressions, ctr, position) VALUES (?, ?, ?, ?, ?, ?, ?)',
  );
  const insertMany = db.transaction((rows: typeof pages) => {
    for (const row of rows) {
      stmt.run(siteId, date, row.page, row.clicks, row.impressions, row.ctr, row.position);
    }
  });
  insertMany(pages);
}

export function insertGa4Snapshot(
  siteId: string,
  date: string,
  metrics: { users: number; sessions: number; views: number; bounceRate: number; avgSessionDuration: number },
): void {
  const db = getDb();
  db.prepare(
    'INSERT INTO ga4_snapshots (site_id, date, users, sessions, views, bounce_rate, avg_duration) VALUES (?, ?, ?, ?, ?, ?, ?)',
  ).run(siteId, date, metrics.users, metrics.sessions, metrics.views, metrics.bounceRate, metrics.avgSessionDuration);
}

export function insertAuditSnapshot(
  siteId: string,
  date: string,
  score: { pass: number; warn: number; fail: number },
  checksJson: string,
): void {
  const db = getDb();
  db.prepare(
    'INSERT INTO audit_snapshots (site_id, date, pass_count, warn_count, fail_count, checks_json) VALUES (?, ?, ?, ?, ?, ?)',
  ).run(siteId, date, score.pass, score.warn, score.fail, checksJson);
}

// --- Query helpers ---

export interface ScTrendPoint {
  date: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export interface Ga4TrendPoint {
  date: string;
  users: number;
  sessions: number;
  views: number;
  bounceRate: number;
  avgDuration: number;
}

export interface AuditTrendPoint {
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

export interface DailyPoint {
  date: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export interface Ga4DailyPoint {
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

export function getScDailyMissingDates(siteId: string, startDate: string, endDate: string): string[] {
  const db = getDb();
  const existing = db.prepare(
    'SELECT date FROM sc_daily WHERE site_id = ? AND date >= ? AND date <= ?',
  ).all(siteId, startDate, endDate) as Array<{ date: string }>;
  const existingSet = new Set(existing.map(r => r.date));

  const missing: string[] = [];
  const cur = new Date(startDate);
  const end = new Date(endDate);
  while (cur <= end) {
    const d = cur.toISOString().split('T')[0];
    if (!existingSet.has(d)) missing.push(d);
    cur.setDate(cur.getDate() + 1);
  }
  return missing;
}

export function getGa4DailyMissingDates(siteId: string, startDate: string, endDate: string): string[] {
  const db = getDb();
  const existing = db.prepare(
    'SELECT date FROM ga4_daily WHERE site_id = ? AND date >= ? AND date <= ?',
  ).all(siteId, startDate, endDate) as Array<{ date: string }>;
  const existingSet = new Set(existing.map(r => r.date));

  const missing: string[] = [];
  const cur = new Date(startDate);
  const end = new Date(endDate);
  while (cur <= end) {
    const d = cur.toISOString().split('T')[0];
    if (!existingSet.has(d)) missing.push(d);
    cur.setDate(cur.getDate() + 1);
  }
  return missing;
}

export function getSnapshotCount(): number {
  const db = getDb();
  const row = db.prepare('SELECT COUNT(DISTINCT date) as count FROM sc_snapshots').get() as { count: number };
  return row.count;
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

export function dbUpsertSite(site: SiteRecord, sortOrder?: number): void {
  const db = getDb();
  let order = sortOrder;
  if (order === undefined) {
    const existing = db.prepare('SELECT sort_order FROM sites WHERE id = ?').get(site.id) as { sort_order: number } | undefined;
    if (existing !== undefined) {
      order = existing.sort_order;
    } else {
      const maxRow = db.prepare('SELECT MAX(sort_order) as m FROM sites').get() as { m: number | null };
      order = (maxRow.m ?? -1) + 1;
    }
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

export function dbDeleteSite(id: string): void {
  const db = getDb();
  db.prepare('DELETE FROM sites WHERE id = ?').run(id);
}
