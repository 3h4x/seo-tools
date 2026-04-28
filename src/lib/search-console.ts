import { searchconsole_v1 } from '@googleapis/searchconsole';
import { getAuth } from './google-auth';
import { daysAgo } from './format';
import { withCache } from './db';

function getSc() {
  return new searchconsole_v1.Searchconsole({ auth: getAuth() });
}

function formatSiteUrl(siteUrl: string): string {
  return siteUrl.startsWith('sc-domain:') || siteUrl.startsWith('http')
    ? siteUrl
    : `sc-domain:${siteUrl}`;
}

async function getSearchConsoleData(siteUrl: string, days: number = 7) {
  try {
    const response = await getSc().searchanalytics.query({
      siteUrl: formatSiteUrl(siteUrl),
      requestBody: {
        startDate: daysAgo(days),
        endDate: daysAgo(1),
        dimensions: [],
        rowLimit: 1,
      },
    });

    const data = response.data.rows?.[0] || { clicks: 0, impressions: 0, ctr: 0, position: 0 };

    return {
      clicks: data.clicks || 0,
      impressions: data.impressions || 0,
      ctr: ((data.ctr || 0) * 100).toFixed(2) + '%',
      position: (data.position || 0).toFixed(1),
    };
  } catch (error) {
    console.error(`Error fetching SC data for ${siteUrl}:`, error);
    return null;
  }
}

// --- Detailed breakdowns ---

export interface SCAggregates {
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export interface SCQueryRow {
  query: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export interface SCPageRow {
  page: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

async function getSearchConsoleDataWithComparison(
  siteUrl: string,
  days: number = 7,
): Promise<{ current: SCAggregates; previous: SCAggregates } | null> {
  try {
    const url = formatSiteUrl(siteUrl);

    const [currentRes, previousRes] = await Promise.all([
      getSc().searchanalytics.query({
        siteUrl: url,
        requestBody: {
          startDate: daysAgo(days),
          endDate: daysAgo(1),
          dimensions: [],
          rowLimit: 1,
        },
      }),
      getSc().searchanalytics.query({
        siteUrl: url,
        requestBody: {
          startDate: daysAgo(days * 2),
          endDate: daysAgo(days + 1),
          dimensions: [],
          rowLimit: 1,
        },
      }),
    ]);

    const parse = (row: searchconsole_v1.Schema$ApiDataRow | undefined): SCAggregates => ({
      clicks: row?.clicks || 0,
      impressions: row?.impressions || 0,
      ctr: row?.ctr || 0,
      position: row?.position || 0,
    });

    return {
      current: parse(currentRes.data.rows?.[0]),
      previous: parse(previousRes.data.rows?.[0]),
    };
  } catch (error) {
    console.error(`Error fetching SC comparison data for ${siteUrl}:`, error);
    return null;
  }
}

async function getSearchConsoleQueries(
  siteUrl: string,
  days: number = 7,
): Promise<SCQueryRow[] | null> {
  try {
    const response = await getSc().searchanalytics.query({
      siteUrl: formatSiteUrl(siteUrl),
      requestBody: {
        startDate: daysAgo(days),
        endDate: daysAgo(1),
        dimensions: ['query'],
        rowLimit: 20,
      },
    });

    return (response.data.rows || []).map((row) => ({
      query: row.keys?.[0] || '',
      clicks: row.clicks || 0,
      impressions: row.impressions || 0,
      ctr: row.ctr || 0,
      position: row.position || 0,
    }));
  } catch (error) {
    console.error(`Error fetching SC queries for ${siteUrl}:`, error);
    return null;
  }
}

async function queryScPages(
  siteUrl: string,
  startDate: string,
  endDate: string,
  rowLimit: number = 20,
): Promise<SCPageRow[] | null> {
  try {
    const response = await getSc().searchanalytics.query({
      siteUrl: formatSiteUrl(siteUrl),
      requestBody: { startDate, endDate, dimensions: ['page'], rowLimit },
    });
    return (response.data.rows || []).map((row) => ({
      page: row.keys?.[0] || '',
      clicks: row.clicks || 0,
      impressions: row.impressions || 0,
      ctr: row.ctr || 0,
      position: row.position || 0,
    }));
  } catch (error) {
    console.error(`Error fetching SC pages for ${siteUrl}:`, error);
    return null;
  }
}

async function getSearchConsolePages(siteUrl: string, days: number = 7) {
  return queryScPages(siteUrl, daysAgo(days), daysAgo(1));
}

export async function getSearchConsolePagesForPeriod(
  siteUrl: string,
  startDate: string,
  endDate: string,
  rowLimit: number = 100,
): Promise<SCPageRow[] | null> {
  return queryScPages(siteUrl, startDate, endDate, rowLimit);
}

// --- Sitemap submissions ---

export interface SitemapSubmission {
  path: string;
  lastSubmitted: string | null;
  lastDownloaded: string | null;
  isPending: boolean;
  warnings: number;
  errors: number;
}

async function getSitemapSubmissions(siteUrl: string): Promise<SitemapSubmission[]> {
  try {
    const url = formatSiteUrl(siteUrl);
    const res = await getSc().sitemaps.list({ siteUrl: url });
    return (res.data.sitemap || []).map(m => ({
      path: m.path || '',
      lastSubmitted: m.lastSubmitted || null,
      lastDownloaded: m.lastDownloaded || null,
      isPending: m.isPending ?? false,
      warnings: Number(m.warnings ?? 0),
      errors: Number(m.errors ?? 0),
    }));
  } catch {
    return [];
  }
}

export async function cachedGetSitemapSubmissions(siteUrl: string) {
  return withCache<SitemapSubmission[]>('sitemap-submissions', siteUrl, () => getSitemapSubmissions(siteUrl));
}

export async function cachedGetSearchConsoleDataWithComparison(
  siteUrl: string,
  days: number = 7,
) {
  return withCache<{ current: SCAggregates; previous: SCAggregates }>(
    `sc-comparison-${days}`, siteUrl,
    () => getSearchConsoleDataWithComparison(siteUrl, days),
  );
}

export async function cachedGetSearchConsoleQueries(
  siteUrl: string,
  days: number = 7,
) {
  return withCache<SCQueryRow[]>(
    `sc-queries-${days}`, siteUrl,
    () => getSearchConsoleQueries(siteUrl, days),
  );
}

export async function cachedGetSearchConsolePages(
  siteUrl: string,
  days: number = 7,
) {
  return withCache<SCPageRow[]>(
    `sc-pages-${days}`, siteUrl,
    () => getSearchConsolePages(siteUrl, days),
  );
}

export async function cachedGetSearchConsoleData(
  siteUrl: string,
  days: number = 7,
) {
  return withCache<{ clicks: number; impressions: number; ctr: string; position: string }>(
    `sc-data-${days}`, siteUrl,
    () => getSearchConsoleData(siteUrl, days),
  );
}
