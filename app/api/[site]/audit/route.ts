import { NextResponse } from 'next/server';
import { getManagedSite } from '@/lib/sites';
import { cachedAuditSite } from '@/lib/audit';
import { getRouteSiteParam, siteNotFoundError } from '@/lib/site-route';

export async function GET(
  _req: Request,
  context: { params: Promise<{ site: string }> },
) {
  try {
    const site = await getRouteSiteParam(context);

    const siteConfig = await getManagedSite(site);
    if (!siteConfig) {
      return siteNotFoundError();
    }

    const result = await cachedAuditSite(siteConfig);
    return NextResponse.json({ data: result });
  } catch (error) {
    console.error('[GET /api/[site]/audit]', error);
    return NextResponse.json({ error: 'failed_to_fetch_audit' }, { status: 500 });
  }
}
