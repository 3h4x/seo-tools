import { NextRequest, NextResponse } from 'next/server';
import { dbDeleteAlertRule, dbGetAlertRules, dbGetSites, dbUpsertAlertRule, type AlertChannel, type AlertMetric } from '@/lib/db';
import { readJsonBody } from '@/lib/json-body';

const VALID_METRICS: AlertMetric[] = ['sc_clicks', 'ga4_sessions'];
const VALID_CHANNELS: AlertChannel[] = ['email', 'webhook'];

function validateRuleInput(raw: unknown) {
  const body = raw as Record<string, unknown>;
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

  if (!dbGetSites().some((site) => site.id === siteId)) {
    throw new Error('Unknown site');
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
  return NextResponse.json({ rules: dbGetAlertRules() });
}

export async function POST(req: Request) {
  const parsed = await readJsonBody(req);
  if (!parsed.ok) {
    return NextResponse.json({ ok: false, error: 'Invalid JSON body' }, { status: 400 });
  }

  try {
    const rule = dbUpsertAlertRule(validateRuleInput(parsed.body));
    return NextResponse.json({ ok: true, rule });
  } catch (error) {
    return NextResponse.json({ ok: false, error: (error as Error).message }, { status: 400 });
  }
}

export function DELETE(req: NextRequest) {
  const rawId = req.nextUrl.searchParams.get('id');
  const id = rawId ? Number(rawId) : NaN;
  if (!Number.isFinite(id)) {
    return NextResponse.json({ ok: false, error: 'id query param required' }, { status: 400 });
  }

  dbDeleteAlertRule(id);
  return NextResponse.json({ ok: true });
}
