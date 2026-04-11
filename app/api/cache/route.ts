import { clearCache } from '@/lib/db';
import { NextResponse } from 'next/server';

export async function DELETE() {
  clearCache();
  return NextResponse.json({ cleared: true });
}
