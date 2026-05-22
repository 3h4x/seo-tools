import { NextRequest, NextResponse } from 'next/server';
import { PERF_VALID_DAYS } from '@/lib/constants';
import { getPerformanceSiteData } from '@/lib/performance-site';
import { parseAllowedIntegerParam } from '@/lib/days';
import { getRouteSiteParam, siteNotFoundError } from '@/lib/site-route';

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ site: string }> },
) {
  try {
    const site = await getRouteSiteParam(context);
    const days = parseAllowedIntegerParam(req.nextUrl.searchParams.get('days'), PERF_VALID_DAYS, 7);

    const data = await getPerformanceSiteData(site, days);
    if (!data) {
      return siteNotFoundError();
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('[GET /api/performance/[site]]', error);
    return NextResponse.json({ error: 'failed_to_fetch_performance_site_data' }, { status: 500 });
  }
}
