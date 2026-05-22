import { NextRequest, NextResponse } from 'next/server';
import { getManagedSite, getSCUrl } from '@/lib/sites';
import { cachedGetTopPagesWithQueries } from '@/lib/search-console';
import { VALID_DAYS } from '@/lib/constants';
import { parseAllowedIntegerParam } from '@/lib/days';
import { getRouteSiteParam, siteNotFoundError } from '@/lib/site-route';

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ site: string }> },
) {
  try {
    const site = await getRouteSiteParam(context);
    const days = parseAllowedIntegerParam(req.nextUrl.searchParams.get('days'), VALID_DAYS, 7);

    const siteConfig = await getManagedSite(site);
    if (!siteConfig) {
      return siteNotFoundError();
    }

    if (!siteConfig.searchConsole) {
      return NextResponse.json({ data: [] });
    }

    const scUrl = getSCUrl(siteConfig);
    const data = await cachedGetTopPagesWithQueries(scUrl, days);
    return NextResponse.json({ data: data ?? [] });
  } catch (error) {
    console.error('[GET /api/[site]/page-queries]', error);
    return NextResponse.json({ error: 'failed_to_fetch_page_queries' }, { status: 500 });
  }
}
