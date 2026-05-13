import { NextRequest, NextResponse } from 'next/server';
import { dbReorderSites } from '@/lib/db';
import { parseOrderedSiteIds, siteRouteError, siteRouteOk } from '@/lib/site-route';

export async function PUT(req: NextRequest) {
  const body = await req.json() as { orderedIds?: unknown };
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
