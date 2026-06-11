import type { SkipCheckId } from './skip-checks';
import type {
  CheckResult,
  ImageSeoResult,
  IndexingCoverageResult,
  InternalLinkResult,
  MetaTagResult,
  OgImageResult,
  RedirectChainResult,
  RobotsTxtResult,
  SecurityResult,
  SitemapResult,
  SiteAuditResult,
  TtfbResult,
  UrlInspectionPageResult,
} from './audit-types';

interface BuildSiteAuditResultInput {
  siteId: string;
  domain: string;
  skip: Set<SkipCheckId>;
  robotsTxt: RobotsTxtResult;
  sitemap: SitemapResult;
  scSitemapFreshness: CheckResult;
  indexingCoverage: IndexingCoverageResult;
  indexNow: CheckResult;
  urlInspection: UrlInspectionPageResult[];
  redirectChains: RedirectChainResult[];
  metaTags: MetaTagResult[];
  ogImage: OgImageResult;
  ttfb: TtfbResult;
  imageSeo: ImageSeoResult[];
  internalLinks: InternalLinkResult[];
  security: SecurityResult;
  sampledPages: string[];
}

function applySkipToCheck<T extends CheckResult>(check: T, skip: Set<SkipCheckId>, checkId: SkipCheckId): T {
  if (!skip.has(checkId)) return check;
  return {
    ...check,
    status: 'pass',
    message: `N/A — ${check.message}`,
  };
}

function calculateScore(checks: CheckResult[]): SiteAuditResult['score'] {
  return checks.reduce(
    (acc, c) => { acc[c.status]++; acc.total++; return acc; },
    { pass: 0, warn: 0, fail: 0, error: 0, total: 0 },
  );
}

export function buildSiteAuditResult(input: BuildSiteAuditResultInput): SiteAuditResult {
  const {
    siteId,
    domain,
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
  } = input;

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

  return {
    siteId,
    domain,
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
    score: calculateScore(allChecks),
    sampledPages,
  };
}
