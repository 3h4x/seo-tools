import { clearCache } from '@/lib/db';
import { clearGa4DiscoveryCache } from '@/lib/ga4';
import { NextResponse } from 'next/server';

export async function DELETE() {
  clearCache();
  clearGa4DiscoveryCache();
  return NextResponse.json({ cleared: true });
}
