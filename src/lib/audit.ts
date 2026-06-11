import { getManagedSites, type Site } from './sites';
import { normalizeSkipChecks } from './skip-checks';
import { checkIndexNowKey } from './indexnow.js';
import { withCache, CACHE_TTL_WEEK } from './db';
import { GOOGLEBOT_UA, safeFetch } from './audit-fetch';
import { checkOgImage, checkRedirectChain, checkRobotsTxt, checkSecurity, checkTtfb } from './audit-checks';
import { createFailedSiteAuditResult, normalizeSiteAuditResult } from './audit-results';
import { buildSiteAuditResult } from './audit-score';
import {
  checkIndexingCoverage,
  checkScSitemapFreshness,
  checkUrlInspectionForSite,
  fetchScTopPageUrls,
} from './audit-search-console';
import { checkCanonicalUrl, parseMetaTags } from './audit-meta';
import { checkImageSeo, checkInternalLinks, enrichInternalLinkResult } from './audit-page-assets';
import { MAX_SAMPLED_PAGES, sampleAuditPages } from './audit-sampling';
import { checkSitemap, enrichSitemapResult } from './audit-sitemap';
import type {
  CheckResult,
  CheckStatus,
  ImageSeoResult,
  InternalLinkResult,
  MetaTagResult,
  RedirectChainResult,
  SiteAuditResult,
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
export { MAX_SAMPLED_PAGES, sampleAuditPages } from './audit-sampling';
export { extractLocsFromSitemap } from './audit-sitemap';

const SC_SAMPLE_LIMIT = 5;

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

  return buildSiteAuditResult({
    siteId: site.id,
    domain: site.domain,
    skip,
    robotsTxt,
    sitemap,
    scSitemapFreshness,
    indexingCoverage,
    indexNow,
    urlInspection,
    redirectChains,
    metaTags,
    ogImage,
    ttfb,
    imageSeo,
    internalLinks,
    security,
    sampledPages,
  });
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
