import { NextRequest, NextResponse } from 'next/server';
import { dbReorderSites } from '@/lib/db';
import { readJsonBody } from '@/lib/json-body';
import { parseOrderedSiteIds, siteRouteError, siteRouteOk } from '@/lib/site-route';

export async function PUT(req: NextRequest) {
  const parsed = await readJsonBody(req);
  if (!parsed.ok) {
    return siteRouteError('Invalid JSON body');
  }

  const body = parsed.body as { orderedIds?: unknown };
  const orderedIds = parseOrderedSiteIds(body.orderedIds);

  if (!orderedIds) {
    return siteRouteError('orderedIds must be an array of site ids');
  }

  try {
    dbReorderSites(orderedIds);
    return siteRouteOk();
  } catch (error) {
    return siteRouteError(error instanceof Error ? error.message : 'Failed to reorder sites');
  }
}
