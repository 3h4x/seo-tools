import { withCache } from './db';
import { cachedGetSearchConsolePages } from './search-console';
import { normalizeSiteDomain } from './site-domain';
import { getSCUrl, type Site } from './sites';

const GOOGLEBOT_UA = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';
const FETCH_TIMEOUT_MS = 30_000;
const CROSS_LINK_TTL_MS = 24 * 60 * 60 * 1000;

interface CrossLinkTarget {
  targetSiteId: string;
  targetSiteName: string;
  targetDomain: string;
  linkedPages: number | null;
  missingPages: number | null;
  linkedExamples: string[];
}

export type CrossLinkSourceStatus =
  | 'ok'
  | 'disabled'
  | 'search-console-unavailable'
  | 'crawl-unavailable'
  | 'no-pages';

export interface CrossLinkSourceMatrix {
  sourceSiteId: string;
  sourceSiteName: string;
  sourceDomain: string;
  status: CrossLinkSourceStatus;
  attemptedPages: number;
  crawledPages: number;
  failedPages: number;
  targets: CrossLinkTarget[];
}

interface CrawledPageLinks {
  page: string;
  ok: boolean;
  linkedTargetSiteIds: string[];
}

function buildUnavailableTargets(
  sourceSiteId: string,
  managedSites: Site[],
): CrossLinkTarget[] {
  return managedSites
    .filter((target) => target.id !== sourceSiteId)
    .map((target) => ({
      targetSiteId: target.id,
      targetSiteName: target.name,
      targetDomain: target.domain,
      linkedPages: null,
      missingPages: null,
      linkedExamples: [],
    }));
}

function normalizePageUrl(domain: string, page: string): string | null {
  if (!page) return null;
  try {
    const url = new URL(page, `https://${domain}`);
    return url.toString();
  } catch {
    return null;
  }
}

function hostnameMatchesDomain(hostname: string, domain: string): boolean {
  return hostname === domain || hostname.endsWith(`.${domain}`);
}

function getBestMatchingManagedSite(hostname: string, managedSites: Site[]): Site | null {
  let bestMatch: Site | null = null;

  for (const site of managedSites) {
    if (!hostnameMatchesDomain(hostname, site.domain)) continue;
    if (!bestMatch || site.domain.length > bestMatch.domain.length) {
      bestMatch = site;
    }
  }

  return bestMatch;
}

function extractManagedLinkTargets(
  html: string,
  pageUrl: string,
  sourceSiteId: string,
  managedSites: Site[],
): string[] {
  const matches = html.match(/<a\b[^>]*\bhref=["']([^"'#]*?)["'][^>]*>/gi) || [];
  const linkedSiteIds = new Set<string>();

  for (const tag of matches) {
    const hrefMatch = tag.match(/href=["']([^"'#]*?)["']/i);
    if (!hrefMatch) continue;

    const href = hrefMatch[1];
    if (!href || href.startsWith('mailto:') || href.startsWith('javascript:')) continue;

    let targetHostname: string | null = null;
    try {
      targetHostname = normalizeSiteDomain(new URL(href, pageUrl).hostname);
    } catch {
      targetHostname = null;
    }

    if (!targetHostname) continue;

    const targetSite = getBestMatchingManagedSite(targetHostname, managedSites);
    if (!targetSite || targetSite.id === sourceSiteId) continue;
    linkedSiteIds.add(targetSite.id);
  }

  return [...linkedSiteIds];
}

async function fetchLinkedTargetsForPage(
  site: Site,
  pageUrl: string,
  managedSites: Site[],
): Promise<CrawledPageLinks> {
  try {
    const res = await fetch(pageUrl, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { 'User-Agent': GOOGLEBOT_UA },
    });

    if (!res.ok) {
      return { page: pageUrl, ok: false, linkedTargetSiteIds: [] };
    }

    const html = await res.text();
    return {
      page: pageUrl,
      ok: true,
      linkedTargetSiteIds: extractManagedLinkTargets(html, pageUrl, site.id, managedSites),
    };
  } catch (error) {
    console.error(`Error crawling cross-links for ${site.id} ${pageUrl}:`, error);
    return { page: pageUrl, ok: false, linkedTargetSiteIds: [] };
  }
}

async function getCrossLinksForSourceSite(
  site: Site,
  managedSites: Site[],
): Promise<CrossLinkSourceMatrix> {
  if (site.searchConsole === false) {
    return {
      sourceSiteId: site.id,
      sourceSiteName: site.name,
      sourceDomain: site.domain,
      status: 'disabled',
      attemptedPages: 0,
      crawledPages: 0,
      failedPages: 0,
      targets: buildUnavailableTargets(site.id, managedSites),
    };
  }

  const topPages = await cachedGetSearchConsolePages(getSCUrl(site));
  if (topPages === null) {
    return {
      sourceSiteId: site.id,
      sourceSiteName: site.name,
      sourceDomain: site.domain,
      status: 'search-console-unavailable',
      attemptedPages: 0,
      crawledPages: 0,
      failedPages: 0,
      targets: buildUnavailableTargets(site.id, managedSites),
    };
  }

  const pageUrls = (topPages ?? [])
    .slice(0, 20)
    .map((row) => normalizePageUrl(site.domain, row.page))
    .filter((pageUrl): pageUrl is string => pageUrl !== null);

  if (pageUrls.length === 0) {
    return {
      sourceSiteId: site.id,
      sourceSiteName: site.name,
      sourceDomain: site.domain,
      status: 'no-pages',
      attemptedPages: 0,
      crawledPages: 0,
      failedPages: 0,
      targets: buildUnavailableTargets(site.id, managedSites),
    };
  }

  const pageResults = await Promise.all(
    pageUrls.map((pageUrl) => fetchLinkedTargetsForPage(site, pageUrl, managedSites)),
  );
  const crawledPages = pageResults.filter((page) => page.ok);
  const failedPages = pageResults.length - crawledPages.length;

  if (crawledPages.length === 0) {
    return {
      sourceSiteId: site.id,
      sourceSiteName: site.name,
      sourceDomain: site.domain,
      status: 'crawl-unavailable',
      attemptedPages: pageResults.length,
      crawledPages: 0,
      failedPages,
      targets: buildUnavailableTargets(site.id, managedSites),
    };
  }

  return {
    sourceSiteId: site.id,
    sourceSiteName: site.name,
    sourceDomain: site.domain,
    status: 'ok',
    attemptedPages: pageResults.length,
    crawledPages: crawledPages.length,
    failedPages,
    targets: managedSites
      .filter((target) => target.id !== site.id)
      .map((target) => {
        const linkedExamples = crawledPages
          .filter((page) => page.linkedTargetSiteIds.includes(target.id))
          .map((page) => page.page)
          .slice(0, 3);

        return {
          targetSiteId: target.id,
          targetSiteName: target.name,
          targetDomain: target.domain,
          linkedPages: linkedExamples.length === 0
            ? 0
            : crawledPages.filter((page) => page.linkedTargetSiteIds.includes(target.id)).length,
          missingPages: crawledPages.filter((page) => !page.linkedTargetSiteIds.includes(target.id)).length,
          linkedExamples,
        };
      }),
  };
}

export async function getCrossLinkMatrix(sites: Site[]): Promise<CrossLinkSourceMatrix[]> {
  return Promise.all(
    sites.map((site) => withCache<CrossLinkSourceMatrix>(
      'cross-links-matrix',
      site.id,
      () => getCrossLinksForSourceSite(site, sites),
      CROSS_LINK_TTL_MS,
    )),
  ).then((rows) => rows.filter((row): row is CrossLinkSourceMatrix => row !== null));
}
