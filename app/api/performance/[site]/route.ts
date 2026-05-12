import { NextRequest, NextResponse } from 'next/server';
import { getPerformanceSiteData } from '@/lib/performance-site';
import { parseIntegerParam } from '@/lib/days';

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ site: string }> },
) {
  try {
    const { site } = await context.params;
    const rawDays = parseIntegerParam(req.nextUrl.searchParams.get('days'), 7);

    const data = await getPerformanceSiteData(site, rawDays);
    if (!data) {
      return NextResponse.json({ error: 'Site not found' }, { status: 404 });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('Error fetching performance site data:', error);
    return NextResponse.json({ error: 'Failed to fetch performance site data' }, { status: 500 });
  }
}
