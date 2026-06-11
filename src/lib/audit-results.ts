import type { Site } from './sites';
import type { CheckResult, SiteAuditResult } from './audit-types';

const LEGACY_INDEXNOW_DEFAULT: CheckResult = {
  status: 'warn',
  label: 'IndexNow',
  message: 'Not audited (legacy cache — refresh to update)',
};

function makeAuditUnavailableCheck(label: string): CheckResult {
  return {
    status: 'error',
    label,
    message: 'Audit unavailable',
  };
}

export function createFailedSiteAuditResult(site: Site): SiteAuditResult {
  return {
    siteId: site.id,
    domain: site.domain,
    timestamp: Date.now(),
    robotsTxt: {
      ...makeAuditUnavailableCheck('robots.txt'),
      hasSitemapDirective: false,
    },
    sitemap: makeAuditUnavailableCheck('Sitemap'),
    scSitemapFreshness: makeAuditUnavailableCheck('SC Sitemap'),
    indexingCoverage: makeAuditUnavailableCheck('Indexing'),
    indexNow: makeAuditUnavailableCheck('IndexNow'),
    urlInspection: [],
    redirectChains: [],
    metaTags: [],
    ogImage: makeAuditUnavailableCheck('OG Image'),
    ttfb: makeAuditUnavailableCheck('TTFB'),
    imageSeo: [],
    internalLinks: [],
    security: {
      https: makeAuditUnavailableCheck('HTTPS'),
      hsts: makeAuditUnavailableCheck('HSTS'),
      favicon: makeAuditUnavailableCheck('Favicon'),
    },
    score: { pass: 0, warn: 0, fail: 0, error: 1, total: 1 },
    sampledPages: site.testPages ?? [],
  };
}

export function normalizeSiteAuditResult(audit: SiteAuditResult): SiteAuditResult {
  return {
    ...audit,
    indexNow: audit.indexNow ?? LEGACY_INDEXNOW_DEFAULT,
    urlInspection: audit.urlInspection ?? [],
    redirectChains: audit.redirectChains ?? [],
    internalLinks: (audit.internalLinks ?? []).map((link) => ({
      ...link,
      checkedInternalLinks: link.checkedInternalLinks ?? 0,
      brokenLinks: link.brokenLinks ?? [],
      brokenLinksMessage: link.brokenLinksMessage ?? 'Broken-link verification unavailable in cached audit',
    })),
  };
}
