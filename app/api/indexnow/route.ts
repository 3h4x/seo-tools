import { NextRequest, NextResponse } from 'next/server';
import { getManagedSite } from '@/lib/sites';
import { clearCacheEntry } from '@/lib/db';
import { checkIndexNowKey, submitIndexNowForSite } from '@/lib/indexnow.js';

function getSiteId(body: unknown): string {
  if (typeof body !== 'object' || body === null || !('siteId' in body)) {
    return '';
  }

  const siteId = (body as { siteId?: unknown }).siteId;
  return typeof siteId === 'string' ? siteId.trim() : '';
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const siteId = getSiteId(body);

  if (!siteId) {
    return NextResponse.json({ error: 'siteId is required' }, { status: 400 });
  }

  const site = await getManagedSite(siteId);
  if (!site) {
    return NextResponse.json({ error: `Unknown site: ${siteId}` }, { status: 404 });
  }

  try {
    const keyCheck = await checkIndexNowKey(site);
    if (keyCheck.status !== 'pass') {
      return NextResponse.json({ error: keyCheck.message, details: keyCheck.details }, { status: 400 });
    }

    const result = await submitIndexNowForSite(site);
    clearCacheEntry('audit', site.id);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error('[POST /api/indexnow]', error);
    const message = error instanceof Error ? error.message : 'IndexNow submission failed';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
