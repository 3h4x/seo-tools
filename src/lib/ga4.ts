import { AnalyticsAdminServiceClient } from '@google-analytics/admin';
import { BetaAnalyticsDataClient } from '@google-analytics/data';
import { getAuth } from './google-auth';
import { getManagedSites } from './sites';

function getAdminClient() {
  return new AnalyticsAdminServiceClient({ auth: getAuth() });
}
function getDataClient() {
  return new BetaAnalyticsDataClient({ auth: getAuth() });
}

export async function discoverPropertyIds() {
  const sites = await getManagedSites();
  try {
    const [summaries] = await getAdminClient().listAccountSummaries({});
    const properties = summaries.flatMap((account) => account.propertySummaries || []);

    return sites.map((site) => {
      const property = properties.find((p) =>
        p.displayName?.toLowerCase().includes(site.domain.toLowerCase()) ||
        site.domain.toLowerCase().includes(p.displayName?.toLowerCase() || '')
      );

      return {
        ...site,
        ga4PropertyId: site.ga4PropertyId || property?.property?.split('/')[1],
      };
    });
  } catch (error) {
    console.error('Error discovering GA4 properties:', error);
    return sites;
  }
}

export interface GA4Metrics {
  users: number;
  sessions: number;
  views: number;
  bounceRate: number;
  avgSessionDuration: number;
}

export interface GA4TopPage {
  path: string;
  views: number;
  users: number;
}

export interface GA4TrafficSource {
  source: string;
  medium: string;
  sessions: number;
  users: number;
}

export interface GA4Data {
  current: GA4Metrics;
  previous: GA4Metrics;
  topPages: GA4TopPage[];
  trafficSources: GA4TrafficSource[];
}

export async function getAnalytics(propertyId: string, days: number = 7): Promise<GA4Data | null> {
  if (!propertyId) return null;

  try {
    const prop = `properties/${propertyId}`;

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

    const currentRow = metricsRes[0].rows?.find(r => r.metricValues?.[0]?.value !== undefined) || metricsRes[0].rows?.[0];
    const previousRow = metricsRes[0].rows?.[1];

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

// --- Cached version ---

import { getCached, setCache } from './db';

export async function cachedGetAnalytics(propertyId: string, days: number = 7): Promise<GA4Data | null> {
  if (!propertyId) return null;
  const cached = getCached<GA4Data>(`ga4-${days}`, propertyId);
  if (cached) return cached;
  const result = await getAnalytics(propertyId, days);
  if (result) setCache(`ga4-${days}`, propertyId, result);
  return result;
}
