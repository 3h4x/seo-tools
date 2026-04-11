import { NextRequest, NextResponse } from 'next/server';
import { dbGetSites, dbUpsertSite, dbDeleteSite } from '@/lib/db';
import type { Site } from '@/lib/sites';

export async function GET() {
  const sites = dbGetSites();
  return NextResponse.json(sites);
}

export async function POST(req: NextRequest) {
  const body = await req.json() as Site & { sortOrder?: number };
  const { sortOrder, ...site } = body;

  if (!site.id || !site.name || !site.domain) {
    return NextResponse.json({ ok: false, error: 'id, name, and domain are required' }, { status: 400 });
  }

  dbUpsertSite(site, sortOrder);
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id');
  if (!id) {
    return NextResponse.json({ ok: false, error: 'id query param required' }, { status: 400 });
  }
  dbDeleteSite(id);
  return NextResponse.json({ ok: true });
}
