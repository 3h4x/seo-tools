import { NextRequest, NextResponse } from 'next/server';
import { getManagedSite } from '@/lib/sites';
import { clearCacheEntry } from '@/lib/db';
import { checkIndexNowKey, submitIndexNowForSite } from '@/lib/indexnow.js';

export async function POST(req: NextRequest) {
  const body = await req.json() as { siteId?: string };
  const siteId = body.siteId?.trim();

  if (!siteId) {
    return NextResponse.json({ error: 'siteId is required' }, { status: 400 });
  }

  const site = await getManagedSite(siteId);
  if (!site) {
    return NextResponse.json({ error: `Unknown site: ${siteId}` }, { status: 404 });
  }

  const keyCheck = await checkIndexNowKey(site);
  if (keyCheck.status !== 'pass') {
    return NextResponse.json({ error: keyCheck.message, details: keyCheck.details }, { status: 400 });
  }

  try {
    const result = await submitIndexNowForSite(site);
    clearCacheEntry('audit', site.id);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'IndexNow submission failed';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
