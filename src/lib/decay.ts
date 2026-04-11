import { getManagedSites, getSCUrl, type Site } from './sites';
import { getSearchConsolePagesForPeriod, type SCPageRow } from './search-console';

export type DecaySeverity = 'severe' | 'moderate' | 'mild';

export interface DecayingPage {
  page: string;
  siteId: string;
  domain: string;
  severity: DecaySeverity;
  currentClicks: number;
  previousClicks: number;
  clicksDelta: number;
  currentImpressions: number;
  previousImpressions: number;
  impressionsDelta: number;
  currentPosition: number;
  previousPosition: number;
  positionDelta: number;
}

export interface SiteDecayResult {
  siteId: string;
  domain: string;
  decayingPages: DecayingPage[];
  totalPages: number;
}

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().split('T')[0];
}

export function classifySeverity(clicksDelta: number, positionDelta: number): DecaySeverity {
  if (clicksDelta < -50 || positionDelta > 5) return 'severe';
  if (clicksDelta < -20 || positionDelta > 2) return 'moderate';
  return 'mild';
}

export async function detectSiteDecay(site: Site, days: 7 | 30): Promise<SiteDecayResult | null> {
  if (!site.searchConsole) return null;

  const currentStart = daysAgo(days);
  const currentEnd = daysAgo(1);
  const previousStart = daysAgo(days * 2);
  const previousEnd = daysAgo(days + 1);

  const [currentPages, previousPages] = await Promise.all([
    getSearchConsolePagesForPeriod(getSCUrl(site), currentStart, currentEnd),
    getSearchConsolePagesForPeriod(getSCUrl(site), previousStart, previousEnd),
  ]);

  if (!currentPages || !previousPages) return null;

  const previousMap = new Map<string, SCPageRow>();
  for (const p of previousPages) previousMap.set(p.page, p);

  const currentMap = new Map<string, SCPageRow>();
  for (const p of currentPages) currentMap.set(p.page, p);

  const decayingPages: DecayingPage[] = [];

  // Check current pages that lost traffic
  for (const current of currentPages) {
    const previous = previousMap.get(current.page);
    if (!previous || previous.clicks === 0) continue;

    const clicksDelta = ((current.clicks - previous.clicks) / previous.clicks) * 100;
    const impressionsDelta = previous.impressions > 0
      ? ((current.impressions - previous.impressions) / previous.impressions) * 100
      : 0;
    const positionDelta = current.position - previous.position;

    const isDecaying = clicksDelta < -20 || impressionsDelta < -25 || positionDelta > 2;
    if (!isDecaying) continue;

    decayingPages.push({
      page: current.page,
      siteId: site.id,
      domain: site.domain,
      severity: classifySeverity(clicksDelta, positionDelta),
      currentClicks: current.clicks,
      previousClicks: previous.clicks,
      clicksDelta: Math.round(clicksDelta),
      currentImpressions: current.impressions,
      previousImpressions: previous.impressions,
      impressionsDelta: Math.round(impressionsDelta),
      currentPosition: current.position,
      previousPosition: previous.position,
      positionDelta: Math.round(positionDelta * 10) / 10,
    });
  }

  // Check pages that disappeared (were in previous but not in current)
  for (const [url, previous] of previousMap) {
    if (currentMap.has(url) || previous.clicks === 0) continue;

    decayingPages.push({
      page: url,
      siteId: site.id,
      domain: site.domain,
      severity: 'severe',
      currentClicks: 0,
      previousClicks: previous.clicks,
      clicksDelta: -100,
      currentImpressions: 0,
      previousImpressions: previous.impressions,
      impressionsDelta: -100,
      currentPosition: 0,
      previousPosition: previous.position,
      positionDelta: 0,
    });
  }

  decayingPages.sort((a, b) => (b.previousClicks - b.currentClicks) - (a.previousClicks - a.currentClicks));

  const allUrls = new Set([...currentPages.map(p => p.page), ...previousPages.map(p => p.page)]);

  return {
    siteId: site.id,
    domain: site.domain,
    decayingPages,
    totalPages: allUrls.size,
  };
}

export async function detectAllDecay(days: 7 | 30): Promise<SiteDecayResult[]> {
  const sites = await getManagedSites();
  const results = await Promise.all(
    sites.filter(s => s.searchConsole).map(s => detectSiteDecay(s, days)),
  );
  return results.filter((r): r is SiteDecayResult => r !== null);
}
