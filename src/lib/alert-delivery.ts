import { lookup } from 'node:dns/promises';
import { request as httpsRequest } from 'node:https';
import { isIP } from 'node:net';
import type { LookupAddress } from 'node:dns';
import { deleteConfig, getConfig, setConfig, type AlertChannel, type AlertMetric } from './db';

type ConfigSource = 'db' | 'env' | 'none';

type AlertDeliveryConfigKey = 'resendApiKey' | 'fromEmail' | 'toEmail' | 'webhookUrl';

type AlertDeliveryStored = Record<AlertDeliveryConfigKey, string> & {
  weeklyDigestEnabled: boolean;
};

export interface AlertDeliveryConfig {
  resendApiKey: string | null;
  fromEmail: string | null;
  toEmails: string[];
  webhookUrl: string | null;
}

export interface AlertDeliveryConfigResponse {
  config: {
    fromEmail: string;
    toEmail: string;
    hasResendApiKey: boolean;
    hasWebhookUrl: boolean;
    weeklyDigestEnabled: boolean;
  };
  sources: Record<AlertDeliveryConfigKey, ConfigSource>;
}

export interface AlertNotificationPayload {
  siteId: string;
  siteName: string;
  domain: string;
  metric: AlertMetric;
  thresholdPct: number;
  previousValue: number;
  currentValue: number;
  deltaPct: number;
  snapshotDate: string;
}

export interface AlertDeliveryResult {
  deliveredChannels: AlertChannel[];
  deliveryError: string | null;
}

export interface WeeklyDigestSiteSummary {
  siteName: string;
  domain: string;
  scClicks: MetricDigestValue | null;
  ga4Sessions: MetricDigestValue | null;
  auditScore: MetricDigestValue | null;
}

export interface MetricDigestValue {
  current: number;
  previous: number | null;
  deltaPct: number | null;
}

export interface WeeklyDigestEmailPayload {
  snapshotDate: string;
  previousDate: string;
  alertCount: number;
  sites: WeeklyDigestSiteSummary[];
}

const CONFIG_KEYS: Record<AlertDeliveryConfigKey, { db: string; env: string }> = {
  resendApiKey: { db: 'alert_resend_api_key', env: 'ALERT_RESEND_API_KEY' },
  fromEmail: { db: 'alert_from_email', env: 'ALERT_FROM_EMAIL' },
  toEmail: { db: 'alert_to_email', env: 'ALERT_TO_EMAIL' },
  webhookUrl: { db: 'alert_webhook_url', env: 'ALERT_WEBHOOK_URL' },
};

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

interface ResolvedWebhookTarget {
  url: URL;
  address: string;
  family: 4 | 6;
}

function ipv4ToInt(value: string): number {
  return value.split('.').reduce((acc, part) => (acc * 256) + Number(part), 0);
}

function ipv4IntToString(value: number): string {
  return [
    (value >>> 24) & 255,
    (value >>> 16) & 255,
    (value >>> 8) & 255,
    value & 255,
  ].join('.');
}

function getIpv4MappedIpv6(hostname: string): string | null {
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

function getIpv4CompatibleIpv6(hostname: string): string | null {
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

function parseIpv6Hextets(hostname: string): number[] | null {
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

function getConfigValue(key: AlertDeliveryConfigKey): { value: string | null; source: ConfigSource } {
  const { db, env } = CONFIG_KEYS[key];
  const dbValue = getConfig(db)?.trim() ?? '';
  if (dbValue) {
    return { value: dbValue, source: 'db' };
  }

  const envValue = process.env[env]?.trim() ?? '';
  if (envValue) {
    return { value: envValue, source: 'env' };
  }

  return { value: null, source: 'none' };
}

function parseEmailList(value: string | null): string[] {
  if (!value) {
    return [];
  }

  return value
    .split(/[\n,]/)
    .map((email) => email.trim())
    .filter(Boolean);
}

function formatMetric(metric: AlertMetric, value: number): string {
  if (metric === 'audit_score') {
    return `${value.toFixed(1)}%`;
  }

  return Number.isInteger(value) ? value.toLocaleString() : value.toFixed(1);
}

function metricLabel(metric: AlertMetric): string {
  switch (metric) {
    case 'sc_clicks':
      return 'Search Console clicks';
    case 'ga4_sessions':
      return 'GA4 sessions';
    case 'audit_score':
      return 'audit score';
  }
}

function getWeeklyDigestEnabled(): boolean {
  return getConfig('alert_weekly_digest_enabled') === '1';
}

async function sendResendEmail(
  config: AlertDeliveryConfig,
  subject: string,
  text: string,
  html: string,
): Promise<void> {
  if (!config.resendApiKey || !config.fromEmail || config.toEmails.length === 0) {
    throw new Error('Email delivery requires Resend API key, from email, and at least one recipient');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DELIVERY_TIMEOUT_MS);
  let res: Response;

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
        html,
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

async function sendEmailAlert(config: AlertDeliveryConfig, payload: AlertNotificationPayload): Promise<void> {
  const subject = `[seo-tools] ${payload.siteName} ${metricLabel(payload.metric)} dropped ${payload.deltaPct.toFixed(1)}%`;
  const previous = formatMetric(payload.metric, payload.previousValue);
  const current = formatMetric(payload.metric, payload.currentValue);
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

  await sendResendEmail(config, subject, text, `<p><strong>${payload.siteName}</strong> (${payload.domain}) triggered an alert.</p>
<ul>
  <li>Metric: ${metricLabel(payload.metric)}</li>
  <li>Threshold: ${payload.thresholdPct}%</li>
  <li>Drop: ${payload.deltaPct.toFixed(1)}%</li>
  <li>Previous: ${previous}</li>
  <li>Current: ${current}</li>
  <li>Snapshot date: ${payload.snapshotDate}</li>
</ul>`);
}

function postPinnedHttpsJson(target: ResolvedWebhookTarget, body: unknown, signal: AbortSignal): Promise<void> {
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
      const chunks: Buffer[] = [];
      let receivedBytes = 0;
      res.on('data', (chunk: Buffer | string) => {
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

async function sendWebhookAlert(config: AlertDeliveryConfig, payload: AlertNotificationPayload): Promise<void> {
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

function isNonPublicIpv4(hostname: string): boolean {
  const normalized = getIpv4MappedIpv6(hostname) ?? normalizeHostname(hostname);
  if (isIP(normalized) !== 4) {
    return false;
  }

  const value = ipv4ToInt(normalized);
  return NON_PUBLIC_IPV4_RANGES.some((range) => value >= range.start && value <= range.end);
}

function isNonPublicIpv6(hostname: string): boolean {
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

function normalizeHostname(hostname: string): string {
  return hostname.startsWith('[') && hostname.endsWith(']')
    ? hostname.slice(1, -1)
    : hostname;
}

function validateWebhookUrl(webhookUrl: string): void {
  let parsed: URL;
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

async function resolveWebhookTarget(webhookUrl: string): Promise<ResolvedWebhookTarget> {
  validateWebhookUrl(webhookUrl);
  const url = new URL(webhookUrl);
  const hostname = normalizeHostname(url.hostname.toLowerCase());
  if (isIP(hostname)) {
    return {
      url,
      address: hostname,
      family: isIP(hostname) as 4 | 6,
    };
  }

  let addresses: LookupAddress[] = [];
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    addresses = await Promise.race([
      lookup(hostname, { all: true, verbatim: true }),
      new Promise<LookupAddress[]>((_, reject) => {
        timer = setTimeout(() => reject(new Error('Webhook host resolution timed out')), DELIVERY_TIMEOUT_MS);
      }),
    ]);
  } catch {
    throw new Error('Webhook host could not be resolved');
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
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
    family: address.family as 4 | 6,
  };
}

export function getAlertDeliveryConfig(): AlertDeliveryConfig {
  const resendApiKey = getConfigValue('resendApiKey').value;
  const fromEmail = getConfigValue('fromEmail').value;
  const toEmail = getConfigValue('toEmail').value;
  const webhookUrl = getConfigValue('webhookUrl').value;

  return {
    resendApiKey,
    fromEmail,
    toEmails: parseEmailList(toEmail),
    webhookUrl,
  };
}

export function getAlertDeliveryConfigResponse(): AlertDeliveryConfigResponse {
  const resendApiKey = getConfigValue('resendApiKey');
  const fromEmail = getConfigValue('fromEmail');
  const toEmail = getConfigValue('toEmail');
  const webhookUrl = getConfigValue('webhookUrl');

  return {
    config: {
      fromEmail: fromEmail.value ?? '',
      toEmail: toEmail.value ?? '',
      hasResendApiKey: Boolean(resendApiKey.value),
      hasWebhookUrl: Boolean(webhookUrl.value),
      weeklyDigestEnabled: getWeeklyDigestEnabled(),
    },
    sources: {
      resendApiKey: resendApiKey.source,
      fromEmail: fromEmail.source,
      toEmail: toEmail.source,
      webhookUrl: webhookUrl.source,
    },
  };
}

export function validateAlertDeliveryInput(raw: unknown): AlertDeliveryStored {
  const body = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
  const resendApiKey = typeof body.resendApiKey === 'string' ? body.resendApiKey.trim() : '';
  const fromEmail = typeof body.fromEmail === 'string' ? body.fromEmail.trim() : '';
  const toEmail = typeof body.toEmail === 'string' ? body.toEmail.trim() : '';
  const webhookUrl = typeof body.webhookUrl === 'string' ? body.webhookUrl.trim() : '';
  const weeklyDigestEnabled = body.weeklyDigestEnabled === true;

  if (fromEmail && !EMAIL_RE.test(fromEmail)) {
    throw new Error('From email must be a valid email address');
  }

  for (const email of parseEmailList(toEmail)) {
    if (!EMAIL_RE.test(email)) {
      throw new Error(`Invalid recipient email: ${email}`);
    }
  }

  if (webhookUrl) {
    validateWebhookUrl(webhookUrl);
  }

  return {
    resendApiKey,
    fromEmail,
    toEmail,
    webhookUrl,
    weeklyDigestEnabled,
  };
}

export function saveAlertDeliveryConfig(config: AlertDeliveryStored): void {
  for (const field of Object.keys(CONFIG_KEYS) as AlertDeliveryConfigKey[]) {
    const value = config[field];
    const dbKey = CONFIG_KEYS[field].db;
    if (value) {
      setConfig(dbKey, value);
    } else if (field !== 'resendApiKey' && field !== 'webhookUrl') {
      deleteConfig(dbKey);
    }
  }
  setConfig('alert_weekly_digest_enabled', config.weeklyDigestEnabled ? '1' : '0');
}

export function clearAlertDeliveryConfig(): void {
  for (const { db } of Object.values(CONFIG_KEYS)) {
    deleteConfig(db);
  }
  deleteConfig('alert_weekly_digest_enabled');
}

export async function sendAlertNotifications(
  channels: AlertChannel[],
  payload: AlertNotificationPayload,
): Promise<AlertDeliveryResult> {
  const config = getAlertDeliveryConfig();
  const deliveredChannels: AlertChannel[] = [];
  const errors: string[] = [];

  for (const channel of channels) {
    try {
      if (channel === 'email') {
        await sendEmailAlert(config, payload);
      } else if (channel === 'webhook') {
        await sendWebhookAlert(config, payload);
      }
      deliveredChannels.push(channel);
    } catch (error) {
      errors.push(`${channel}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return {
    deliveredChannels,
    deliveryError: errors.length > 0 ? errors.join(' | ') : null,
  };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatDigestValue(value: MetricDigestValue | null, suffix = ''): string {
  if (!value) return 'n/a';
  const formatted = Number.isInteger(value.current) ? value.current.toLocaleString() : value.current.toFixed(1);
  if (value.deltaPct === null) return `${formatted}${suffix}`;
  const sign = value.deltaPct > 0 ? '+' : '';
  return `${formatted}${suffix} (${sign}${value.deltaPct.toFixed(1)}%)`;
}

export async function sendWeeklyDigestEmail(payload: WeeklyDigestEmailPayload): Promise<AlertDeliveryResult> {
  const config = getAlertDeliveryConfig();
  const subject = `[seo-tools] Weekly SEO digest for ${payload.snapshotDate}`;
  const rows = payload.sites.map((site) => [
    `${site.siteName} (${site.domain})`,
    `SC clicks: ${formatDigestValue(site.scClicks)}`,
    `GA4 sessions: ${formatDigestValue(site.ga4Sessions)}`,
    `Audit score: ${formatDigestValue(site.auditScore, '%')}`,
  ].join('\n  '));
  const text = [
    `Weekly SEO digest for ${payload.snapshotDate}`,
    `Compared with ${payload.previousDate}`,
    `Alerts fired this week: ${payload.alertCount}`,
    '',
    ...rows,
  ].join('\n\n');
  const htmlRows = payload.sites.map((site) => `<tr>
  <td>${escapeHtml(site.siteName)}<br><span>${escapeHtml(site.domain)}</span></td>
  <td>${escapeHtml(formatDigestValue(site.scClicks))}</td>
  <td>${escapeHtml(formatDigestValue(site.ga4Sessions))}</td>
  <td>${escapeHtml(formatDigestValue(site.auditScore, '%'))}</td>
</tr>`).join('');

  try {
    await sendResendEmail(
      config,
      subject,
      text,
      `<p><strong>Weekly SEO digest for ${payload.snapshotDate}</strong></p>
<p>Compared with ${payload.previousDate}. Alerts fired this week: ${payload.alertCount}.</p>
<table>
  <thead><tr><th>Site</th><th>SC clicks</th><th>GA4 sessions</th><th>Audit score</th></tr></thead>
  <tbody>${htmlRows}</tbody>
</table>`,
    );
    return { deliveredChannels: ['email'], deliveryError: null };
  } catch (error) {
    return { deliveredChannels: [], deliveryError: `email: ${error instanceof Error ? error.message : String(error)}` };
  }
}
