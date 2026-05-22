import { NextRequest, NextResponse } from 'next/server';
import { getManagedSites, getSCUrl } from '@/lib/sites';
import {
  cachedGetKeywordOpportunities,
  OPPORTUNITIES_DEFAULT_DAYS,
  OPPORTUNITIES_VALID_DAYS,
  type SiteOpportunities,
} from '@/lib/opportunities';
import { parseAllowedIntegerParam } from '@/lib/days';

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const days = parseAllowedIntegerParam(params.get('days'), OPPORTUNITIES_VALID_DAYS, OPPORTUNITIES_DEFAULT_DAYS);

  let sites;
  try {
    sites = await getManagedSites();
  } catch (error) {
    console.error('[GET /api/opportunities] load sites', error);
    return NextResponse.json({ error: 'failed_to_load_sites' }, { status: 500 });
  }

  const scSites = sites.filter(s => s.searchConsole !== false);
  const selectedDomain = params.get('site');
  const selectedSite = selectedDomain
    ? scSites.find(site => site.domain === selectedDomain)
    : undefined;
  const targetSites = selectedSite ? [selectedSite] : scSites;

  const results: SiteOpportunities[] = await Promise.all(
    targetSites.map(async (site) => {
      let opportunities: Awaited<ReturnType<typeof cachedGetKeywordOpportunities>>;

      try {
        opportunities = await cachedGetKeywordOpportunities(getSCUrl(site), site.id, days);
      } catch (error) {
        console.error('[GET /api/opportunities]', site.id, error);
        opportunities = [];
      }

      return {
        siteId: site.id,
        domain: site.domain,
        opportunities: opportunities ?? [],
      };
    }),
  );

  return NextResponse.json(results);
}
