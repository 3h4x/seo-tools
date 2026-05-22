import { cachedAuditAllSites } from './audit';
import { detectAllDecay, type DecaySeverity } from './decay';
import { getKeywordDropActions } from './db';
import { analyzeSiteGaps, createSiteGapSignals, loadSiteGapSignals, type GapRecommendation, type GapSeverity } from './gaps';
import { discoverPropertyIds } from './ga4';
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

async function loadOrFallback<T>(
  label: string,
  promise: Promise<T>,
  fallback: T,
): Promise<T> {
  try {
    return await promise;
  } catch (error) {
    console.error(`[ActionQueue] ${label}:`, error);
    return fallback;
  }
}

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
  const [managedSites, discoveredSites, audits, decayResults] = await Promise.all([
    loadOrFallback('managed sites', getManagedSites(), []),
    loadOrFallback('GA4 discovery', discoverPropertyIds(), []),
    loadOrFallback('audits', cachedAuditAllSites(), []),
    loadOrFallback('decay', detectAllDecay(days === 30 ? 30 : 7), []),
  ]);

  if (managedSites.length === 0) {
    return { items: [], counts: { ...EMPTY_PRIORITY_COUNTS } };
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

        const signals = await loadSiteGapSignals(site, propertyIdBySite.get(site.id) ?? '', days)
          .catch((error) => {
            console.error(`[ActionQueue] gap signals ${site.id}:`, error);
            return createSiteGapSignals({ days });
          });
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
    loadKeywordDropActions(site.id).map((keyword) => ({
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

  return { items, counts };
}

function loadKeywordDropActions(siteId: string): ReturnType<typeof getKeywordDropActions> {
  try {
    return getKeywordDropActions(siteId, 5);
  } catch (error) {
    console.error(`[ActionQueue] keyword drops ${siteId}:`, error);
    return [];
  }
}
