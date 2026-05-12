import { NextResponse } from 'next/server';
import { getSiteDiagnostics } from '@/lib/site-diagnostics';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const diagnostics = await getSiteDiagnostics();
    return NextResponse.json(
      { diagnostics },
      {
        headers: {
          'Cache-Control': 'no-store',
        },
      },
    );
  } catch (error) {
    console.error('[GET /api/config/site-diagnostics]', error);
    return NextResponse.json({ error: 'failed_to_load_site_diagnostics' }, { status: 500 });
  }
}
