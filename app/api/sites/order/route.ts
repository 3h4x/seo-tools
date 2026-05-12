import { NextRequest, NextResponse } from 'next/server';
import { dbReorderSites } from '@/lib/db';

export async function PUT(req: NextRequest) {
  const body = await req.json() as { orderedIds?: unknown };
  const orderedIds = body.orderedIds;

  if (!Array.isArray(orderedIds) || orderedIds.some(id => typeof id !== 'string' || id.trim() === '')) {
    return NextResponse.json(
      { ok: false, error: 'orderedIds must be an array of site ids' },
      { status: 400 },
    );
  }

  try {
    dbReorderSites(orderedIds);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'Failed to reorder sites' },
      { status: 400 },
    );
  }
}
