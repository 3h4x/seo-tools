import { clearCache } from '@/lib/db';
import { clearGa4DiscoveryCache } from '@/lib/ga4';
import { NextResponse } from 'next/server';

export async function DELETE() {
  try {
    clearCache();
    clearGa4DiscoveryCache();
    return NextResponse.json({ cleared: true });
  } catch (error) {
    console.error('[DELETE /api/cache]', error);
    return NextResponse.json(
      { cleared: false, error: 'failed_to_clear_cache' },
      { status: 500 },
    );
  }
}
