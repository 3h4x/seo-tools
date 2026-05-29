import { withCache } from './db';
import { daysAgo } from './format';
import { getAuth } from './google-auth';
import { searchconsole_v1 } from '@googleapis/searchconsole';

export const OPPORTUNITIES_VALID_DAYS = [7, 28, 90] as const;
export const OPPORTUNITIES_DEFAULT_DAYS = 28;
export const OPPORTUNITIES_TIME_RANGE_OPTIONS = [
  { value: '7', label: '7d' },
  { value: '28', label: '28d' },
  { value: '90', label: '90d' },
] as const;

// Industry-standard expected CTR by position (Sistrix 2020 study)
const EXPECTED_CTR: Record<number, number> = {
  1: 0.285, 2: 0.157, 3: 0.110, 4: 0.080, 5: 0.072,
  6: 0.051, 7: 0.040, 8: 0.032, 9: 0.028, 10: 0.025,
};

function expectedCtrForPosition(position: number): number {
  const rounded = Math.min(10, Math.max(1, Math.round(position)));
  return EXPECTED_CTR[rounded] ?? 0.02;
}

export interface KeywordOpportunity {
  query: string;
  page: string;
  position: number;
  impressions: number;
  actualCtr: number;
  expectedCtr: number;
  ctrGap: number;
  estimatedClicks: number;
}

export interface SiteOpportunities {
  siteId: string;
  domain: string;
  opportunities: KeywordOpportunity[];
}

function formatSiteUrl(siteUrl: string): string {
  return siteUrl.startsWith('sc-domain:') || siteUrl.startsWith('http')
    ? siteUrl
    : `sc-domain:${siteUrl}`;
}

async function fetchKeywordOpportunities(
  siteUrl: string,
  days: number,
): Promise<KeywordOpportunity[] | null> {
  try {
    const sc = new searchconsole_v1.Searchconsole({ auth: getAuth() });
    const response = await sc.searchanalytics.query({
      siteUrl: formatSiteUrl(siteUrl),
      requestBody: {
        startDate: daysAgo(days),
        endDate: daysAgo(1),
        dimensions: ['query', 'page'],
        rowLimit: 500,
      },
    });

    const rows = response.data.rows ?? [];
    const opportunities: KeywordOpportunity[] = [];
    const targetCtr = expectedCtrForPosition(3);

    for (const row of rows) {
      const position = row.position ?? 0;
      if (position < 5 || position > 20) continue;

      const impressions = row.impressions ?? 0;
      const actualCtr = row.ctr ?? 0;
      const expectedCtr = targetCtr; // target: position 3
      const ctrGap = expectedCtr - actualCtr;
      if (ctrGap <= 0) continue;

      opportunities.push({
        query: row.keys?.[0] ?? '',
        page: row.keys?.[1] ?? '',
        position,
        impressions,
        actualCtr,
        expectedCtr,
        ctrGap,
        estimatedClicks: Math.round(impressions * ctrGap),
      });
    }

    opportunities.sort((a, b) => b.estimatedClicks - a.estimatedClicks);
    return opportunities.slice(0, 20);
  } catch (error) {
    console.error(`Error fetching keyword opportunities for ${siteUrl}:`, error);
    return null;
  }
}

const OPPORTUNITIES_TTL_MS = 30 * 60 * 1000; // 30 min

export async function cachedGetKeywordOpportunities(
  siteUrl: string,
  siteId: string,
  days: number,
): Promise<KeywordOpportunity[] | null> {
  return withCache<KeywordOpportunity[]>(
    `opportunities-${days}`,
    siteId,
    () => fetchKeywordOpportunities(siteUrl, days),
    OPPORTUNITIES_TTL_MS,
  );
}
