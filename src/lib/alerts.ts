import {
  dbGetAlertRules,
  dbHasAlertEvent,
  dbInsertAlertEvent,
  dbGetSites,
  getDb,
  type AlertMetric,
  type AlertRule,
} from './db';
import { sendAlertNotifications } from './alert-delivery';

interface SnapshotValuePoint {
  date: string;
  value: number;
}

export interface AlertBreach {
  ruleId: number;
  siteId: string;
  metric: AlertMetric;
  thresholdPct: number;
  previousValue: number;
  currentValue: number;
  deltaPct: number;
  snapshotDate: string;
}

export function getAlertMetricLabel(metric: AlertMetric): string {
  switch (metric) {
    case 'sc_clicks':
      return 'SC clicks';
    case 'ga4_sessions':
      return 'GA4 sessions';
    case 'audit_score':
      return 'Audit score';
  }
}

export function formatAlertMetricValue(metric: AlertMetric, value: number): string {
  if (metric === 'audit_score') {
    return `${value.toFixed(1)}%`;
  }

  return Number.isInteger(value) ? value.toLocaleString() : value.toFixed(1);
}

function getMetricSnapshotPoints(siteId: string, metric: AlertMetric, snapshotDate: string): SnapshotValuePoint[] {
  const db = getDb();

  if (metric === 'sc_clicks') {
    return db.prepare(
      `SELECT date, SUM(clicks) as value
       FROM sc_snapshots
       WHERE site_id = ? AND date <= ?
       GROUP BY date
       ORDER BY date DESC
       LIMIT 2`,
    ).all(siteId, snapshotDate) as SnapshotValuePoint[];
  }

  if (metric === 'ga4_sessions') {
    return db.prepare(
      `SELECT date, sessions as value
       FROM ga4_snapshots
       WHERE site_id = ? AND date <= ?
       ORDER BY date DESC
       LIMIT 2`,
    ).all(siteId, snapshotDate) as SnapshotValuePoint[];
  }

  return db.prepare(
    `SELECT
       date,
       CASE
         WHEN (pass_count + warn_count + fail_count) > 0
           THEN ROUND((pass_count * 100.0) / (pass_count + warn_count + fail_count), 2)
         ELSE NULL
       END as value
     FROM audit_snapshots
     WHERE site_id = ? AND date <= ?
     ORDER BY date DESC
     LIMIT 2`,
  ).all(siteId, snapshotDate) as SnapshotValuePoint[];
}

export function evaluateAlertBreach(
  rule: Pick<AlertRule, 'id' | 'siteId' | 'metric' | 'thresholdPct'>,
  previous: SnapshotValuePoint,
  current: SnapshotValuePoint,
): AlertBreach | null {
  if (!Number.isFinite(previous.value) || !Number.isFinite(current.value) || previous.value <= 0) {
    return null;
  }

  if (current.value >= previous.value) {
    return null;
  }

  const deltaPct = ((previous.value - current.value) / previous.value) * 100;
  if (deltaPct < rule.thresholdPct) {
    return null;
  }

  return {
    ruleId: rule.id,
    siteId: rule.siteId,
    metric: rule.metric,
    thresholdPct: rule.thresholdPct,
    previousValue: previous.value,
    currentValue: current.value,
    deltaPct: Math.round(deltaPct * 100) / 100,
    snapshotDate: current.date,
  };
}

export function evaluateAlertRules(rules: AlertRule[], snapshotDate: string): AlertBreach[] {
  const breaches: AlertBreach[] = [];

  for (const rule of rules) {
    const points = getMetricSnapshotPoints(rule.siteId, rule.metric, snapshotDate);
    if (points.length < 2) {
      continue;
    }

    const [current, previous] = points;
    if (current.date !== snapshotDate) {
      continue;
    }

    const breach = evaluateAlertBreach(rule, previous, current);
    if (breach) {
      breaches.push(breach);
    }
  }

  return breaches;
}

export async function processSnapshotAlerts(snapshotDate: string): Promise<{ fired: number; errors: string[] }> {
  const rules = dbGetAlertRules();
  if (rules.length === 0) {
    return { fired: 0, errors: [] };
  }

  const rulesById = new Map(rules.map((rule) => [rule.id, rule]));
  const sitesById = new Map(dbGetSites().map((site) => [site.id, site]));
  const activeRules = rules.filter((rule) => {
    const site = sitesById.get(rule.siteId);
    if (!site) return false;
    return rule.metric !== 'sc_clicks' || site.searchConsole !== false;
  });
  const breaches = evaluateAlertRules(activeRules, snapshotDate);
  let fired = 0;
  const errors: string[] = [];

  for (const breach of breaches) {
    if (dbHasAlertEvent(breach.ruleId, breach.snapshotDate)) {
      continue;
    }

    const rule = rulesById.get(breach.ruleId);
    const site = sitesById.get(breach.siteId);
    if (!rule || !site) {
      continue;
    }

    const delivery = await sendAlertNotifications(rule.channels, {
      siteId: site.id,
      siteName: site.name,
      domain: site.domain,
      metric: breach.metric,
      thresholdPct: breach.thresholdPct,
      previousValue: breach.previousValue,
      currentValue: breach.currentValue,
      deltaPct: breach.deltaPct,
      snapshotDate: breach.snapshotDate,
    });

    const inserted = dbInsertAlertEvent({
      siteId: breach.siteId,
      ruleId: breach.ruleId,
      metric: breach.metric,
      thresholdPct: breach.thresholdPct,
      previousValue: breach.previousValue,
      currentValue: breach.currentValue,
      deltaPct: breach.deltaPct,
      snapshotDate: breach.snapshotDate,
      deliveredChannels: delivery.deliveredChannels,
      deliveryError: delivery.deliveryError,
    });

    if (inserted) {
      fired += 1;
    }

    if (delivery.deliveryError) {
      errors.push(`Alert ${site.id}/${breach.metric}: ${delivery.deliveryError}`);
    }
  }

  return { fired, errors };
}
