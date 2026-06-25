import { searchconsole_v1 } from '@googleapis/searchconsole';
import { withCache } from './db';
import { dateOnlyDaysBack, dateStr } from './date-only';
import { getAuth } from './google-auth';
import { getSCUrl, type Site } from './sites';
import type {
  CheckResult,
  CheckStatus,
  IndexingCoverageResult,
  UrlInspectionPageResult,
} from './audit-types';

const CACHE_TTL_DAY = 24 * 60 * 60 * 1000;
const SC_STALE_DAYS = 30;
const GOOGLE_API_TIMEOUT_MS = 30_000;

function getSc() {
  return new searchconsole_v1.Searchconsole({ auth: getAuth() });
}

function providerErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown provider error';
}

function formatScUrl(site: Site): string {
  const scUrl = getSCUrl(site);
  return scUrl.startsWith('sc-domain:') || scUrl.startsWith('http') ? scUrl : `sc-domain:${scUrl}`;
}

function toAbsoluteAuditUrl(domain: string, page: string): string {
  return `https://${domain}${page.startsWith('/') ? page : `/${page}`}`;
}

function describeUrlInspectionStatus(
  result: searchconsole_v1.Schema$UrlInspectionResult | undefined,
): Pick<UrlInspectionPageResult, 'status' | 'message' | 'verdict' | 'coverageState' | 'indexingState' | 'lastCrawlTime' | 'mobileUsabilityVerdict' | 'richResultsVerdict' | 'referringUrls' | 'googleCanonical' | 'userCanonical' | 'inspectionResultLink'> {
  const indexStatus = result?.indexStatusResult;
  const coverageState = indexStatus?.coverageState ?? undefined;
  const indexingState = indexStatus?.indexingState ?? undefined;
  const verdict = indexStatus?.verdict ?? undefined;
  const mobileUsabilityVerdict = result?.mobileUsabilityResult?.verdict ?? undefined;
  const richResultsVerdict = result?.richResultsResult?.verdict ?? undefined;
  const lastCrawlTime = indexStatus?.lastCrawlTime ?? undefined;
  const normalizedSummary = `${coverageState ?? ''} ${indexingState ?? ''} ${verdict ?? ''}`.toLowerCase();

  let status: CheckStatus = 'warn';
  if (
    normalizedSummary.includes('not indexed')
    || normalizedSummary.includes('blocked')
    || normalizedSummary.includes('noindex')
  ) {
    status = 'fail';
  } else if (normalizedSummary.includes('indexed') || verdict === 'PASS') {
    status = 'pass';
  } else if (verdict === 'FAIL') {
    status = 'fail';
  }

  const primaryMessage = coverageState ?? indexingState ?? verdict ?? 'Inspection data unavailable';
  const secondaryMessage = indexingState && indexingState !== coverageState ? ` · ${indexingState}` : '';

  return {
    status,
    message: `${primaryMessage}${secondaryMessage}`,
    verdict,
    coverageState,
    indexingState,
    lastCrawlTime,
    mobileUsabilityVerdict,
    richResultsVerdict,
    referringUrls: indexStatus?.referringUrls ?? undefined,
    googleCanonical: indexStatus?.googleCanonical ?? undefined,
    userCanonical: indexStatus?.userCanonical ?? undefined,
    inspectionResultLink: result?.inspectionResultLink ?? undefined,
  };
}

async function checkUrlInspection(
  sc: searchconsole_v1.Searchconsole,
  scUrl: string,
  pageUrl: string,
  page: string,
): Promise<UrlInspectionPageResult> {
  try {
    const response = await sc.urlInspection.index.inspect({
      requestBody: {
        inspectionUrl: pageUrl,
        siteUrl: scUrl,
        languageCode: 'en-US',
      },
    }, { timeout: GOOGLE_API_TIMEOUT_MS });
    const described = describeUrlInspectionStatus(response.data.inspectionResult);
    return {
      page,
      inspectionUrl: pageUrl,
      label: 'URL Inspection',
      ...described,
    };
  } catch (error) {
    console.error(`Error inspecting URL ${pageUrl}:`, error);
    return {
      page,
      inspectionUrl: pageUrl,
      status: 'error',
      label: 'URL Inspection',
      message: 'Search Console inspection unavailable',
    };
  }
}

export async function checkUrlInspectionForSite(site: Site): Promise<UrlInspectionPageResult[]> {
  if (site.searchConsole === false || site.testPages.length === 0) return [];

  const scUrl = getSCUrl(site);
  const sc = getSc();
  return Promise.all(
    site.testPages.map(async (page) => {
      const pageUrl = toAbsoluteAuditUrl(site.domain, page);
      const cacheId = `${site.id}:${page}`;
      const cached = await withCache<UrlInspectionPageResult>(
        'url-inspection',
        cacheId,
        () => checkUrlInspection(sc, scUrl, pageUrl, page),
        CACHE_TTL_DAY,
      );

      return cached ?? {
        page,
        inspectionUrl: pageUrl,
        status: 'error',
        label: 'URL Inspection',
        message: 'Search Console inspection unavailable',
      };
    }),
  );
}

export async function checkScSitemapFreshness(site: Site): Promise<CheckResult> {
  if (site.searchConsole === false) {
    return { status: 'pass', label: 'SC Sitemap', message: 'N/A — Search Console disabled' };
  }

  try {
    const res = await getSc().sitemaps.list({ siteUrl: formatScUrl(site) }, { timeout: GOOGLE_API_TIMEOUT_MS });
    const sitemaps = res.data.sitemap || [];

    if (sitemaps.length === 0) {
      return { status: 'fail', label: 'SC Sitemap', message: 'No sitemaps submitted to Google Search Console' };
    }

    let mostRecentDownload: Date | null = null;
    let mostRecentPath = '';
    for (const sm of sitemaps) {
      if (sm.lastDownloaded) {
        const downloadedAt = Date.parse(sm.lastDownloaded);
        if (!Number.isFinite(downloadedAt)) continue;
        const d = new Date(downloadedAt);
        if (!mostRecentDownload || d > mostRecentDownload) {
          mostRecentDownload = d;
          mostRecentPath = sm.path || '';
        }
      }
    }

    if (!mostRecentDownload) {
      return { status: 'fail', label: 'SC Sitemap', message: 'Google has never downloaded the sitemap' };
    }

    const daysSince = Math.floor((Date.now() - mostRecentDownload.getTime()) / (1000 * 60 * 60 * 24));

    if (daysSince > SC_STALE_DAYS) {
      return {
        status: 'fail',
        label: 'SC Sitemap',
        message: `Google last downloaded ${daysSince}d ago (${dateStr(mostRecentDownload)})`,
        details: mostRecentPath,
      };
    }

    return {
      status: 'pass',
      label: 'SC Sitemap',
      message: `Google downloaded ${daysSince}d ago (${dateStr(mostRecentDownload)})`,
      details: mostRecentPath,
    };
  } catch (e) {
    return { status: 'error', label: 'SC Sitemap', message: `Could not check: ${providerErrorMessage(e).slice(0, 60)}` };
  }
}

export async function checkIndexingCoverage(site: Site, sitemapUrlCount?: number): Promise<IndexingCoverageResult> {
  if (site.searchConsole === false) {
    return { status: 'pass', label: 'Indexing', message: 'N/A — Search Console disabled' };
  }

  try {
    const res = await getSc().searchanalytics.query({
      siteUrl: formatScUrl(site),
      requestBody: {
        startDate: dateOnlyDaysBack(90),
        endDate: dateOnlyDaysBack(1),
        dimensions: ['page'],
        rowLimit: 5000,
      },
    }, { timeout: GOOGLE_API_TIMEOUT_MS });

    const indexedPages = res.data.rows?.length || 0;

    if (!sitemapUrlCount || sitemapUrlCount === 0) {
      return {
        status: indexedPages > 0 ? 'pass' : 'warn',
        label: 'Indexing',
        message: `${indexedPages} pages in search results (no sitemap to compare)`,
        indexedPages,
      };
    }

    const indexedSitemapUrls = Math.min(indexedPages, sitemapUrlCount);
    const coveragePct = Math.round((indexedSitemapUrls / sitemapUrlCount) * 100);
    const unindexedPages = Math.max(sitemapUrlCount - indexedSitemapUrls, 0);

    if (coveragePct < 30) {
      return {
        status: 'fail',
        label: 'Indexing',
        message: `${indexedSitemapUrls}/${sitemapUrlCount} sitemap URLs indexed (${coveragePct}%)`,
        details: `${unindexedPages} pages submitted but not appearing in search results`,
        sitemapUrls: sitemapUrlCount,
        indexedPages,
        coveragePct,
      };
    }

    if (coveragePct < 60) {
      return {
        status: 'warn',
        label: 'Indexing',
        message: `${indexedSitemapUrls}/${sitemapUrlCount} sitemap URLs indexed (${coveragePct}%)`,
        details: `${unindexedPages} pages not appearing in search results`,
        sitemapUrls: sitemapUrlCount,
        indexedPages,
        coveragePct,
      };
    }

    return {
      status: 'pass',
      label: 'Indexing',
      message: `${indexedSitemapUrls}/${sitemapUrlCount} sitemap URLs indexed (${coveragePct}%)`,
      sitemapUrls: sitemapUrlCount,
      indexedPages,
      coveragePct,
    };
  } catch (e) {
    return { status: 'error', label: 'Indexing', message: `Could not check: ${providerErrorMessage(e).slice(0, 60)}` };
  }
}

export async function fetchScTopPageUrls(site: Site, rowLimit: number): Promise<string[]> {
  if (site.searchConsole === false) return [];
  try {
    const res = await getSc().searchanalytics.query({
      siteUrl: formatScUrl(site),
      requestBody: {
        startDate: dateOnlyDaysBack(30),
        endDate: dateOnlyDaysBack(1),
        dimensions: ['page'],
        rowLimit,
      },
    }, { timeout: GOOGLE_API_TIMEOUT_MS });
    return (res.data.rows || []).map(r => r.keys?.[0] || '').filter(Boolean);
  } catch {
    return [];
  }
}
