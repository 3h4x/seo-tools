import { cachedAuditAllSites } from './audit';
import { detectAllDecay, type DecaySeverity } from './decay';
import { getKeywordDropActions } from './db';
import type { GapRecommendation, GapSeverity } from './gap-definitions';
import { analyzeSiteGaps, createSiteGapSignals, loadSiteGapSignals } from './gaps';
import { discoverPropertyIds } from './ga4';
import { loadOrFlag } from './page-helpers';
import { getManagedSites } from './sites';

export interface ActionQueueItem {
  id: string;
  kind: 'gap' | 'decay' | 'keyword';
  priority: 'critical' | 'high' | 'medium' | 'low';
  score: number;
  siteId: string;
  siteName: string;
  siteDomain: string;
  title: string;
  detail: string;
  affected: string;
  impactLabel: string;
  href: string;
}

export interface ActionQueueData {
  items: ActionQueueItem[];
  counts: Record<ActionQueueItem['priority'], number>;
  failures: string[];
}

const GAP_WEIGHTS: Record<GapSeverity, number> = {
  high: 4,
  medium: 2,
  low: 1,
};

const DECAY_WEIGHTS: Record<DecaySeverity, number> = {
  severe: 5,
  moderate: 4,
  mild: 3,
};

const EMPTY_PRIORITY_COUNTS: Record<ActionQueueItem['priority'], number> = {
  critical: 0,
  high: 0,
  medium: 0,
  low: 0,
};

function normalizePageKey(value: string): string {
  try {
    const url = value.startsWith('http://') || value.startsWith('https://')
      ? new URL(value)
      : new URL(value, 'https://placeholder.local');
    return url.pathname.replace(/\/+$/, '') || '/';
  } catch {
    return (value.split('?')[0]?.split('#')[0] ?? value).replace(/\/+$/, '') || '/';
  }
}

function sumClicksByPage(pages: Array<{ page: string; clicks: number }>, affectedPages?: string[]): number {
  const totalClicks = pages.reduce((sum, page) => sum + page.clicks, 0);
  if (!affectedPages || affectedPages.length === 0) return totalClicks;

  const pageClicks = new Map(
    pages.map((page) => [normalizePageKey(page.page), page.clicks] as const),
  );

  return affectedPages.reduce((sum, page) => sum + (pageClicks.get(normalizePageKey(page)) ?? 0), 0);
}

function summarizeAffectedPages(gap: GapRecommendation): string {
  if (!gap.affectedPages || gap.affectedPages.length === 0) return 'Sitewide';
  if (gap.affectedPages.length === 1) return gap.affectedPages[0] ?? '1 page';
  return `${gap.affectedPages.length} pages`;
}

function priorityFromGap(severity: GapSeverity, impact: number): ActionQueueItem['priority'] {
  if (severity === 'high' && impact >= 100) return 'critical';
  if (severity === 'high') return 'high';
  if (severity === 'medium' && impact >= 50) return 'high';
  if (severity === 'medium') return 'medium';
  return 'low';
}

function priorityFromKeyword(delta: number, clicks: number): ActionQueueItem['priority'] {
  if (delta <= -5 || clicks >= 100) return 'high';
  if (delta <= -2) return 'medium';
  return 'low';
}

function priorityFromDecay(severity: DecaySeverity): ActionQueueItem['priority'] {
  if (severity === 'severe') return 'critical';
  if (severity === 'moderate') return 'high';
  return 'medium';
}

export async function loadActionQueue(days: number = 7): Promise<ActionQueueData> {
  const [managedSitesResult, discoveredSitesResult, auditsResult, decayResultsResult] = await Promise.all([
    loadOrFlag('ActionQueue managed sites', getManagedSites(), []),
    loadOrFlag('ActionQueue GA4 discovery', discoverPropertyIds(), []),
    loadOrFlag('ActionQueue audits', cachedAuditAllSites(), []),
    loadOrFlag('ActionQueue decay', detectAllDecay(days === 30 ? 30 : 7), []),
  ]);
  const failures = [
    ...(managedSitesResult.failed ? ['Managed sites'] : []),
    ...(discoveredSitesResult.failed ? ['GA4 discovery'] : []),
    ...(auditsResult.failed ? ['SEO audits'] : []),
    ...(decayResultsResult.failed ? ['Content decay'] : []),
  ];
  const managedSites = managedSitesResult.value;
  const discoveredSites = discoveredSitesResult.value;
  const audits = auditsResult.value;
  const decayResults = decayResultsResult.value;

  if (managedSites.length === 0) {
    return { items: [], counts: { ...EMPTY_PRIORITY_COUNTS }, failures };
  }

  const propertyIdBySite = new Map(
    discoveredSites.map((site) => [site.id, site.ga4PropertyId || ''] as const),
  );
  const siteById = new Map(managedSites.map((site) => [site.id, site] as const));

  const gapItems = (
    await Promise.all(
      audits.map(async (audit) => {
        const site = siteById.get(audit.siteId);
        if (!site) return [];

        const signalsResult = await loadOrFlag(
          `ActionQueue gap signals ${site.id}`,
          loadSiteGapSignals(site, propertyIdBySite.get(site.id) ?? '', days),
          createSiteGapSignals({ days }),
        );
        if (signalsResult.failed) {
          failures.push(`${site.name} gap signals`);
        }
        const signals = signalsResult.value;
        const impactPages = signals.scTopPages ?? [];

        return analyzeSiteGaps(audit, site, signals).gaps.map((gap) => {
          const impact = sumClicksByPage(impactPages, gap.affectedPages);
          return {
            id: `${site.id}-${gap.id}`,
            kind: 'gap' as const,
            priority: priorityFromGap(gap.severity, impact),
            score: GAP_WEIGHTS[gap.severity] * Math.max(impact, 1),
            siteId: site.id,
            siteName: site.name,
            siteDomain: site.domain,
            title: gap.title,
            detail: gap.description,
            affected: summarizeAffectedPages(gap),
            impactLabel: impact > 0 ? `${impact.toLocaleString()} clicks at risk` : 'Structural issue',
            href: `/${encodeURIComponent(site.id)}`,
          };
        });
      }),
    )
  ).flat();

  const decayItems = decayResults.flatMap((result) => {
    const site = siteById.get(result.siteId);
    if (!site) return [];

    return result.decayingPages.map((page) => {
      const lostClicks = Math.max(page.previousClicks - page.currentClicks, 0);
      return {
        id: `${result.siteId}-decay-${page.page}`,
        kind: 'decay' as const,
        priority: priorityFromDecay(page.severity),
        score: DECAY_WEIGHTS[page.severity] * Math.max(lostClicks, 1),
        siteId: site.id,
        siteName: site.name,
        siteDomain: site.domain,
        title: 'Recover decaying page traffic',
        detail: `${page.page} lost ${Math.abs(page.clicksDelta)}% clicks over the last ${days} days.`,
        affected: page.page,
        impactLabel: `${lostClicks.toLocaleString()} clicks lost`,
        href: `/${encodeURIComponent(site.id)}`,
      };
    });
  });

  const keywordItems = managedSites.flatMap((site) => (
    site.searchConsole === false ? [] : loadKeywordDropActions(site.id, site.name, failures).map((keyword) => ({
      id: `${site.id}-keyword-${keyword.query}`,
      kind: 'keyword' as const,
      priority: priorityFromKeyword(keyword.delta, keyword.clicks),
      score: Math.max(keyword.clicks, 1) * Math.abs(keyword.delta),
      siteId: site.id,
      siteName: site.name,
      siteDomain: site.domain,
      title: 'Recover ranking drop',
      detail: `"${keyword.query}" slipped from ${keyword.previousPosition.toFixed(1)} to ${keyword.currentPosition.toFixed(1)} over ${keyword.window}.`,
      affected: keyword.query,
      impactLabel: `${keyword.clicks.toLocaleString()} clicks on latest snapshot`,
      href: `/${encodeURIComponent(site.id)}`,
    }))
  ));

  const items = [...gapItems, ...decayItems, ...keywordItems]
    .sort((a, b) => b.score - a.score)
    .slice(0, 100);

  const counts = items.reduce(
    (acc, item) => {
      acc[item.priority] += 1;
      return acc;
    },
    { ...EMPTY_PRIORITY_COUNTS },
  );

  return { items, counts, failures };
}

function loadKeywordDropActions(
  siteId: string,
  siteName: string,
  failures: string[],
): ReturnType<typeof getKeywordDropActions> {
  try {
    return getKeywordDropActions(siteId, 5);
  } catch (error) {
    console.error(`[ActionQueue] keyword drops ${siteId}:`, error);
    failures.push(`${siteName} keyword history`);
    return [];
  }
}
