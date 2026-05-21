import { NextResponse } from 'next/server';
import {
  clearAlertDeliveryConfig,
  getAlertDeliveryConfigResponse,
  saveAlertDeliveryConfig,
  validateAlertDeliveryInput,
} from '@/lib/alert-delivery';
import { readJsonBody } from '@/lib/json-body';

export function GET() {
  try {
    return NextResponse.json(getAlertDeliveryConfigResponse());
  } catch (error) {
    console.error('[GET /api/config/alerts]', error);
    return NextResponse.json(
      { ok: false, error: 'failed_to_load_alert_config' },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  const parsed = await readJsonBody(req);
  if (!parsed.ok) {
    return NextResponse.json({ ok: false, error: 'Invalid JSON body' }, { status: 400 });
  }

  let normalized;
  try {
    normalized = validateAlertDeliveryInput(parsed.body);
  } catch (error) {
    return NextResponse.json({ ok: false, error: (error as Error).message }, { status: 400 });
  }

  try {
    saveAlertDeliveryConfig(normalized);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[POST /api/config/alerts]', error);
    return NextResponse.json(
      { ok: false, error: 'failed_to_save_alert_config' },
      { status: 500 },
    );
  }
}

export function DELETE() {
  try {
    clearAlertDeliveryConfig();
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[DELETE /api/config/alerts]', error);
    return NextResponse.json(
      { ok: false, error: 'failed_to_clear_alert_config' },
      { status: 500 },
    );
  }
}
