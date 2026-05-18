import { NextResponse } from 'next/server';
import {
  clearAlertDeliveryConfig,
  getAlertDeliveryConfigResponse,
  saveAlertDeliveryConfig,
  validateAlertDeliveryInput,
} from '@/lib/alert-delivery';

export function GET() {
  return NextResponse.json(getAlertDeliveryConfigResponse());
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const normalized = validateAlertDeliveryInput(body);
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
