import { getManagedSites, type Site } from './sites';
import { normalizeSkipChecks, type SkipCheckId } from './skip-checks';
import { checkIndexNowKey } from './indexnow.js';
import { withCache, CACHE_TTL_WEEK } from './db';
import { FETCH_TIMEOUT, GOOGLEBOT_UA, safeFetch } from './audit-fetch';
import { createFailedSiteAuditResult, normalizeSiteAuditResult } from './audit-results';
import {
  checkIndexingCoverage,
  checkScSitemapFreshness,
  checkUrlInspectionForSite,
  fetchScTopPageUrls,
} from './audit-search-console';
import { checkCanonicalUrl, parseMetaTags } from './audit-meta';
import { checkImageSeo, checkInternalLinks, enrichInternalLinkResult } from './audit-page-assets';
import { checkSitemap, enrichSitemapResult } from './audit-sitemap';
import type {
  CheckResult,
  CheckStatus,
  ImageSeoResult,
  InternalLinkResult,
  MetaTagResult,
  OgImageResult,
  RedirectChainResult,
  RedirectHop,
  RobotsTxtResult,
  SecurityResult,
  SiteAuditResult,
  TtfbResult,
} from './audit-types';

export type {
  CheckResult,
  CheckStatus,
  FetchResult,
  SiteAuditResult,
} from './audit-types';
export { createFailedSiteAuditResult, normalizeSiteAuditResult } from './audit-results';
export { checkCanonicalUrl, extractMeta, makeCheck, parseMetaTags } from './audit-meta';
export { checkImageSeo, checkInternalLinks } from './audit-page-assets';
export { extractLocsFromSitemap } from './audit-sitemap';

function applySkipToCheck<T extends CheckResult>(check: T, skip: Set<SkipCheckId>, checkId: SkipCheckId): T {
  if (!skip.has(checkId)) return check;
  return {
    ...check,
    status: 'pass',
    message: `N/A — ${check.message}`,
  };
}

export const MAX_SAMPLED_PAGES = 10;
const SITEMAP_SAMPLE_LIMIT = 5;
const SC_SAMPLE_LIMIT = 5;
export function sampleAuditPages(
  testPages: string[],
  sitemapLocs: string[],
  scPageUrls: string[],
  domain: string,
): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  const addPath = (path: string) => {
    if (seen.has(path) || result.length >= MAX_SAMPLED_PAGES) return false;
    seen.add(path);
    result.push(path);
    return true;
  };

  for (const p of testPages) {
    addPath(p.startsWith('/') ? p : `/${p}`);
  }

  let sitemapAdded = 0;
  for (const loc of sitemapLocs) {
    if (sitemapAdded >= SITEMAP_SAMPLE_LIMIT || result.length >= MAX_SAMPLED_PAGES) break;
    try {
      const url = new URL(loc);
      if (url.hostname !== domain) continue;
      const path = url.pathname + (url.search || '');
      if (addPath(path)) sitemapAdded++;
    } catch { /* skip invalid URLs */ }
  }

  let scAdded = 0;
  for (const page of scPageUrls) {
    if (scAdded >= SC_SAMPLE_LIMIT || result.length >= MAX_SAMPLED_PAGES) break;
    try {
      const url = new URL(page);
      if (url.hostname !== domain) continue;
      const path = url.pathname + (url.search || '');
      if (addPath(path)) scAdded++;
    } catch { /* skip invalid URLs */ }
  }

  return result;
}

const MAX_REDIRECT_HOPS = 10;
const PERMANENT_REDIRECT_STATUSES = new Set([301, 308]);

async function checkRobotsTxt(domain: string): Promise<RobotsTxtResult> {
  const res = await safeFetch(`https://${domain}/robots.txt`);

  if (!res.ok) {
    return {
      status: 'fail', label: 'robots.txt',
      message: res.error ? `Error: ${res.error}` : `Not found (${res.status})`,
      hasSitemapDirective: false,
    };
  }

  const lines = res.text.split('\n');
  const sitemapLine = lines.find(l => /^sitemap:/i.test(l.trim()));
  const sitemapUrl = sitemapLine?.replace(/^sitemap:\s*/i, '').trim();

  if (!sitemapLine) {
    return {
      status: 'warn', label: 'robots.txt', message: 'Found but no Sitemap directive',
      raw: res.text.slice(0, 500), hasSitemapDirective: false,
    };
  }

  return {
    status: 'pass', label: 'robots.txt', message: `Found with Sitemap: ${sitemapUrl}`,
    raw: res.text.slice(0, 500), hasSitemapDirective: true, sitemapUrl,
  };
}

async function checkOgImage(imageUrl?: string): Promise<OgImageResult> {
  if (!imageUrl) {
    return { status: 'fail', label: 'OG Image', message: 'No og:image URL found' };
  }

  const res = await safeFetch(imageUrl);
  if (!res.ok) {
    return { status: 'fail', label: 'OG Image', message: `Failed to fetch: ${res.error || `HTTP ${res.status}`}`, url: imageUrl };
  }

  const contentType = res.headers.get('content-type') || '';
  if (!contentType.startsWith('image/')) {
    return { status: 'fail', label: 'OG Image', message: `Not an image (${contentType})`, url: imageUrl, contentType };
  }

  let dimensions: string | undefined;
  if (contentType.includes('png')) {
    try {
      const imgRes = await fetch(imageUrl, { signal: AbortSignal.timeout(FETCH_TIMEOUT) });
      const buf = await imgRes.arrayBuffer();
      if (buf.byteLength >= 24) {
        const view = new DataView(buf);
        const width = view.getUint32(16);
        const height = view.getUint32(20);
        dimensions = `${width}x${height}`;
      }
    } catch { /* ignore */ }
  }

  if (dimensions === '1200x630') {
    return { status: 'pass', label: 'OG Image', message: `Valid (${dimensions})`, url: imageUrl, contentType, dimensions };
  }
  if (dimensions) {
    return { status: 'warn', label: 'OG Image', message: `Valid but ${dimensions} (expected 1200x630)`, url: imageUrl, contentType, dimensions };
  }

  return { status: 'pass', label: 'OG Image', message: `Valid image (${contentType})`, url: imageUrl, contentType };
}

async function checkTtfb(domain: string): Promise<TtfbResult> {
  const res = await safeFetch(`https://${domain}/`);

  if (!res.ok) {
    return { status: 'error', label: 'TTFB', message: res.error || `HTTP ${res.status}`, ms: res.ttfbMs };
  }

  const ms = res.ttfbMs;
  if (ms < 800) return { status: 'pass', label: 'TTFB', message: `${ms}ms`, ms };
  if (ms < 2000) return { status: 'warn', label: 'TTFB', message: `${ms}ms (slow)`, ms };
  return { status: 'fail', label: 'TTFB', message: `${ms}ms (very slow)`, ms };
}

function formatRedirectChainDetails(hops: RedirectHop[], finalUrl: string): string {
  if (hops.length === 0) return finalUrl;

  const parts = hops.map((hop) => `${hop.url} (${hop.status})`);
  const lastLocation = hops[hops.length - 1]?.location;
  if (lastLocation && lastLocation === finalUrl) {
    parts.push(finalUrl);
  }

  return parts.join(' -> ');
}

function isPermanentRedirectStatus(status: number): boolean {
  return PERMANENT_REDIRECT_STATUSES.has(status);
}

async function checkRedirectChain(pageUrl: string, page: string): Promise<RedirectChainResult> {
  const seen = new Set<string>();
  const hops: RedirectHop[] = [];
  let currentUrl = pageUrl;
  let finalUrl = pageUrl;
  let hasTemporaryRedirect = false;

  for (let depth = 0; depth < MAX_REDIRECT_HOPS; depth++) {
    if (seen.has(currentUrl)) {
      return {
        status: 'fail',
        label: 'Redirect Chain',
        message: 'Redirect loop detected',
        details: formatRedirectChainDetails(hops, finalUrl),
        page,
        requestedUrl: pageUrl,
        finalUrl,
        hops,
        hopCount: hops.length,
        hasTemporaryRedirect,
        loopDetected: true,
      };
    }

    seen.add(currentUrl);
    const res = await safeFetch(currentUrl, { ua: GOOGLEBOT_UA, redirect: 'manual' });

    if (res.status < 300 || res.status >= 400) {
      finalUrl = currentUrl;

      if (!res.ok) {
        return {
          status: 'error',
          label: 'Redirect Chain',
          message: res.error ? `Could not check: ${res.error}` : `Final response HTTP ${res.status}`,
          details: formatRedirectChainDetails(hops, finalUrl),
          page,
          requestedUrl: pageUrl,
          finalUrl,
          hops,
          hopCount: hops.length,
          hasTemporaryRedirect,
          loopDetected: false,
        };
      }

      const hopCount = hops.length;
      if (hopCount === 0) {
        return {
          status: 'pass',
          label: 'Redirect Chain',
          message: 'No redirects',
          details: finalUrl,
          page,
          requestedUrl: pageUrl,
          finalUrl,
          hops,
          hopCount,
          hasTemporaryRedirect,
          loopDetected: false,
        };
      }

      if (hasTemporaryRedirect) {
        return {
          status: 'fail',
          label: 'Redirect Chain',
          message: `${hopCount} hop${hopCount === 1 ? '' : 's'} with temporary redirect`,
          details: formatRedirectChainDetails(hops, finalUrl),
          page,
          requestedUrl: pageUrl,
          finalUrl,
          hops,
          hopCount,
          hasTemporaryRedirect,
          loopDetected: false,
        };
      }

      const status: CheckStatus = hopCount === 1 ? 'pass' : hopCount === 2 ? 'warn' : 'fail';
      return {
        status,
        label: 'Redirect Chain',
        message:
          hopCount === 1
            ? '1 permanent redirect hop'
            : `${hopCount} redirect hops`,
        details: formatRedirectChainDetails(hops, finalUrl),
        page,
        requestedUrl: pageUrl,
        finalUrl,
        hops,
        hopCount,
        hasTemporaryRedirect,
        loopDetected: false,
      };
    }

    const location = res.headers.get('location');
    if (!location) {
      return {
        status: 'fail',
        label: 'Redirect Chain',
        message: `Redirect missing Location header (${res.status})`,
        details: formatRedirectChainDetails(hops, finalUrl),
        page,
        requestedUrl: pageUrl,
        finalUrl,
        hops,
        hopCount: hops.length,
        hasTemporaryRedirect,
        loopDetected: false,
      };
    }

    let nextUrl: string;
    try {
      nextUrl = new URL(location, currentUrl).toString();
    } catch {
      return {
        status: 'fail',
        label: 'Redirect Chain',
        message: `Invalid redirect target (${res.status})`,
        details: location,
        page,
        requestedUrl: pageUrl,
        finalUrl,
        hops,
        hopCount: hops.length,
        hasTemporaryRedirect,
        loopDetected: false,
      };
    }

    if (!isPermanentRedirectStatus(res.status)) {
      hasTemporaryRedirect = true;
    }

    hops.push({
      url: currentUrl,
      status: res.status,
      location: nextUrl,
    });
    finalUrl = nextUrl;
    currentUrl = nextUrl;
  }

  return {
    status: 'fail',
    label: 'Redirect Chain',
    message: `Exceeded ${MAX_REDIRECT_HOPS} redirect hops`,
    details: formatRedirectChainDetails(hops, finalUrl),
    page,
    requestedUrl: pageUrl,
    finalUrl,
    hops,
    hopCount: hops.length,
    hasTemporaryRedirect,
    loopDetected: false,
  };
}

async function checkSecurity(domain: string): Promise<SecurityResult> {
  // HTTPS: fetch http:// and check if it redirects to https://
  let httpsCheck: CheckResult;
  try {
    const res = await fetch(`http://${domain}/`, {
      signal: AbortSignal.timeout(10_000),
      redirect: 'manual',
    });
    const location = res.headers.get('location') || '';
    if (res.status >= 300 && res.status < 400 && location.startsWith('https://')) {
      httpsCheck = { status: 'pass', label: 'HTTPS', message: 'HTTP redirects to HTTPS' };
    } else if (res.status >= 300 && res.status < 400) {
      httpsCheck = { status: 'warn', label: 'HTTPS', message: `Redirects to ${location.slice(0, 60)}` };
    } else {
      httpsCheck = { status: 'fail', label: 'HTTPS', message: 'No HTTPS redirect — site serves over HTTP' };
    }
  } catch {
    // Connection refused on port 80 usually means HTTPS-only (good)
    httpsCheck = { status: 'pass', label: 'HTTPS', message: 'HTTPS only (HTTP not available)' };
  }

  // HSTS + favicon: fetch the HTTPS page
  const httpsRes = await safeFetch(`https://${domain}/`);
  const hstsHeader = httpsRes.headers.get('strict-transport-security');
  const hstsCheck: CheckResult = hstsHeader
    ? { status: 'pass', label: 'HSTS', message: `Present: ${hstsHeader.slice(0, 80)}` }
    : { status: 'warn', label: 'HSTS', message: 'Missing Strict-Transport-Security header' };

  // Favicon
  const faviconRes = await safeFetch(`https://${domain}/favicon.ico`);
  const faviconCheck: CheckResult = faviconRes.ok
    ? { status: 'pass', label: 'Favicon', message: 'Found' }
    : { status: 'warn', label: 'Favicon', message: 'Missing /favicon.ico' };

  return { https: httpsCheck, hsts: hstsCheck, favicon: faviconCheck };
}

async function auditSite(site: Site): Promise<SiteAuditResult> {
  const skip = new Set(normalizeSkipChecks(site.skipChecks));
  const shouldVerifyBrokenLinks = !skip.has('internalLinks') && !skip.has('brokenLinks');
  const robotsTxt = await checkRobotsTxt(site.domain);

  const [rawSitemap, ttfb, security, scSitemapFreshness, scTopPageUrls, indexNow, urlInspection] = await Promise.all([
    checkSitemap(site.domain, robotsTxt.sitemapUrl),
    checkTtfb(site.domain),
    checkSecurity(site.domain),
    checkScSitemapFreshness(site),
    fetchScTopPageUrls(site, SC_SAMPLE_LIMIT * 2),
    checkIndexNowKey(site) as Promise<CheckResult>,
    checkUrlInspectionForSite(site),
  ]);
  const sitemap = await enrichSitemapResult(rawSitemap);

  const sampledPages = sampleAuditPages(
    site.testPages,
    sitemap.locs ?? [],
    scTopPageUrls,
    site.domain,
  );

  // Indexing coverage: compare sitemap URLs vs pages in search results
  const indexingCoverage = await checkIndexingCoverage(site, sitemap.urlCount);

  // Fetch sampled pages sequentially to avoid rate-limiting
  const pageResults: { redirectChain: RedirectChainResult; meta: MetaTagResult; images: ImageSeoResult; links: InternalLinkResult }[] = [];
  for (const page of sampledPages) {
    const pageUrl = `https://${site.domain}${page}`;
    const redirectChain = await checkRedirectChain(pageUrl, page);
    const res = await safeFetch(pageUrl, { ua: GOOGLEBOT_UA });
    const meta = parseMetaTags(res, page);
    if (res.ok) {
      const canonicalCheck = await checkCanonicalUrl(pageUrl, meta.canonicalTarget);
      meta.canonical = canonicalCheck.check;
      meta.canonicalValid = canonicalCheck.canonicalValid;
      meta.canonicalStatus = canonicalCheck.canonicalStatus;
      meta.canonicalTarget = canonicalCheck.canonicalTarget;
    }
    pageResults.push({
      redirectChain,
      meta,
      images: res.ok ? checkImageSeo(res.text, page) : { page, totalImages: 0, withAlt: 0, withoutAlt: 0, withLazyLoading: 0, status: 'error' as CheckStatus, label: 'Images', message: res.error || `HTTP ${res.status}`, images: [] },
      links: res.ok
        ? shouldVerifyBrokenLinks
          ? await enrichInternalLinkResult(res.text, site.domain, page)
          : checkInternalLinks(res.text, site.domain, page)
        : {
            page,
            internalLinks: 0,
            externalLinks: 0,
            checkedInternalLinks: 0,
            brokenLinks: [],
            brokenLinksMessage: res.error || `HTTP ${res.status}`,
            status: 'error' as CheckStatus,
            label: 'Internal Links',
            message: res.error || `HTTP ${res.status}`,
          },
    });
  }

  const redirectChains = pageResults.map(r => r.redirectChain);
  const metaTags = pageResults.map(r => r.meta);
  const imageSeo = pageResults.map(r => r.images);
  const internalLinks = pageResults.map(r => r.links);

  const ogImageUrl = metaTags.find(m => m.ogImageUrl)?.ogImageUrl;
  const ogImage = await checkOgImage(ogImageUrl);

  // Apply skipChecks: replace skipped checks with a neutral pass so they don't affect the score
  const skippedRobotsTxt = applySkipToCheck(robotsTxt, skip, 'robotsTxt');
  const skippedSitemap = applySkipToCheck(sitemap, skip, 'sitemap');
  const skippedScSitemapFreshness = applySkipToCheck(scSitemapFreshness, skip, 'scSitemap');
  const skippedIndexingCoverage = applySkipToCheck(indexingCoverage, skip, 'indexing');
  const skippedIndexNow = applySkipToCheck(indexNow, skip, 'indexNow');
  const skippedUrlInspection = urlInspection.map((result) => applySkipToCheck(result, skip, 'urlInspection'));
  const skippedRedirectChains = redirectChains.map(chain => applySkipToCheck(chain, skip, 'redirectChain'));
  const skippedOgImage = applySkipToCheck(ogImage, skip, 'ogImage');
  const skippedTtfb = applySkipToCheck(ttfb, skip, 'ttfb');
  const skippedSecurity = {
    https: applySkipToCheck(security.https, skip, 'https'),
    hsts: applySkipToCheck(security.hsts, skip, 'hsts'),
    favicon: applySkipToCheck(security.favicon, skip, 'favicon'),
  };
  const skippedMetaTags = metaTags.map(meta => ({
    ...meta,
    title: applySkipToCheck(meta.title, skip, 'title'),
    description: applySkipToCheck(meta.description, skip, 'description'),
    ogTitle: applySkipToCheck(meta.ogTitle, skip, 'ogTitle'),
    ogImage: applySkipToCheck(meta.ogImage, skip, 'ogImageMeta'),
    ogDescription: applySkipToCheck(meta.ogDescription, skip, 'ogDescription'),
    twitterCard: applySkipToCheck(meta.twitterCard, skip, 'twitterCard'),
    canonical: applySkipToCheck(meta.canonical, skip, 'canonical'),
    jsonLd: applySkipToCheck(meta.jsonLd, skip, 'jsonLd'),
  }));
  const skippedImageSeo = imageSeo.map(image => applySkipToCheck(image, skip, 'images'));
  const shouldSkipBrokenLinkReporting = skip.has('internalLinks') || skip.has('brokenLinks');
  const skippedInternalLinks = internalLinks.map(link => {
    const skippedLink = applySkipToCheck(link, skip, 'internalLinks');
    if (shouldSkipBrokenLinkReporting) {
      return {
        ...skippedLink,
        checkedInternalLinks: 0,
        brokenLinks: [],
        brokenLinksMessage: 'N/A — broken-link verification skipped',
      };
    }
    return skippedLink;
  });

  const brokenLinkPenaltyChecks = shouldSkipBrokenLinkReporting
    ? []
    : skippedInternalLinks.flatMap((link) =>
        link.brokenLinks.map((brokenLink) => ({
          status: 'fail' as const,
          label: 'Broken Link',
          message: `${link.page} -> ${brokenLink.url} (${brokenLink.status || 'timeout'})`,
        })),
      );

  const allChecks: CheckResult[] = [
    skippedRobotsTxt,
    skippedSitemap,
    skippedScSitemapFreshness,
    skippedIndexingCoverage,
    skippedIndexNow,
    ...skippedUrlInspection,
    ...skippedRedirectChains,
    skippedOgImage,
    skippedTtfb,
    skippedSecurity.https,
    skippedSecurity.hsts,
    skippedSecurity.favicon,
    ...skippedMetaTags.flatMap(m => [m.title, m.description, m.ogTitle, m.ogImage, m.ogDescription, m.twitterCard, m.canonical, m.jsonLd]),
    ...skippedImageSeo,
    ...skippedInternalLinks,
    ...brokenLinkPenaltyChecks,
  ];

  const score = allChecks.reduce(
    (acc, c) => { acc[c.status]++; acc.total++; return acc; },
    { pass: 0, warn: 0, fail: 0, error: 0, total: 0 }
  );

  return {
    siteId: site.id,
    domain: site.domain,
    timestamp: Date.now(),
    robotsTxt: skippedRobotsTxt,
    sitemap: skippedSitemap,
    scSitemapFreshness: skippedScSitemapFreshness,
    indexingCoverage: skippedIndexingCoverage,
    indexNow: skippedIndexNow,
    urlInspection: skippedUrlInspection,
    redirectChains: skippedRedirectChains,
    metaTags: skippedMetaTags,
    ogImage: skippedOgImage,
    ttfb: skippedTtfb,
    imageSeo: skippedImageSeo,
    internalLinks: skippedInternalLinks,
    security: skippedSecurity,
    score,
    sampledPages,
  };
}

export async function runSiteAudit(site: Site): Promise<SiteAuditResult> {
  return auditSite(site);
}

async function auditAllSites(): Promise<SiteAuditResult[]> {
  const sites = await getManagedSites();
  return Promise.all(sites.map(async (site) => {
    try {
      return await auditSite(site);
    } catch (error) {
      console.error(`[Audit] ${site.id}:`, error);
      return createFailedSiteAuditResult(site);
    }
  }));
}

// --- Cached versions ---

export async function cachedAuditSite(site: Site): Promise<SiteAuditResult> {
  const audit = (await withCache<SiteAuditResult>('audit', site.id, () => runSiteAudit(site), CACHE_TTL_WEEK))!;
  return normalizeSiteAuditResult(audit);
}

export async function cachedAuditAllSites(): Promise<SiteAuditResult[]> {
  const sites = await getManagedSites();
  return Promise.all(sites.map(async (site) => {
    try {
      return await cachedAuditSite(site);
    } catch (error) {
      console.error(`[Audit] ${site.id}:`, error);
      return createFailedSiteAuditResult(site);
    }
  }));
}
