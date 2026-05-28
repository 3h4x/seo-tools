import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs');
  return { ...actual, existsSync: () => true, mkdirSync: () => undefined };
});

vi.mock('../sqlite-driver.js', async () => {
  const actual = await vi.importActual<typeof import('../sqlite-driver.js')>('../sqlite-driver.js');
  return {
    openDatabase: () => actual.openDatabase(':memory:'),
  };
});

const sendAlertNotificationsMock = vi.hoisted(() => vi.fn());
vi.mock('../alert-delivery', () => ({
  sendAlertNotifications: sendAlertNotificationsMock,
}));

import { dbDeleteAlertRule, dbGetAlertEvents, dbUpsertAlertRule, getDb } from '../db';
import {
  evaluateAlertBreach,
  evaluateAlertRules,
  formatAlertMetricValue,
  getAlertMetricLabel,
  processSnapshotAlerts,
} from '../alerts';

function seedSnapshotHistory() {
  const db = getDb();
  db.prepare('INSERT INTO sites (id, name, domain, test_pages, skip_checks) VALUES (?, ?, ?, ?, ?)').run(
    'site-a',
    'Site A',
    'a.example.com',
    '[]',
    '[]',
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
  db.prepare('INSERT INTO ga4_snapshots (site_id, date, users, sessions, views, bounce_rate, avg_duration) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
    'site-a',
    '2026-05-16',
    120,
    80,
    200,
    0.4,
    20,
  );
  db.prepare('INSERT INTO ga4_snapshots (site_id, date, users, sessions, views, bounce_rate, avg_duration) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
    'site-a',
    '2026-05-17',
    118,
    78,
    198,
    0.4,
    21,
  );
  db.prepare('INSERT INTO audit_snapshots (site_id, date, pass_count, warn_count, fail_count, checks_json) VALUES (?, ?, ?, ?, ?, ?)').run(
    'site-a',
    '2026-05-16',
    9,
    1,
    0,
    '{}',
  );
  db.prepare('INSERT INTO audit_snapshots (site_id, date, pass_count, warn_count, fail_count, checks_json) VALUES (?, ?, ?, ?, ?, ?)').run(
    'site-a',
    '2026-05-17',
    9,
    1,
    0,
    '{}',
  );
}

beforeEach(() => {
  const db = getDb();
  db.exec(`
    DELETE FROM alert_events;
    DELETE FROM alert_rules;
    DELETE FROM audit_snapshots;
    DELETE FROM ga4_snapshots;
    DELETE FROM sc_snapshots;
    DELETE FROM sites;
  `);
  vi.clearAllMocks();
  seedSnapshotHistory();
});

describe('getAlertMetricLabel', () => {
  it('returns a human-readable label for every supported metric', () => {
    expect(getAlertMetricLabel('sc_clicks')).toBe('SC clicks');
    expect(getAlertMetricLabel('ga4_sessions')).toBe('GA4 sessions');
    expect(getAlertMetricLabel('audit_score')).toBe('Audit score');
  });
});

describe('formatAlertMetricValue', () => {
  it('formats audit_score values as a fixed-precision percentage', () => {
    expect(formatAlertMetricValue('audit_score', 90)).toBe('90.0%');
    expect(formatAlertMetricValue('audit_score', 87.45)).toBe('87.5%');
  });

  it('formats integer counts with locale separators', () => {
    expect(formatAlertMetricValue('sc_clicks', 12345)).toBe((12345).toLocaleString());
    expect(formatAlertMetricValue('ga4_sessions', 0)).toBe('0');
  });

  it('formats non-integer counts to one decimal place', () => {
    expect(formatAlertMetricValue('sc_clicks', 12.34)).toBe('12.3');
  });
});

describe('evaluateAlertBreach', () => {
  const rule = { id: 1, siteId: 'site-a', metric: 'sc_clicks' as const, thresholdPct: 25 };

  it('returns null when previous value is zero', () => {
    expect(evaluateAlertBreach(rule, { date: 'p', value: 0 }, { date: 'c', value: 0 })).toBeNull();
  });

  it('returns null when previous value is negative', () => {
    expect(evaluateAlertBreach(rule, { date: 'p', value: -1 }, { date: 'c', value: -5 })).toBeNull();
  });

  it('returns null when values are not finite', () => {
    expect(
      evaluateAlertBreach(rule, { date: 'p', value: Number.NaN }, { date: 'c', value: 1 }),
    ).toBeNull();
    expect(
      evaluateAlertBreach(rule, { date: 'p', value: 10 }, { date: 'c', value: Number.POSITIVE_INFINITY }),
    ).toBeNull();
  });

  it('returns null when current value did not drop', () => {
    expect(evaluateAlertBreach(rule, { date: 'p', value: 10 }, { date: 'c', value: 10 })).toBeNull();
    expect(evaluateAlertBreach(rule, { date: 'p', value: 10 }, { date: 'c', value: 20 })).toBeNull();
  });

  it('returns null when the percentage drop is under the configured threshold', () => {
    // 10% drop, threshold is 25
    expect(evaluateAlertBreach(rule, { date: 'p', value: 100 }, { date: 'c', value: 90 })).toBeNull();
  });

  it('rounds the reported deltaPct to two decimals', () => {
    const breach = evaluateAlertBreach(rule, { date: 'p', value: 300 }, { date: 'c', value: 100 });
    expect(breach).not.toBeNull();
    expect(breach!.deltaPct).toBe(66.67);
  });
});

describe('evaluateAlertRules', () => {
  it('returns a breach when the latest snapshot drops past the configured threshold', () => {
    const rule = dbUpsertAlertRule({
      siteId: 'site-a',
      metric: 'sc_clicks',
      thresholdPct: 25,
      channels: ['email'],
    });

    expect(evaluateAlertRules([rule], '2026-05-17')).toEqual([
      {
        ruleId: rule.id,
        siteId: 'site-a',
        metric: 'sc_clicks',
        thresholdPct: 25,
        previousValue: 100,
        currentValue: 60,
        deltaPct: 40,
        snapshotDate: '2026-05-17',
      },
    ]);
  });

  it('returns no breach when the drop stays below the threshold', () => {
    const rule = dbUpsertAlertRule({
      siteId: 'site-a',
      metric: 'ga4_sessions',
      thresholdPct: 10,
      channels: ['email'],
    });

    expect(evaluateAlertRules([rule], '2026-05-17')).toEqual([]);
  });
});

describe('processSnapshotAlerts', () => {
  it('records provider-delivery errors without skipping the alert event', async () => {
    dbUpsertAlertRule({
      siteId: 'site-a',
      metric: 'sc_clicks',
      thresholdPct: 25,
      channels: ['email'],
    });
    sendAlertNotificationsMock.mockResolvedValue({
      deliveredChannels: [],
      deliveryError: 'email: missing resend config',
    });

    const result = await processSnapshotAlerts('2026-05-17');

    expect(result.fired).toBe(1);
    expect(result.errors).toEqual(['Alert site-a/sc_clicks: email: missing resend config']);

    const row = getDb().prepare(
      'SELECT delivered_channels_json, delivery_error FROM alert_events WHERE site_id = ? AND snapshot_date = ?',
    ).get('site-a', '2026-05-17') as { delivered_channels_json: string; delivery_error: string };

    expect(row.delivered_channels_json).toBe('[]');
    expect(row.delivery_error).toBe('email: missing resend config');
  });

  it('keeps fired alert history after the source rule is deleted', async () => {
    const rule = dbUpsertAlertRule({
      siteId: 'site-a',
      metric: 'sc_clicks',
      thresholdPct: 25,
      channels: ['email'],
    });
    sendAlertNotificationsMock.mockResolvedValue({
      deliveredChannels: ['email'],
      deliveryError: null,
    });

    await processSnapshotAlerts('2026-05-17');
    dbDeleteAlertRule(rule.id);

    expect(dbGetAlertEvents()).toMatchObject([
      {
        ruleId: rule.id,
        siteId: 'site-a',
        metric: 'sc_clicks',
        snapshotDate: '2026-05-17',
        deliveredChannels: ['email'],
      },
    ]);
  });

  it('returns early without delivery when no alert rules are configured', async () => {
    const result = await processSnapshotAlerts('2026-05-17');

    expect(result).toEqual({ fired: 0, errors: [] });
    expect(sendAlertNotificationsMock).not.toHaveBeenCalled();
  });

  it('does not re-deliver an alert when one has already been recorded for that snapshot date', async () => {
    dbUpsertAlertRule({
      siteId: 'site-a',
      metric: 'sc_clicks',
      thresholdPct: 25,
      channels: ['email'],
    });
    sendAlertNotificationsMock.mockResolvedValue({
      deliveredChannels: ['email'],
      deliveryError: null,
    });

    const first = await processSnapshotAlerts('2026-05-17');
    expect(first.fired).toBe(1);

    sendAlertNotificationsMock.mockClear();
    const second = await processSnapshotAlerts('2026-05-17');

    expect(second).toEqual({ fired: 0, errors: [] });
    expect(sendAlertNotificationsMock).not.toHaveBeenCalled();
    expect(dbGetAlertEvents()).toHaveLength(1);
  });

  it('fires audit-score rules using the pass-ratio derived from audit_snapshots', async () => {
    const db = getDb();
    db.prepare('DELETE FROM audit_snapshots WHERE site_id = ?').run('site-a');
    db.prepare(
      'INSERT INTO audit_snapshots (site_id, date, pass_count, warn_count, fail_count, checks_json) VALUES (?, ?, ?, ?, ?, ?)',
    ).run('site-a', '2026-05-16', 10, 0, 0, '{}');
    db.prepare(
      'INSERT INTO audit_snapshots (site_id, date, pass_count, warn_count, fail_count, checks_json) VALUES (?, ?, ?, ?, ?, ?)',
    ).run('site-a', '2026-05-17', 5, 0, 5, '{}');

    dbUpsertAlertRule({
      siteId: 'site-a',
      metric: 'audit_score',
      thresholdPct: 25,
      channels: ['email'],
    });
    sendAlertNotificationsMock.mockResolvedValue({
      deliveredChannels: ['email'],
      deliveryError: null,
    });

    const result = await processSnapshotAlerts('2026-05-17');

    expect(result.fired).toBe(1);
    expect(sendAlertNotificationsMock).toHaveBeenCalledWith(
      ['email'],
      expect.objectContaining({
        metric: 'audit_score',
        previousValue: 100,
        currentValue: 50,
        deltaPct: 50,
      }),
    );
  });

  it('does not fire when the latest snapshot date does not match the snapshot being processed', async () => {
    dbUpsertAlertRule({
      siteId: 'site-a',
      metric: 'sc_clicks',
      thresholdPct: 25,
      channels: ['email'],
    });

    const result = await processSnapshotAlerts('2026-05-16');

    expect(result).toEqual({ fired: 0, errors: [] });
    expect(sendAlertNotificationsMock).not.toHaveBeenCalled();
  });

  it('does not fire when only one snapshot exists for the metric', async () => {
    getDb().prepare('DELETE FROM sc_snapshots WHERE site_id = ? AND date = ?').run('site-a', '2026-05-16');

    dbUpsertAlertRule({
      siteId: 'site-a',
      metric: 'sc_clicks',
      thresholdPct: 25,
      channels: ['email'],
    });

    const result = await processSnapshotAlerts('2026-05-17');

    expect(result).toEqual({ fired: 0, errors: [] });
    expect(sendAlertNotificationsMock).not.toHaveBeenCalled();
  });

  it('does not fire existing SC click rules when Search Console is disabled', async () => {
    getDb().prepare('UPDATE sites SET search_console = 0 WHERE id = ?').run('site-a');
    dbUpsertAlertRule({
      siteId: 'site-a',
      metric: 'sc_clicks',
      thresholdPct: 25,
      channels: ['email'],
    });

    const result = await processSnapshotAlerts('2026-05-17');

    expect(result).toEqual({ fired: 0, errors: [] });
    expect(sendAlertNotificationsMock).not.toHaveBeenCalled();
    expect(dbGetAlertEvents()).toEqual([]);
  });
});
