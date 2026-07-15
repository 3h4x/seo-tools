import { NextResponse } from 'next/server';
import { getManagedSite } from '@/lib/sites';
import { registerCwvCustomDefinitions } from '@/lib/ga4';
import { getRouteSiteParam, siteNotFoundError, siteRouteError } from '@/lib/site-route';

export async function POST(
  _req: Request,
  context: { params: Promise<{ site: string }> },
) {
  try {
    const site = await getRouteSiteParam(context);

    const siteConfig = await getManagedSite(site);
    if (!siteConfig) {
      return siteNotFoundError();
    }
    if (!siteConfig.ga4PropertyId) {
      return siteRouteError('no_ga4_property_configured', { status: 400 });
    }

    const result = await registerCwvCustomDefinitions(siteConfig.ga4PropertyId);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error('[POST /api/[site]/register-cwv]', error);
    return NextResponse.json({ error: 'failed_to_register_cwv_definitions' }, { status: 500 });
  }
}
