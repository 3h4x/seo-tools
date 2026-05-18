import { lookup } from 'node:dns/promises';
import { request as httpsRequest } from 'node:https';
import { isIP } from 'node:net';
import type { LookupAddress } from 'node:dns';
import { deleteConfig, getConfig, setConfig, type AlertChannel, type AlertMetric } from './db';

type ConfigSource = 'db' | 'env' | 'none';

type AlertDeliveryConfigKey = 'resendApiKey' | 'fromEmail' | 'toEmail' | 'webhookUrl';

type AlertDeliveryStored = Record<AlertDeliveryConfigKey, string>;

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

const CONFIG_KEYS: Record<AlertDeliveryConfigKey, { db: string; env: string }> = {
  resendApiKey: { db: 'alert_resend_api_key', env: 'ALERT_RESEND_API_KEY' },
  fromEmail: { db: 'alert_from_email', env: 'ALERT_FROM_EMAIL' },
  toEmail: { db: 'alert_to_email', env: 'ALERT_TO_EMAIL' },
  webhookUrl: { db: 'alert_webhook_url', env: 'ALERT_WEBHOOK_URL' },
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DELIVERY_TIMEOUT_MS = 10_000;
const PRIVATE_IPV4_RANGES = [
  { start: ipv4ToInt('10.0.0.0'), end: ipv4ToInt('10.255.255.255') },
  { start: ipv4ToInt('127.0.0.0'), end: ipv4ToInt('127.255.255.255') },
  { start: ipv4ToInt('169.254.0.0'), end: ipv4ToInt('169.254.255.255') },
  { start: ipv4ToInt('172.16.0.0'), end: ipv4ToInt('172.31.255.255') },
  { start: ipv4ToInt('192.168.0.0'), end: ipv4ToInt('192.168.255.255') },
  { start: ipv4ToInt('0.0.0.0'), end: ipv4ToInt('0.255.255.255') },
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

async function sendEmailAlert(config: AlertDeliveryConfig, payload: AlertNotificationPayload): Promise<void> {
  if (!config.resendApiKey || !config.fromEmail || config.toEmails.length === 0) {
    throw new Error('Email delivery requires Resend API key, from email, and at least one recipient');
  }

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
        html: `<p><strong>${payload.siteName}</strong> (${payload.domain}) triggered an alert.</p>
<ul>
  <li>Metric: ${metricLabel(payload.metric)}</li>
  <li>Threshold: ${payload.thresholdPct}%</li>
  <li>Drop: ${payload.deltaPct.toFixed(1)}%</li>
  <li>Previous: ${previous}</li>
  <li>Current: ${current}</li>
  <li>Snapshot date: ${payload.snapshotDate}</li>
</ul>`,
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

function postPinnedHttpsJson(target: ResolvedWebhookTarget, body: unknown, signal: AbortSignal): Promise<void> {
  const requestBody = JSON.stringify(body);

  return new Promise((resolve, reject) => {
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
      res.on('data', (chunk: Buffer | string) => {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      });
      res.on('end', () => {
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

function isPrivateIpv4(hostname: string): boolean {
  const normalized = getIpv4MappedIpv6(hostname) ?? normalizeHostname(hostname);
  if (isIP(normalized) !== 4) {
    return false;
  }

  const value = ipv4ToInt(normalized);
  return PRIVATE_IPV4_RANGES.some((range) => value >= range.start && value <= range.end);
}

function isPrivateIpv6(hostname: string): boolean {
  const normalized = normalizeHostname(hostname).toLowerCase();
  if (isIP(normalized) !== 6) {
    return false;
  }

  return normalized === '::1' ||
    normalized === '::' ||
    getIpv4MappedIpv6(normalized) !== null ||
    normalized.startsWith('fc') ||
    normalized.startsWith('fd') ||
    normalized.startsWith('fe80:');
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
    isPrivateIpv4(hostname) ||
    isPrivateIpv6(hostname)
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
  try {
    addresses = await lookup(hostname, { all: true, verbatim: true });
  } catch {
    throw new Error('Webhook host could not be resolved');
  }

  if (
    addresses.length === 0 ||
    addresses.some(({ address }) => isPrivateIpv4(address) || isPrivateIpv6(address))
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
  const body = raw as Record<string, unknown>;
  const resendApiKey = typeof body.resendApiKey === 'string' ? body.resendApiKey.trim() : '';
  const fromEmail = typeof body.fromEmail === 'string' ? body.fromEmail.trim() : '';
  const toEmail = typeof body.toEmail === 'string' ? body.toEmail.trim() : '';
  const webhookUrl = typeof body.webhookUrl === 'string' ? body.webhookUrl.trim() : '';

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
  };
}

export function saveAlertDeliveryConfig(config: AlertDeliveryStored): void {
  for (const [field, value] of Object.entries(config) as Array<[AlertDeliveryConfigKey, string]>) {
    const dbKey = CONFIG_KEYS[field].db;
    if (value) {
      setConfig(dbKey, value);
    } else if (field !== 'resendApiKey' && field !== 'webhookUrl') {
      deleteConfig(dbKey);
    }
  }
}

export function clearAlertDeliveryConfig(): void {
  for (const { db } of Object.values(CONFIG_KEYS)) {
    deleteConfig(db);
  }
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
      errors.push(`${channel}: ${(error as Error).message}`);
    }
  }

  return {
    deliveredChannels,
    deliveryError: errors.length > 0 ? errors.join(' | ') : null,
  };
}
