import { NextRequest, NextResponse } from 'next/server';
import { getManagedSite, getSCUrl } from '@/lib/sites';
import { cachedGetTopPagesWithQueries } from '@/lib/search-console';
import { VALID_DAYS } from '@/lib/constants';

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ site: string }> },
) {
  try {
    const { site } = await context.params;
    const rawDays = parseInt(req.nextUrl.searchParams.get('days') || '7');
    const days = VALID_DAYS.includes(rawDays) ? rawDays : 7;

    const siteConfig = await getManagedSite(site);
    if (!siteConfig) {
      return NextResponse.json({ error: 'Site not found' }, { status: 404 });
    }

    if (!siteConfig.searchConsole) {
      return NextResponse.json({ data: [] });
    }

    const scUrl = getSCUrl(siteConfig);
    const data = await cachedGetTopPagesWithQueries(scUrl, days);
    return NextResponse.json({ data: data ?? [] });
  } catch (error) {
    console.error('Error fetching page queries:', error);
    return NextResponse.json({ error: 'Failed to fetch page queries' }, { status: 500 });
  }
}
