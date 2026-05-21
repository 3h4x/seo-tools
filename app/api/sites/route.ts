import { NextRequest, NextResponse } from 'next/server';
import { dbGetSites, dbUpsertSite, dbDeleteSite } from '@/lib/db';
import { clearGa4DiscoveryCache } from '@/lib/ga4';
import { readJsonBody } from '@/lib/json-body';
import { invalidateManagedSiteCache } from '@/lib/site-cache';
import { validateAndNormalizeSiteInput } from '@/lib/sites';
import { getRequiredQueryParam, siteRouteError, siteRouteOk, siteValidationError } from '@/lib/site-route';

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

export async function GET() {
  try {
    return NextResponse.json(dbGetSites());
  } catch (error) {
    console.error('[GET /api/sites]', error);
    return NextResponse.json({ error: 'failed_to_load_sites' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const parsed = await readJsonBody(req);
  if (!parsed.ok) {
    return siteRouteError('Invalid JSON body');
  }
  if (!isRecord(parsed.body)) {
    return siteRouteError('Request body must be an object');
  }

  let existingSites: ReturnType<typeof dbGetSites>;
  try {
    existingSites = dbGetSites();
  } catch (error) {
    console.error('[POST /api/sites] load', error);
    return siteRouteError('failed_to_load_sites', { status: 500 });
  }

  const result = validateAndNormalizeSiteInput(parsed.body, existingSites);
  if (result.errors) {
    return siteValidationError(result.errors);
  }
  const { site } = result.normalized;
  const previousSite = existingSites.find(s => s.id === site.id) ?? null;

  try {
    dbUpsertSite(site);
    invalidateManagedSiteCache(previousSite, site);
    clearGa4DiscoveryCache();
    return siteRouteOk();
  } catch (error) {
    console.error('[POST /api/sites]', error);
    return siteRouteError('failed_to_save_site', { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const id = getRequiredQueryParam(req.nextUrl.searchParams, 'id');
  if (!id) {
    return siteRouteError('id query param required');
  }

  try {
    const previousSite = dbGetSites().find((managedSite) => managedSite.id === id) ?? null;
    dbDeleteSite(id);
    if (previousSite) {
      invalidateManagedSiteCache(previousSite, null);
    }
    clearGa4DiscoveryCache();
    return siteRouteOk();
  } catch (error) {
    console.error('[DELETE /api/sites]', error);
    return siteRouteError('failed_to_delete_site', { status: 500 });
  }
}
