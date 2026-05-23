import { NextRequest, NextResponse } from 'next/server';
import { dbDeleteAlertRule, dbGetAlertRules, dbGetSites, dbUpsertAlertRule, type AlertChannel, type AlertMetric } from '@/lib/db';
import { parseIntegerParam } from '@/lib/days';
import { readJsonBody } from '@/lib/json-body';

const VALID_METRICS: AlertMetric[] = ['sc_clicks', 'ga4_sessions'];
const VALID_CHANNELS: AlertChannel[] = ['email', 'webhook'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function validateRuleInput(raw: unknown) {
  if (!isRecord(raw)) {
    throw new Error('Request body must be an object');
  }

  const body = raw;
  const siteId = typeof body.siteId === 'string' ? body.siteId.trim() : '';
  const metric = typeof body.metric === 'string' ? body.metric : '';
  const thresholdPct = Number(body.thresholdPct);
  const channels = Array.isArray(body.channels)
    ? [...new Set(body.channels.filter((value): value is AlertChannel => typeof value === 'string' && VALID_CHANNELS.includes(value as AlertChannel)))]
    : [];
  const id = typeof body.id === 'number' ? body.id : undefined;

  if (!siteId) {
    throw new Error('siteId is required');
  }

  if (!VALID_METRICS.includes(metric as AlertMetric)) {
    throw new Error('metric must be one of sc_clicks, ga4_sessions');
  }

  if (!Number.isFinite(thresholdPct) || thresholdPct < 1 || thresholdPct > 100) {
    throw new Error('thresholdPct must be between 1 and 100');
  }

  if (channels.length === 0) {
    throw new Error('Select at least one delivery channel');
  }

  return {
    id,
    siteId,
    metric: metric as AlertMetric,
    thresholdPct: Math.round(thresholdPct),
    channels,
  };
}

export function GET() {
  try {
    return NextResponse.json({ rules: dbGetAlertRules() });
  } catch (error) {
    console.error('[GET /api/alerts/rules]', error);
    return NextResponse.json({ error: 'failed_to_load_alert_rules' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const parsed = await readJsonBody(req);
  if (!parsed.ok) {
    return NextResponse.json({ ok: false, error: 'Invalid JSON body' }, { status: 400 });
  }

  let normalized;
  try {
    normalized = validateRuleInput(parsed.body);
  } catch (error) {
    return NextResponse.json({ ok: false, error: (error as Error).message }, { status: 400 });
  }

  let sites;
  try {
    sites = dbGetSites();
  } catch (error) {
    console.error('[POST /api/alerts/rules] load sites', error);
    return NextResponse.json(
      { ok: false, error: 'failed_to_load_sites' },
      { status: 500 },
    );
  }

  const site = sites.find((entry) => entry.id === normalized.siteId);
  if (!site) {
    return NextResponse.json({ ok: false, error: 'Unknown site' }, { status: 400 });
  }

  if (normalized.metric === 'sc_clicks' && site.searchConsole === false) {
    return NextResponse.json(
      { ok: false, error: 'SC clicks requires Search Console enabled for this site' },
      { status: 400 },
    );
  }

  try {
    const rule = dbUpsertAlertRule(normalized);
    return NextResponse.json({ ok: true, rule });
  } catch (error) {
    console.error('[POST /api/alerts/rules]', error);
    return NextResponse.json(
      { ok: false, error: 'failed_to_save_alert_rule' },
      { status: 500 },
    );
  }
}

export function DELETE(req: NextRequest) {
  const id = parseIntegerParam(req.nextUrl.searchParams.get('id'), Number.NaN);
  if (!Number.isSafeInteger(id) || id <= 0) {
    return NextResponse.json({ ok: false, error: 'id query param required' }, { status: 400 });
  }

  try {
    dbDeleteAlertRule(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[DELETE /api/alerts/rules]', error);
    return NextResponse.json({ ok: false, error: 'delete_failed' }, { status: 500 });
  }
}
