import { lookup } from 'node:dns/promises';
import { request as httpsRequest } from 'node:https';
import { isIP } from 'node:net';

export const ALERT_SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS alert_rules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    site_id TEXT NOT NULL,
    metric TEXT NOT NULL,
    threshold_pct INTEGER NOT NULL,
    channels_json TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_alert_rules_site ON alert_rules(site_id);

  CREATE TABLE IF NOT EXISTS alert_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    site_id TEXT NOT NULL,
    rule_id INTEGER NOT NULL,
    metric TEXT NOT NULL,
    threshold_pct INTEGER NOT NULL,
    previous_value REAL NOT NULL,
    current_value REAL NOT NULL,
    delta_pct REAL NOT NULL,
    snapshot_date TEXT NOT NULL,
    delivered_channels_json TEXT NOT NULL DEFAULT '[]',
    delivery_error TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(rule_id, snapshot_date)
  );

  CREATE INDEX IF NOT EXISTS idx_alert_events_created ON alert_events(created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_alert_events_site ON alert_events(site_id, created_at DESC);
`;

const VALID_METRICS = new Set(['sc_clicks', 'ga4_sessions']);
const VALID_CHANNELS = new Set(['email', 'webhook']);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DELIVERY_TIMEOUT_MS = 10_000;
const WEBHOOK_RESPONSE_BODY_LIMIT_BYTES = 64 * 1024;
const NON_PUBLIC_IPV4_RANGES = [
  { start: ipv4ToInt('0.0.0.0'), end: ipv4ToInt('0.255.255.255') },
  { start: ipv4ToInt('10.0.0.0'), end: ipv4ToInt('10.255.255.255') },
  { start: ipv4ToInt('100.64.0.0'), end: ipv4ToInt('100.127.255.255') },
  { start: ipv4ToInt('127.0.0.0'), end: ipv4ToInt('127.255.255.255') },
  { start: ipv4ToInt('169.254.0.0'), end: ipv4ToInt('169.254.255.255') },
  { start: ipv4ToInt('172.16.0.0'), end: ipv4ToInt('172.31.255.255') },
  { start: ipv4ToInt('192.0.0.0'), end: ipv4ToInt('192.0.0.255') },
  { start: ipv4ToInt('192.0.2.0'), end: ipv4ToInt('192.0.2.255') },
  { start: ipv4ToInt('192.88.99.0'), end: ipv4ToInt('192.88.99.255') },
  { start: ipv4ToInt('192.168.0.0'), end: ipv4ToInt('192.168.255.255') },
  { start: ipv4ToInt('198.18.0.0'), end: ipv4ToInt('198.19.255.255') },
  { start: ipv4ToInt('198.51.100.0'), end: ipv4ToInt('198.51.100.255') },
  { start: ipv4ToInt('203.0.113.0'), end: ipv4ToInt('203.0.113.255') },
  { start: ipv4ToInt('224.0.0.0'), end: ipv4ToInt('239.255.255.255') },
  { start: ipv4ToInt('240.0.0.0'), end: ipv4ToInt('255.255.255.255') },
];

function ipv4ToInt(value) {
  return value.split('.').reduce((acc, part) => (acc * 256) + Number(part), 0);
}

function ipv4IntToString(value) {
  return [
    (value >>> 24) & 255,
    (value >>> 16) & 255,
    (value >>> 8) & 255,
    value & 255,
  ].join('.');
}

function normalizeHostname(hostname) {
  return hostname.startsWith('[') && hostname.endsWith(']')
    ? hostname.slice(1, -1)
    : hostname;
}

function getIpv4MappedIpv6(hostname) {
  const normalized = normalizeHostname(hostname).toLowerCase();
  if (isIP(normalized) !== 6 || !normalized.startsWith('::ffff:')) {
    return null;
  }

  const embedded = normalized.slice('::ffff:'.length);
  if (isIP(embedded) === 4) {
    return embedded;
  }

  const parts = embedded.split(':');
  if (parts.length !== 2) {
    return null;
  }

  const high = Number.parseInt(parts[0], 16);
  const low = Number.parseInt(parts[1], 16);
  if (
    !Number.isInteger(high) ||
    !Number.isInteger(low) ||
    high < 0 ||
    high > 0xffff ||
    low < 0 ||
    low > 0xffff
  ) {
    return null;
  }

  return ipv4IntToString((high << 16) + low);
}

function getIpv4CompatibleIpv6(hostname) {
  const normalized = normalizeHostname(hostname).toLowerCase();
  if (
    isIP(normalized) !== 6 ||
    !normalized.startsWith('::') ||
    normalized === '::' ||
    normalized === '::1' ||
    normalized.startsWith('::ffff:')
  ) {
    return null;
  }

  const embedded = normalized.slice(2);
  if (isIP(embedded) === 4) {
    return embedded;
  }

  const parts = embedded.split(':');
  if (parts.length !== 2) {
    return null;
  }

  const high = Number.parseInt(parts[0], 16);
  const low = Number.parseInt(parts[1], 16);
  if (
    !Number.isInteger(high) ||
    !Number.isInteger(low) ||
    high < 0 ||
    high > 0xffff ||
    low < 0 ||
    low > 0xffff
  ) {
    return null;
  }

  return ipv4IntToString((high << 16) + low);
}

function parseIpv6Hextets(hostname) {
  const normalized = normalizeHostname(hostname).toLowerCase();
  if (isIP(normalized) !== 6) {
    return null;
  }

  const [head = '', tail = ''] = normalized.split('::');
  const headParts = head ? head.split(':') : [];
  const tailParts = tail ? tail.split(':') : [];
  const missingCount = 8 - headParts.length - tailParts.length;
  const parts = [
    ...headParts,
    ...Array(Math.max(0, missingCount)).fill('0'),
    ...tailParts,
  ];

  if (parts.length !== 8 || parts.some((part) => part.includes('.'))) {
    return null;
  }

  const hextets = parts.map((part) => Number.parseInt(part || '0', 16));
  if (hextets.some((part) => !Number.isInteger(part) || part < 0 || part > 0xffff)) {
    return null;
  }

  return hextets;
}

function isNonPublicIpv4(hostname) {
  const normalized = getIpv4MappedIpv6(hostname) ?? normalizeHostname(hostname);
  if (isIP(normalized) !== 4) {
    return false;
  }

  const value = ipv4ToInt(normalized);
  return NON_PUBLIC_IPV4_RANGES.some((range) => value >= range.start && value <= range.end);
}

function isNonPublicIpv6(hostname) {
  const normalized = normalizeHostname(hostname).toLowerCase();
  if (isIP(normalized) !== 6) {
    return false;
  }

  if (getIpv4MappedIpv6(normalized) !== null || getIpv4CompatibleIpv6(normalized) !== null) {
    return true;
  }

  const hextets = parseIpv6Hextets(normalized);
  if (!hextets) {
    return true;
  }

  const [first, second, third, fourth] = hextets;

  return (
    normalized === '::' ||
    normalized === '::1' ||
    (first === 0x64 && second === 0xff9b && (third === 0 || third === 1)) ||
    (first === 0x100 && second === 0 && third === 0 && fourth === 0) ||
    (first === 0x2001 && (
      second === 0 ||
      second === 0x2 ||
      second === 0xdb8 ||
      (second >= 0x10 && second <= 0x1f)
    )) ||
    first === 0x2002 ||
    (first >= 0xfc00 && first <= 0xfdff) ||
    (first >= 0xfe80 && first <= 0xfebf) ||
    (first >= 0xff00 && first <= 0xffff)
  );
}

function validateWebhookUrl(webhookUrl) {
  let parsed;
  try {
    parsed = new URL(webhookUrl);
  } catch {
    throw new Error('Webhook URL must be a valid absolute URL');
  }

  if (parsed.protocol !== 'https:') {
    throw new Error('Webhook URL must use https');
  }

  if (parsed.username || parsed.password) {
    throw new Error('Webhook URL must not include credentials');
  }

  const hostname = normalizeHostname(parsed.hostname.toLowerCase());
  if (
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.internal') ||
    hostname.endsWith('.lan') ||
    isNonPublicIpv4(hostname) ||
    isNonPublicIpv6(hostname)
  ) {
    throw new Error('Webhook URL must use a public host');
  }

  if (!isIP(hostname) && !hostname.includes('.')) {
    throw new Error('Webhook URL must use a public host');
  }
}

async function resolveWebhookTarget(webhookUrl) {
  validateWebhookUrl(webhookUrl);
  const url = new URL(webhookUrl);
  const hostname = normalizeHostname(url.hostname.toLowerCase());
  if (isIP(hostname)) {
    return {
      url,
      address: hostname,
      family: isIP(hostname),
    };
  }

  let addresses = [];
  try {
    addresses = await lookup(hostname, { all: true, verbatim: true });
  } catch {
    throw new Error('Webhook host could not be resolved');
  }

  if (
    addresses.length === 0 ||
    addresses.some(({ address }) => isNonPublicIpv4(address) || isNonPublicIpv6(address))
  ) {
    throw new Error('Webhook URL must use a public host');
  }

  const address = addresses[0];
  return {
    url,
    address: address.address,
    family: address.family,
  };
}

function postPinnedHttpsJson(target, body, signal) {
  const requestBody = JSON.stringify(body);

  return new Promise((resolve, reject) => {
    let settled = false;
    const req = httpsRequest({
      protocol: 'https:',
      hostname: target.url.hostname,
      port: target.url.port || 443,
      path: `${target.url.pathname}${target.url.search}`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(requestBody),
      },
      servername: target.url.hostname,
      signal,
      lookup: (_hostname, _options, callback) => {
        callback(null, target.address, target.family);
      },
    }, (res) => {
      const chunks = [];
      let receivedBytes = 0;
      res.on('data', (chunk) => {
        if (settled) {
          return;
        }

        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        receivedBytes += buffer.byteLength;
        if (receivedBytes > WEBHOOK_RESPONSE_BODY_LIMIT_BYTES) {
          settled = true;
          reject(new Error(`Webhook response body exceeded ${WEBHOOK_RESPONSE_BODY_LIMIT_BYTES} bytes`));
          req.destroy();
          return;
        }

        chunks.push(buffer);
      });
      res.on('end', () => {
        if (settled) {
          return;
        }

        settled = true;
        const statusCode = res.statusCode ?? 0;
        if (statusCode >= 300 && statusCode < 400) {
          reject(new Error('Webhook redirect responses are not allowed'));
          return;
        }
        if (statusCode < 200 || statusCode >= 300) {
          const responseBody = Buffer.concat(chunks).toString('utf8').trim();
          reject(new Error(responseBody || `Webhook send failed (${statusCode})`));
          return;
        }
        resolve();
      });
    });

    req.on('error', reject);
    req.write(requestBody);
    req.end();
  });
}

function getConfig(db, key) {
  const row = db.prepare('SELECT value FROM config WHERE key = ?').get(key);
  return typeof row?.value === 'string' ? row.value : null;
}

function getConfigValue(db, dbKey, envKey) {
  const dbValue = getConfig(db, dbKey)?.trim() ?? '';
  if (dbValue) {
    return dbValue;
  }

  return process.env[envKey]?.trim() || null;
}

function parseEmailList(value) {
  if (!value) {
    return [];
  }

  return value
    .split(/[\n,]/)
    .map((email) => email.trim())
    .filter(Boolean);
}

function getAlertDeliveryConfig(db) {
  return {
    resendApiKey: getConfigValue(db, 'alert_resend_api_key', 'ALERT_RESEND_API_KEY'),
    fromEmail: getConfigValue(db, 'alert_from_email', 'ALERT_FROM_EMAIL'),
    toEmails: parseEmailList(getConfigValue(db, 'alert_to_email', 'ALERT_TO_EMAIL')),
    webhookUrl: getConfigValue(db, 'alert_webhook_url', 'ALERT_WEBHOOK_URL'),
  };
}

function metricLabel(metric) {
  switch (metric) {
    case 'sc_clicks':
      return 'Search Console clicks';
    case 'ga4_sessions':
      return 'GA4 sessions';
    case 'audit_score':
      return 'audit score';
    default:
      return metric;
  }
}

function formatMetric(metric, value) {
  if (metric === 'audit_score') {
    return `${value.toFixed(1)}%`;
  }

  return Number.isInteger(value) ? value.toLocaleString() : value.toFixed(1);
}

async function sendEmailAlert(config, payload) {
  if (!config.resendApiKey || !config.fromEmail || config.toEmails.length === 0) {
    throw new Error('Email delivery requires Resend API key, from email, and at least one recipient');
  }

  for (const email of [config.fromEmail, ...config.toEmails]) {
    if (!EMAIL_RE.test(email)) {
      throw new Error(`Invalid alert email: ${email}`);
    }
  }

  const previous = formatMetric(payload.metric, payload.previousValue);
  const current = formatMetric(payload.metric, payload.currentValue);
  const subject = `[seo-tools] ${payload.siteName} ${metricLabel(payload.metric)} dropped ${payload.deltaPct.toFixed(1)}%`;
  const text = [
    `${payload.siteName} (${payload.domain}) triggered an alert.`,
    '',
    `Metric: ${metricLabel(payload.metric)}`,
    `Threshold: ${payload.thresholdPct}%`,
    `Drop: ${payload.deltaPct.toFixed(1)}%`,
    `Previous: ${previous}`,
    `Current: ${current}`,
    `Snapshot date: ${payload.snapshotDate}`,
  ].join('\n');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DELIVERY_TIMEOUT_MS);
  let res;

  try {
    res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.resendApiKey}`,
        'Content-Type': 'application/json',
      },
      signal: controller.signal,
      body: JSON.stringify({
        from: config.fromEmail,
        to: config.toEmails,
        subject,
        text,
      }),
    });
  } finally {
    clearTimeout(timeout);
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(body.trim() || `Email send failed (${res.status})`);
  }
}

async function sendWebhookAlert(config, payload) {
  if (!config.webhookUrl) {
    throw new Error('Webhook delivery requires a configured webhook URL');
  }
  const target = await resolveWebhookTarget(config.webhookUrl);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DELIVERY_TIMEOUT_MS);

  try {
    await postPinnedHttpsJson(target, {
      type: 'seo_alert',
      site: {
        id: payload.siteId,
        name: payload.siteName,
        domain: payload.domain,
      },
      alert: {
        metric: payload.metric,
        thresholdPct: payload.thresholdPct,
        previousValue: payload.previousValue,
        currentValue: payload.currentValue,
        deltaPct: payload.deltaPct,
        snapshotDate: payload.snapshotDate,
      },
      sentAt: new Date().toISOString(),
    }, controller.signal);
  } finally {
    clearTimeout(timeout);
  }
}

async function sendAlertNotifications(db, channels, payload) {
  const config = getAlertDeliveryConfig(db);
  const deliveredChannels = [];
  const errors = [];

  for (const channel of channels) {
    try {
      if (channel === 'email') {
        await sendEmailAlert(config, payload);
      } else if (channel === 'webhook') {
        await sendWebhookAlert(config, payload);
      }
      deliveredChannels.push(channel);
    } catch (error) {
      errors.push(`${channel}: ${error.message}`);
    }
  }

  return {
    deliveredChannels,
    deliveryError: errors.length > 0 ? errors.join(' | ') : null,
  };
}

function parseChannels(channelsJson) {
  let raw;
  try {
    raw = JSON.parse(channelsJson);
  } catch {
    return [];
  }

  if (!Array.isArray(raw)) {
    return [];
  }

  return [...new Set(raw.filter((channel) => VALID_CHANNELS.has(channel)))];
}

function getAlertRules(db) {
  return db.prepare(
    'SELECT id, site_id, metric, threshold_pct, channels_json FROM alert_rules ORDER BY site_id ASC, metric ASC, threshold_pct ASC, id ASC',
  ).all()
    .filter((row) => VALID_METRICS.has(row.metric))
    .map((row) => ({
      id: row.id,
      siteId: row.site_id,
      metric: row.metric,
      thresholdPct: row.threshold_pct,
      channels: parseChannels(row.channels_json),
    }))
    .filter((rule) => rule.channels.length > 0);
}

function getSitesById(db) {
  const columns = db.prepare('PRAGMA table_info(sites)').all();
  const hasSearchConsole = columns.some((column) => column.name === 'search_console');
  const searchConsoleSelect = hasSearchConsole ? 'search_console' : '1 as search_console';
  return new Map(
    db.prepare(`SELECT id, name, domain, ${searchConsoleSelect} FROM sites`).all().map((site) => [
      site.id,
      {
        ...site,
        searchConsole: site.search_console !== 0,
      },
    ]),
  );
}

function getMetricSnapshotPoints(db, siteId, metric, snapshotDate) {
  if (metric === 'sc_clicks') {
    return db.prepare(
      `SELECT date, SUM(clicks) as value
       FROM sc_snapshots
       WHERE site_id = ? AND date <= ?
       GROUP BY date
       ORDER BY date DESC
       LIMIT 2`,
    ).all(siteId, snapshotDate);
  }

  if (metric === 'ga4_sessions') {
    return db.prepare(
      `SELECT date, sessions as value
       FROM ga4_snapshots
       WHERE site_id = ? AND date <= ?
       ORDER BY date DESC
       LIMIT 2`,
    ).all(siteId, snapshotDate);
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
  ).all(siteId, snapshotDate);
}

function evaluateAlertBreach(rule, previous, current) {
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

function evaluateAlertRules(db, rules, snapshotDate) {
  const breaches = [];

  for (const rule of rules) {
    const points = getMetricSnapshotPoints(db, rule.siteId, rule.metric, snapshotDate);
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

export function ensureAlertTables(db) {
  db.exec(ALERT_SCHEMA_SQL);
}

export async function processSnapshotAlertsForCli(db, snapshotDate, options = {}) {
  ensureAlertTables(db);

  const rules = getAlertRules(db);
  if (rules.length === 0) {
    return { fired: 0, errors: [] };
  }

  const sendNotifications = options.sendNotifications ?? ((channels, payload) => sendAlertNotifications(db, channels, payload));
  const rulesById = new Map(rules.map((rule) => [rule.id, rule]));
  const sitesById = getSitesById(db);
  const activeRules = rules.filter((rule) => {
    const site = sitesById.get(rule.siteId);
    if (!site) return false;
    return rule.metric !== 'sc_clicks' || site.searchConsole !== false;
  });
  const breaches = evaluateAlertRules(db, activeRules, snapshotDate);
  const hasEvent = db.prepare('SELECT 1 as found FROM alert_events WHERE rule_id = ? AND snapshot_date = ?');
  const insertEvent = db.prepare(
    `INSERT OR IGNORE INTO alert_events (
      site_id, rule_id, metric, threshold_pct, previous_value, current_value, delta_pct, snapshot_date,
      delivered_channels_json, delivery_error
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  let fired = 0;
  const errors = [];

  for (const breach of breaches) {
    if (hasEvent.get(breach.ruleId, breach.snapshotDate)?.found === 1) {
      continue;
    }

    const rule = rulesById.get(breach.ruleId);
    const site = sitesById.get(breach.siteId);
    if (!rule || !site) {
      continue;
    }

    const delivery = await sendNotifications(rule.channels, {
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

    const result = insertEvent.run(
      breach.siteId,
      breach.ruleId,
      breach.metric,
      breach.thresholdPct,
      breach.previousValue,
      breach.currentValue,
      breach.deltaPct,
      breach.snapshotDate,
      JSON.stringify(delivery.deliveredChannels),
      delivery.deliveryError ?? null,
    );

    if ((result.changes ?? 0) > 0) {
      fired += 1;
    }

    if (delivery.deliveryError) {
      errors.push(`Alert ${site.id}/${breach.metric}: ${delivery.deliveryError}`);
    }
  }

  return { fired, errors };
}
