import { NextRequest, NextResponse } from 'next/server';
import { dbGetSites, dbUpsertSite, dbDeleteSite } from '@/lib/db';
import { invalidateManagedSiteCache } from '@/lib/site-cache';
import { getSiteScUrlOverride, normalizeSiteDomain } from '@/lib/site-domain';
import type { Site } from '@/lib/sites';

export async function GET() {
  const sites = dbGetSites();
  return NextResponse.json(sites);
}

export async function POST(req: NextRequest) {
  const body = await req.json() as Site & { sortOrder?: number };
  const { sortOrder, ...site } = body;
  const id = typeof site.id === 'string' ? site.id.trim() : '';
  const name = typeof site.name === 'string' ? site.name.trim() : '';
  const rawDomain = typeof site.domain === 'string' ? site.domain.trim() : '';
  const domain = rawDomain ? normalizeSiteDomain(rawDomain) : null;

  if (!id || !name || !domain) {
    return NextResponse.json({ ok: false, error: 'id, name, and valid domain are required' }, { status: 400 });
  }

  const scUrl = getSiteScUrlOverride(rawDomain, typeof site.scUrl === 'string' ? site.scUrl : undefined);
  const normalizedSite: Site = {
    ...site,
    id,
    name,
    domain,
    testPages: Array.isArray(site.testPages) ? site.testPages.map(page => page.trim()).filter(Boolean) : [],
  };
  if (scUrl) normalizedSite.scUrl = scUrl;
  if (typeof site.ga4PropertyId === 'string') normalizedSite.ga4PropertyId = site.ga4PropertyId.trim() || undefined;
  if (Array.isArray(site.skipChecks)) normalizedSite.skipChecks = site.skipChecks;

  const previousSite = dbGetSites().find((managedSite) => managedSite.id === normalizedSite.id) ?? null;
  dbUpsertSite(normalizedSite, sortOrder);
  invalidateManagedSiteCache(previousSite, normalizedSite);
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
  return NextResponse.json({ ok: true });
}
