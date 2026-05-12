import { NextRequest, NextResponse } from 'next/server';
import { dbGetSites, dbUpsertSite, dbDeleteSite } from '@/lib/db';
import { clearGa4DiscoveryCache } from '@/lib/ga4';
import { invalidateManagedSiteCache } from '@/lib/site-cache';
import { validateAndNormalizeSiteInput } from '@/lib/sites';

export async function GET() {
  const sites = dbGetSites();
  return NextResponse.json(sites);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const existingSites = dbGetSites();
  const result = validateAndNormalizeSiteInput(body, existingSites);
  if (result.errors) {
    const error = Object.values(result.errors).filter(Boolean).join('; ');
    return NextResponse.json({ ok: false, error, errors: result.errors }, { status: 400 });
  }
  const { site } = result.normalized;
  const previousSite = existingSites.find(s => s.id === site.id) ?? null;
  dbUpsertSite(site);
  invalidateManagedSiteCache(previousSite, site);
  clearGa4DiscoveryCache();
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id');
  if (!id) {
    return NextResponse.json({ ok: false, error: 'id query param required' }, { status: 400 });
  }
  const previousSite = dbGetSites().find((managedSite) => managedSite.id === id) ?? null;
  dbDeleteSite(id);
  if (previousSite) {
    invalidateManagedSiteCache(previousSite, null);
  }
  clearGa4DiscoveryCache();
  return NextResponse.json({ ok: true });
}
