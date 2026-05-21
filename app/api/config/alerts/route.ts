import { NextResponse } from 'next/server';
import {
  clearAlertDeliveryConfig,
  getAlertDeliveryConfigResponse,
  saveAlertDeliveryConfig,
  validateAlertDeliveryInput,
} from '@/lib/alert-delivery';
import { readJsonBody } from '@/lib/json-body';

export function GET() {
  return NextResponse.json(getAlertDeliveryConfigResponse());
}

export async function POST(req: Request) {
  const parsed = await readJsonBody(req);
  if (!parsed.ok) {
    return NextResponse.json({ ok: false, error: 'Invalid JSON body' }, { status: 400 });
  }

  try {
    const normalized = validateAlertDeliveryInput(parsed.body);
    saveAlertDeliveryConfig(normalized);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ ok: false, error: (error as Error).message }, { status: 400 });
  }
}

export function DELETE() {
  clearAlertDeliveryConfig();
  return NextResponse.json({ ok: true });
}
