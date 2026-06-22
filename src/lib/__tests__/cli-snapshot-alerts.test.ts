import { beforeEach, describe, expect, it, vi } from 'vitest';
import { openDatabase } from '../sqlite-driver.js';

const httpsRequestMock = vi.hoisted(() => vi.fn());
vi.mock('node:https', () => ({
  request: httpsRequestMock,
}));

const lookupMock = vi.hoisted(() => vi.fn(async () => [{ address: '93.184.216.34', family: 4 }]));
vi.mock('node:dns/promises', () => ({
  lookup: lookupMock,
}));

import {
  buildWeeklyDigestPayloadForCli,
  ensureAlertTables,
  processSnapshotAlertsForCli,
  processWeeklyDigestForCli,
} from '../../../scripts/snapshot-alerts.mjs';

function makeDb() {
  const db = openDatabase(':memory:');
  db.exec(`
    CREATE TABLE config (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE sites (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      domain TEXT NOT NULL
    );

    CREATE TABLE sc_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      site_id TEXT NOT NULL,
      date TEXT NOT NULL,
      page_url TEXT NOT NULL,
      clicks INTEGER NOT NULL DEFAULT 0,
      impressions INTEGER NOT NULL DEFAULT 0,
      ctr REAL NOT NULL DEFAULT 0,
      position REAL NOT NULL DEFAULT 0
    );

    CREATE TABLE ga4_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      site_id TEXT NOT NULL,
      date TEXT NOT NULL,
      users INTEGER NOT NULL DEFAULT 0,
      sessions INTEGER NOT NULL DEFAULT 0,
      views INTEGER NOT NULL DEFAULT 0,
      bounce_rate REAL NOT NULL DEFAULT 0,
      avg_duration REAL NOT NULL DEFAULT 0
    );

    CREATE TABLE audit_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      site_id TEXT NOT NULL,
      date TEXT NOT NULL,
      pass_count INTEGER NOT NULL DEFAULT 0,
      warn_count INTEGER NOT NULL DEFAULT 0,
      fail_count INTEGER NOT NULL DEFAULT 0,
      checks_json TEXT NOT NULL DEFAULT '{}'
    );
  `);
  ensureAlertTables(db);
  return db;
}

function seedDrop(db: ReturnType<typeof makeDb>) {
  db.prepare('INSERT INTO sites (id, name, domain) VALUES (?, ?, ?)').run(
    'site-a',
    'Site A',
    'a.example.com',
  );
  db.prepare('INSERT INTO sc_snapshots (site_id, date, page_url, clicks, impressions, ctr, position) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
    'site-a',
    '2026-05-16',
    'https://a.example.com/',
    100,
    1000,
    0.1,
    3,
  );
  db.prepare('INSERT INTO sc_snapshots (site_id, date, page_url, clicks, impressions, ctr, position) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
    'site-a',
    '2026-05-17',
    'https://a.example.com/',
    60,
    1000,
    0.06,
    3,
  );
  db.prepare('INSERT INTO alert_rules (site_id, metric, threshold_pct, channels_json) VALUES (?, ?, ?, ?)').run(
    'site-a',
    'sc_clicks',
    25,
    JSON.stringify(['email']),
  );
}

function seedWeeklyDigestHistory(db: ReturnType<typeof makeDb>) {
  db.exec('ALTER TABLE sites ADD COLUMN ga4_property_id TEXT');
  db.prepare('UPDATE sites SET ga4_property_id = ? WHERE id = ?').run('properties/123', 'site-a');
  db.prepare('INSERT INTO sc_snapshots (site_id, date, page_url, clicks, impressions, ctr, position) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
    'site-a',
    '2026-06-15',
    'https://a.example.com/',
    80,
    1000,
    0.08,
    3,
  );
  db.prepare('INSERT INTO sc_snapshots (site_id, date, page_url, clicks, impressions, ctr, position) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
    'site-a',
    '2026-06-22',
    'https://a.example.com/',
    100,
    1100,
    0.09,
    3,
  );
  db.prepare('INSERT INTO ga4_snapshots (site_id, date, users, sessions, views, bounce_rate, avg_duration) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
    'site-a',
    '2026-06-15',
    100,
    90,
    200,
    0.4,
    20,
  );
  db.prepare('INSERT INTO ga4_snapshots (site_id, date, users, sessions, views, bounce_rate, avg_duration) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
    'site-a',
    '2026-06-22',
    120,
    99,
    250,
    0.4,
    20,
  );
  db.prepare('INSERT INTO audit_snapshots (site_id, date, pass_count, warn_count, fail_count, checks_json) VALUES (?, ?, ?, ?, ?, ?)').run(
    'site-a',
    '2026-06-15',
    8,
    2,
    0,
    '{}',
  );
  db.prepare('INSERT INTO audit_snapshots (site_id, date, pass_count, warn_count, fail_count, checks_json) VALUES (?, ?, ?, ?, ?, ?)').run(
    'site-a',
    '2026-06-22',
    9,
    1,
    0,
    '{}',
  );
  db.prepare(
    `INSERT INTO alert_events (
      site_id, rule_id, metric, threshold_pct, previous_value, current_value, delta_pct, snapshot_date
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run('site-a', 1, 'sc_clicks', 25, 100, 50, 50, '2026-06-22');
}

type PinnedLookup = (
  hostname: string,
  options: unknown,
  callback: (error: Error | null, address: string, family: number) => void,
) => void;

function mockHttpsResponse(statusCode = 204, body = '') {
  httpsRequestMock.mockImplementation((options, callback) => {
    const req = {} as {
      on: ReturnType<typeof vi.fn>;
      write: ReturnType<typeof vi.fn>;
      end: ReturnType<typeof vi.fn>;
      destroy: ReturnType<typeof vi.fn>;
    };
    req.on = vi.fn(() => req);
    req.write = vi.fn();
    req.destroy = vi.fn();
    req.end = vi.fn(() => {
      const responseHandlers = new Map<string, (chunk?: Buffer) => void>();
      const res = {
        statusCode,
        on: vi.fn((event: string, handler: (chunk?: Buffer) => void) => {
          responseHandlers.set(event, handler);
          return res;
        }),
      };
      callback(res);
      if (body) {
        responseHandlers.get('data')?.(Buffer.from(body));
      }
      responseHandlers.get('end')?.();
    });
    return req;
  });
}

describe('CLI snapshot alerts', () => {
  let db: ReturnType<typeof makeDb>;

  beforeEach(() => {
    db = makeDb();
    seedDrop(db);
    vi.unstubAllGlobals();
    httpsRequestMock.mockReset();
    mockHttpsResponse();
    lookupMock.mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
    delete process.env.ALERT_WEBHOOK_URL;
  });

  it('processes alert rules for snapshots created by the standalone CLI path', async () => {
    const sendNotifications = vi.fn(async () => ({
      deliveredChannels: ['email'],
      deliveryError: null,
    }));

    const result = await processSnapshotAlertsForCli(db, '2026-05-17', { sendNotifications });

    expect(result).toEqual({ fired: 1, errors: [] });
    expect(sendNotifications).toHaveBeenCalledWith(['email'], expect.objectContaining({
      siteId: 'site-a',
      metric: 'sc_clicks',
      previousValue: 100,
      currentValue: 60,
      deltaPct: 40,
      snapshotDate: '2026-05-17',
    }));
    expect(db.prepare('SELECT COUNT(*) as count FROM alert_events').get()).toEqual({ count: 1 });
  });

  it('does not fire existing SC click rules when Search Console is disabled', async () => {
    db.exec('ALTER TABLE sites ADD COLUMN search_console INTEGER NOT NULL DEFAULT 1');
    db.prepare('UPDATE sites SET search_console = 0 WHERE id = ?').run('site-a');
    const sendNotifications = vi.fn(async () => ({
      deliveredChannels: ['email'],
      deliveryError: null,
    }));

    const result = await processSnapshotAlertsForCli(db, '2026-05-17', { sendNotifications });

    expect(result).toEqual({ fired: 0, errors: [] });
    expect(sendNotifications).not.toHaveBeenCalled();
    expect(db.prepare('SELECT COUNT(*) as count FROM alert_events').get()).toEqual({ count: 0 });
  });

  it('does not re-deliver the same rule for an already recorded snapshot event', async () => {
    const sendNotifications = vi.fn(async () => ({
      deliveredChannels: ['email'],
      deliveryError: null,
    }));

    await processSnapshotAlertsForCli(db, '2026-05-17', { sendNotifications });
    const second = await processSnapshotAlertsForCli(db, '2026-05-17', { sendNotifications });

    expect(second).toEqual({ fired: 0, errors: [] });
    expect(sendNotifications).toHaveBeenCalledTimes(1);
  });

  it('does not follow webhook redirects to private hosts', async () => {
    db.prepare('UPDATE alert_rules SET channels_json = ? WHERE site_id = ?').run(
      JSON.stringify(['webhook']),
      'site-a',
    );
    db.prepare('INSERT INTO config (key, value) VALUES (?, ?)').run(
      'alert_webhook_url',
      'https://93.184.216.34/seo-alerts',
    );
    mockHttpsResponse(302);

    const result = await processSnapshotAlertsForCli(db, '2026-05-17');

    expect(result).toEqual({
      fired: 1,
      errors: ['Alert site-a/sc_clicks: webhook: Webhook redirect responses are not allowed'],
    });
    expect(httpsRequestMock).toHaveBeenCalledTimes(1);
    expect(httpsRequestMock).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'POST',
        hostname: '93.184.216.34',
      }),
      expect.any(Function),
    );
  });

  it('does not follow webhook redirects to private resolved HTTPS hosts', async () => {
    db.prepare('UPDATE alert_rules SET channels_json = ? WHERE site_id = ?').run(
      JSON.stringify(['webhook']),
      'site-a',
    );
    db.prepare('INSERT INTO config (key, value) VALUES (?, ?)').run(
      'alert_webhook_url',
      'https://93.184.216.34/seo-alerts',
    );
    mockHttpsResponse(307);

    const result = await processSnapshotAlertsForCli(db, '2026-05-17');

    expect(result).toEqual({
      fired: 1,
      errors: ['Alert site-a/sc_clicks: webhook: Webhook redirect responses are not allowed'],
    });
    expect(httpsRequestMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    'https://[::ffff:127.0.0.1]/seo-alerts',
    'https://[::ffff:0a00:1]/seo-alerts',
    'https://[::ffff:c0a8:1]/seo-alerts',
    'https://[::c0a8:1]/seo-alerts',
  ])('rejects IPv4-mapped or compatible IPv6 webhook URL %s before fetch', async (webhookUrl) => {
    db.prepare('UPDATE alert_rules SET channels_json = ? WHERE site_id = ?').run(
      JSON.stringify(['webhook']),
      'site-a',
    );
    db.prepare('INSERT INTO config (key, value) VALUES (?, ?)').run(
      'alert_webhook_url',
      webhookUrl,
    );

    const result = await processSnapshotAlertsForCli(db, '2026-05-17');

    expect(result).toEqual({
      fired: 1,
      errors: ['Alert site-a/sc_clicks: webhook: Webhook URL must use a public host'],
    });
    expect(httpsRequestMock).not.toHaveBeenCalled();
  });

  it.each([
    'https://100.64.0.1/seo-alerts',
    'https://192.0.2.1/seo-alerts',
    'https://198.18.0.1/seo-alerts',
    'https://198.51.100.1/seo-alerts',
    'https://203.0.113.1/seo-alerts',
    'https://224.0.0.1/seo-alerts',
    'https://240.0.0.1/seo-alerts',
    'https://[64:ff9b::c000:201]/seo-alerts',
    'https://[100::]/seo-alerts',
    'https://[2001:db8::1]/seo-alerts',
    'https://[2002:c000:0201::]/seo-alerts',
    'https://[ff02::1]/seo-alerts',
  ])('rejects non-public webhook URL %s before fetch', async (webhookUrl) => {
    db.prepare('UPDATE alert_rules SET channels_json = ? WHERE site_id = ?').run(
      JSON.stringify(['webhook']),
      'site-a',
    );
    db.prepare('INSERT INTO config (key, value) VALUES (?, ?)').run(
      'alert_webhook_url',
      webhookUrl,
    );

    const result = await processSnapshotAlertsForCli(db, '2026-05-17');

    expect(result).toEqual({
      fired: 1,
      errors: ['Alert site-a/sc_clicks: webhook: Webhook URL must use a public host'],
    });
    expect(httpsRequestMock).not.toHaveBeenCalled();
  });

  it('pins webhook delivery to the validated public address', async () => {
    db.prepare('UPDATE alert_rules SET channels_json = ? WHERE site_id = ?').run(
      JSON.stringify(['webhook']),
      'site-a',
    );
    db.prepare('INSERT INTO config (key, value) VALUES (?, ?)').run(
      'alert_webhook_url',
      'https://hooks.example.com/seo-alerts',
    );

    const result = await processSnapshotAlertsForCli(db, '2026-05-17');

    expect(result).toEqual({ fired: 1, errors: [] });
    const options = httpsRequestMock.mock.calls[0][0] as { lookup: PinnedLookup };
    const lookupCallback = vi.fn();
    options.lookup('hooks.example.com', {}, lookupCallback);
    expect(lookupCallback).toHaveBeenCalledWith(null, '93.184.216.34', 4);
  });

  it('aborts oversized webhook error responses without concatenating the full body', async () => {
    db.prepare('UPDATE alert_rules SET channels_json = ? WHERE site_id = ?').run(
      JSON.stringify(['webhook']),
      'site-a',
    );
    db.prepare('INSERT INTO config (key, value) VALUES (?, ?)').run(
      'alert_webhook_url',
      'https://hooks.example.com/seo-alerts',
    );
    const oversizedBody = 'x'.repeat((64 * 1024) + 1);
    mockHttpsResponse(500, oversizedBody);

    const result = await processSnapshotAlertsForCli(db, '2026-05-17');

    expect(result).toEqual({
      fired: 1,
      errors: ['Alert site-a/sc_clicks: webhook: Webhook response body exceeded 65536 bytes'],
    });
    const req = httpsRequestMock.mock.results[0].value as { destroy: ReturnType<typeof vi.fn> };
    expect(req.destroy).toHaveBeenCalled();
    expect(result.errors.join('\n')).not.toContain(oversizedBody);
  });

  it('rejects webhook hostnames that resolve to private addresses before request', async () => {
    db.prepare('UPDATE alert_rules SET channels_json = ? WHERE site_id = ?').run(
      JSON.stringify(['webhook']),
      'site-a',
    );
    db.prepare('INSERT INTO config (key, value) VALUES (?, ?)').run(
      'alert_webhook_url',
      'https://hooks.example.com/seo-alerts',
    );
    lookupMock.mockResolvedValue([{ address: '10.0.0.5', family: 4 }]);

    const result = await processSnapshotAlertsForCli(db, '2026-05-17');

    expect(result).toEqual({
      fired: 1,
      errors: ['Alert site-a/sc_clicks: webhook: Webhook URL must use a public host'],
    });
    expect(httpsRequestMock).not.toHaveBeenCalled();
  });

  it.each([
    '100.64.0.5',
    '192.0.2.10',
    '198.18.0.10',
    '203.0.113.10',
    '2001:db8::10',
  ])('rejects webhook hostnames that resolve to non-public address %s', async (address) => {
    db.prepare('UPDATE alert_rules SET channels_json = ? WHERE site_id = ?').run(
      JSON.stringify(['webhook']),
      'site-a',
    );
    db.prepare('INSERT INTO config (key, value) VALUES (?, ?)').run(
      'alert_webhook_url',
      'https://hooks.example.com/seo-alerts',
    );
    lookupMock.mockResolvedValue([{ address, family: address.includes(':') ? 6 : 4 }]);

    const result = await processSnapshotAlertsForCli(db, '2026-05-17');

    expect(result).toEqual({
      fired: 1,
      errors: ['Alert site-a/sc_clicks: webhook: Webhook URL must use a public host'],
    });
    expect(httpsRequestMock).not.toHaveBeenCalled();
  });

  it('rejects non-public webhook URLs from env fallback before fetch', async () => {
    db.prepare('UPDATE alert_rules SET channels_json = ? WHERE site_id = ?').run(
      JSON.stringify(['webhook']),
      'site-a',
    );
    process.env.ALERT_WEBHOOK_URL = 'https://100.64.0.1/seo-alerts';

    const result = await processSnapshotAlertsForCli(db, '2026-05-17');

    expect(result).toEqual({
      fired: 1,
      errors: ['Alert site-a/sc_clicks: webhook: Webhook URL must use a public host'],
    });
    expect(httpsRequestMock).not.toHaveBeenCalled();
  });
});

describe('CLI weekly digest', () => {
  let db: ReturnType<typeof makeDb>;

  beforeEach(() => {
    db = makeDb();
    seedDrop(db);
  });

  it('builds the digest payload from standalone CLI snapshot tables', () => {
    seedWeeklyDigestHistory(db);

    expect(buildWeeklyDigestPayloadForCli(db, '2026-06-22')).toMatchObject({
      snapshotDate: '2026-06-22',
      previousDate: '2026-06-15',
      alertCount: 1,
      sites: [
        {
          siteName: 'Site A',
          domain: 'a.example.com',
          scClicks: { current: 100, previous: 80, deltaPct: 25 },
          ga4Sessions: { current: 99, previous: 90, deltaPct: 10 },
          auditScore: { current: 90, previous: 80, deltaPct: 12.5 },
        },
      ],
    });
  });

  it('sends once on Monday when enabled', async () => {
    db.prepare('INSERT INTO config (key, value) VALUES (?, ?)').run('alert_weekly_digest_enabled', '1');
    const sendDigest = vi.fn(async () => ({ deliveredChannels: ['email'], deliveryError: null }));

    const first = await processWeeklyDigestForCli(db, '2026-06-22', { sendDigest });
    const second = await processWeeklyDigestForCli(db, '2026-06-22', { sendDigest });

    expect(first).toEqual({ sent: true, skipped: null, deliveryError: null });
    expect(second).toEqual({ sent: false, skipped: 'already-sent', deliveryError: null });
    expect(sendDigest).toHaveBeenCalledTimes(1);
    expect(db.prepare("SELECT value FROM config WHERE key = 'alert_weekly_digest_last_sent_date'").get()).toEqual({
      value: '2026-06-22',
    });
  });

  it('skips disabled and non-Monday CLI runs', async () => {
    const sendDigest = vi.fn(async () => ({ deliveredChannels: ['email'], deliveryError: null }));

    await expect(processWeeklyDigestForCli(db, '2026-06-22', { sendDigest })).resolves.toEqual({
      sent: false,
      skipped: 'disabled',
      deliveryError: null,
    });

    db.prepare('INSERT INTO config (key, value) VALUES (?, ?)').run('alert_weekly_digest_enabled', '1');
    await expect(processWeeklyDigestForCli(db, '2026-06-23', { sendDigest })).resolves.toEqual({
      sent: false,
      skipped: 'not-weekly-run',
      deliveryError: null,
    });
    expect(sendDigest).not.toHaveBeenCalled();
  });
});
