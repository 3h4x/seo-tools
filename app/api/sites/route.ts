import { NextRequest, NextResponse } from 'next/server';
import { dbGetSites, dbUpsertSite, dbDeleteSite } from '@/lib/db';
import { clearGa4DiscoveryCache } from '@/lib/ga4';
import { readJsonBody } from '@/lib/json-body';
import { invalidateManagedSiteCache } from '@/lib/site-cache';
import { validateAndNormalizeSiteInput } from '@/lib/sites';
import { getRequiredQueryParam, siteRouteError, siteRouteOk, siteValidationError } from '@/lib/site-route';

export async function GET() {
  const sites = dbGetSites();
  return NextResponse.json(sites);
}

export async function POST(req: NextRequest) {
  const parsed = await readJsonBody(req);
  if (!parsed.ok) {
    return siteRouteError('Invalid JSON body');
  }

  const existingSites = dbGetSites();
  const result = validateAndNormalizeSiteInput(parsed.body, existingSites);
  if (result.errors) {
    return siteValidationError(result.errors);
  }
  const { site } = result.normalized;
  const previousSite = existingSites.find(s => s.id === site.id) ?? null;
  dbUpsertSite(site);
  invalidateManagedSiteCache(previousSite, site);
  clearGa4DiscoveryCache();
  return siteRouteOk();
}

export async function DELETE(req: NextRequest) {
  const id = getRequiredQueryParam(req.nextUrl.searchParams, 'id');
  if (!id) {
    return siteRouteError('id query param required');
  }
  const previousSite = dbGetSites().find((managedSite) => managedSite.id === id) ?? null;
  dbDeleteSite(id);
  if (previousSite) {
    invalidateManagedSiteCache(previousSite, null);
  }
  clearGa4DiscoveryCache();
  return siteRouteOk();
}
