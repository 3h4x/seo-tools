import { NextResponse } from 'next/server';
import { getOperationalStatuses } from '@/lib/db';

export async function GET() {
  try {
    return NextResponse.json({ statuses: await getOperationalStatuses() });
  } catch (error) {
    console.error('[GET /api/config/operations]', error);
    return NextResponse.json({ error: 'failed_to_load_operational_status' }, { status: 500 });
  }
}
