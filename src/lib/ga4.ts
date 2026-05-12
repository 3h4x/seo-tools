import { AnalyticsAdminServiceClient } from '@google-analytics/admin';
import { BetaAnalyticsDataClient } from '@google-analytics/data';
import { getAuth } from './google-auth';
import { getManagedSites } from './sites';
import { clearCacheEntry, withCache, type ProviderResult } from './db';
import {
  GA4_DISCOVERY_CACHE_KEY,
  GA4_DISCOVERY_CACHE_SITE_ID,
  resolveSiteGa4PropertyId,
  type DiscoveredGa4Property,
} from './ga4-discovery';

function getAdminClient() {
  return new AnalyticsAdminServiceClient({ auth: getAuth() });
}
function getDataClient() {
  return new BetaAnalyticsDataClient({ auth: getAuth() });
}

async function fetchDiscoveredGa4Properties(): Promise<DiscoveredGa4Property[] | null> {
  try {
    const [summaries] = await getAdminClient().listAccountSummaries({});
    return summaries.flatMap((account) => (
      (account.propertySummaries ?? []).flatMap((property) => {
        const displayName = property.displayName?.trim();
        const propertyId = property.property?.split('/')[1]?.trim();
        if (!displayName || !propertyId) return [];
        return [{ displayName, propertyId }];
      })
    ));
  } catch (error) {
    console.error('Error discovering GA4 properties:', error);
    return null;
  }
}

export async function cachedGetDiscoveredGa4Properties(): Promise<DiscoveredGa4Property[] | null> {
  return withCache<DiscoveredGa4Property[]>(
    GA4_DISCOVERY_CACHE_KEY,
    GA4_DISCOVERY_CACHE_SITE_ID,
    fetchDiscoveredGa4Properties,
  );
}

export function clearGa4DiscoveryCache(): void {
  clearCacheEntry(GA4_DISCOVERY_CACHE_KEY, GA4_DISCOVERY_CACHE_SITE_ID);
}

export async function discoverPropertyIds() {
  const sites = await getManagedSites();
  const properties = await cachedGetDiscoveredGa4Properties().catch((error) => {
    console.error('Error discovering GA4 properties:', error);
    return null;
  });
  if (!properties) return sites;

  return sites.map((site) => {
      return {
        ...site,
        ga4PropertyId: resolveSiteGa4PropertyId(site, properties),
      };
  });
}

interface GA4Metrics {
  users: number;
  sessions: number;
  views: number;
  bounceRate: number;
  avgSessionDuration: number;
}

interface GA4TopPage {
  path: string;
  views: number;
  users: number;
}

interface GA4TrafficSource {
  source: string;
  medium: string;
  sessions: number;
  users: number;
}

interface GA4Data {
  current: GA4Metrics;
  previous: GA4Metrics;
  topPages: GA4TopPage[];
  trafficSources: GA4TrafficSource[];
}

async function getAnalytics(propertyId: string, days: number = 7): Promise<GA4Data | null> {
  if (!propertyId) return null;

  try {
    const prop = propertyId.startsWith('properties/') ? propertyId : `properties/${propertyId}`;

    const dataClient = getDataClient();
    const [metricsRes, topPagesRes, trafficRes] = await Promise.all([
      dataClient.runReport({
        property: prop,
        dateRanges: [
          { startDate: `${days}daysAgo`, endDate: 'yesterday' },
          { startDate: `${days * 2}daysAgo`, endDate: `${days + 1}daysAgo` },
        ],
        metrics: [
          { name: 'activeUsers' },
          { name: 'sessions' },
          { name: 'screenPageViews' },
          { name: 'bounceRate' },
          { name: 'averageSessionDuration' },
        ],
      }),
      dataClient.runReport({
        property: prop,
        dateRanges: [{ startDate: `${days}daysAgo`, endDate: 'yesterday' }],
        dimensions: [{ name: 'pagePath' }],
        metrics: [
          { name: 'screenPageViews' },
          { name: 'activeUsers' },
        ],
        orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }],
        limit: 15,
      }),
      dataClient.runReport({
        property: prop,
        dateRanges: [{ startDate: `${days}daysAgo`, endDate: 'yesterday' }],
        dimensions: [
          { name: 'sessionSource' },
          { name: 'sessionMedium' },
        ],
        metrics: [
          { name: 'sessions' },
          { name: 'activeUsers' },
        ],
        orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
        limit: 10,
      }),
    ]);

    type IRow = NonNullable<typeof metricsRes[0]['rows']>[number];
    const parseMetrics = (row: IRow | undefined): GA4Metrics => ({
      users: parseInt(row?.metricValues?.[0]?.value || '0'),
      sessions: parseInt(row?.metricValues?.[1]?.value || '0'),
      views: parseInt(row?.metricValues?.[2]?.value || '0'),
      bounceRate: parseFloat(row?.metricValues?.[3]?.value || '0'),
      avgSessionDuration: parseFloat(row?.metricValues?.[4]?.value || '0'),
    });

    // Skip malformed rows before assigning current/previous periods so the two
    // period aggregates do not collapse onto the same source row.
    const metricRows = metricsRes[0].rows || [];
    const validMetricRows = metricRows.filter(row => row.metricValues?.[0]?.value !== undefined);
    const [currentRow, previousRow] = validMetricRows.length > 0 ? validMetricRows : metricRows;

    const topPages: GA4TopPage[] = (topPagesRes[0].rows || []).map(row => ({
      path: row.dimensionValues?.[0]?.value || '/',
      views: parseInt(row.metricValues?.[0]?.value || '0'),
      users: parseInt(row.metricValues?.[1]?.value || '0'),
    }));

    const trafficSources: GA4TrafficSource[] = (trafficRes[0].rows || []).map(row => ({
      source: row.dimensionValues?.[0]?.value || '(direct)',
      medium: row.dimensionValues?.[1]?.value || '(none)',
      sessions: parseInt(row.metricValues?.[0]?.value || '0'),
      users: parseInt(row.metricValues?.[1]?.value || '0'),
    }));

    return {
      current: parseMetrics(currentRow),
      previous: parseMetrics(previousRow),
      topPages,
      trafficSources,
    };
  } catch (error) {
    console.error(`Error fetching GA4 data for property ${propertyId}:`, error);
    return null;
  }
}

export async function cachedGetAnalytics(propertyId: string, days: number = 7): Promise<ProviderResult<GA4Data>> {
  if (!propertyId) return { data: null, error: false };
  const data = await withCache<GA4Data>(`ga4-${days}`, propertyId, () => getAnalytics(propertyId, days));
  return data !== null ? { data, error: false } : { data: null, error: true };
}
