import { NextRequest, NextResponse } from 'next/server';
import { dbReorderSites } from '@/lib/db';
import { readJsonBody } from '@/lib/json-body';
import { parseOrderedSiteIds, siteRouteError, siteRouteOk } from '@/lib/site-route';

const VALIDATION_MESSAGE_PREFIXES = [
  'orderedIds must',
  'unknown site id',
];

function isValidationMessage(message: string): boolean {
  return VALIDATION_MESSAGE_PREFIXES.some((prefix) => message.startsWith(prefix));
}

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
    const message = error instanceof Error ? error.message : '';
    if (isValidationMessage(message)) {
      return siteRouteError(message);
    }
    console.error('[PUT /api/sites/order]', error);
    return NextResponse.json(
      { ok: false, error: 'failed_to_reorder_sites' },
      { status: 500 },
    );
  }
}
