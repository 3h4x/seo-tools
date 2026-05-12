import { NextResponse } from 'next/server';
import { getOperationalStatuses } from '@/lib/db';

export function GET() {
  try {
    return NextResponse.json({ statuses: getOperationalStatuses() });
  } catch (error) {
    console.error('[GET /api/config/operations]', error);
    return NextResponse.json({ error: 'failed_to_load_operational_status' }, { status: 500 });
  }
}
