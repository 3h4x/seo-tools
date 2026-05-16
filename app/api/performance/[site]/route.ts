import { NextRequest, NextResponse } from 'next/server';
import { getPerformanceSiteData } from '@/lib/performance-site';
import { parseIntegerParam } from '@/lib/days';
import { getRouteSiteParam, siteNotFoundError } from '@/lib/site-route';

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ site: string }> },
) {
  try {
    const site = await getRouteSiteParam(context);
    const rawDays = parseIntegerParam(req.nextUrl.searchParams.get('days'), 7);

    const data = await getPerformanceSiteData(site, rawDays);
    if (!data) {
      return siteNotFoundError();
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('Error fetching performance site data:', error);
    return NextResponse.json({ error: 'Failed to fetch performance site data' }, { status: 500 });
  }
}
