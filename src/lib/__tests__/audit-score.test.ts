import { describe, expect, it } from 'vitest';

import { buildSiteAuditResult } from '../audit-score';
import type { SkipCheckId } from '../skip-checks';
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
  TtfbResult,
  UrlInspectionPageResult,
} from '../audit-types';

type BuildInput = Parameters<typeof buildSiteAuditResult>[0];

function check(status: CheckResult['status'] = 'pass', label = 'Check'): CheckResult {
  return { status, label, message: `${label} ${status}` };
}

function metaTag(overrides: Partial<MetaTagResult> = {}): MetaTagResult {
  return {
    page: '/',
    noindex: false,
    canonicalValid: true,
    canonicalStatus: 200,
    canonicalTarget: 'https://example.com/',
    title: check('pass', 'Title'),
    description: check('pass', 'Description'),
    ogTitle: check('pass', 'OG Title'),
    ogImage: check('pass', 'OG Image Meta'),
    ogDescription: check('pass', 'OG Description'),
    twitterCard: check('pass', 'Twitter Card'),
    canonical: check('pass', 'Canonical'),
    jsonLd: check('pass', 'JSON-LD'),
    ...overrides,
  };
}

function imageSeo(overrides: Partial<ImageSeoResult> = {}): ImageSeoResult {
  return {
    page: '/',
    totalImages: 1,
    withAlt: 1,
    withoutAlt: 0,
    withLazyLoading: 1,
    status: 'pass',
    label: 'Images',
    message: '1/1 images have alt text',
    images: [],
    ...overrides,
  };
}

function internalLinks(overrides: Partial<InternalLinkResult> = {}): InternalLinkResult {
  return {
    page: '/',
    internalLinks: 3,
    externalLinks: 0,
    checkedInternalLinks: 3,
    brokenLinks: [],
    brokenLinksMessage: 'Checked 3 unique internal links, all reachable',
    status: 'pass',
    label: 'Internal Links',
    message: '3 internal links',
    ...overrides,
  };
}

function redirectChain(overrides: Partial<RedirectChainResult> = {}): RedirectChainResult {
  return {
    page: '/',
    requestedUrl: 'https://example.com/',
    finalUrl: 'https://example.com/',
    hops: [],
    hopCount: 0,
    hasTemporaryRedirect: false,
    loopDetected: false,
    status: 'pass',
    label: 'Redirect Chain',
    message: 'No redirects',
    ...overrides,
  };
}

function makeInput(overrides: Partial<BuildInput> = {}): BuildInput {
  return {
    siteId: 'site-1',
    domain: 'example.com',
    skip: new Set<SkipCheckId>(),
    robotsTxt: { ...check('pass', 'robots.txt'), hasSitemapDirective: true } as RobotsTxtResult,
    sitemap: { ...check('pass', 'Sitemap'), urlCount: 1 } as SitemapResult,
    scSitemapFreshness: check('pass', 'SC Sitemap'),
    indexingCoverage: { ...check('pass', 'Indexing'), indexedPages: 1 } as IndexingCoverageResult,
    indexNow: check('pass', 'IndexNow'),
    urlInspection: [check('pass', 'URL Inspection') as UrlInspectionPageResult],
    redirectChains: [redirectChain()],
    metaTags: [metaTag()],
    ogImage: check('pass', 'OG Image') as OgImageResult,
    ttfb: { ...check('pass', 'TTFB'), ms: 100 } as TtfbResult,
    imageSeo: [imageSeo()],
    internalLinks: [internalLinks()],
    security: {
      https: check('pass', 'HTTPS'),
      hsts: check('pass', 'HSTS'),
      favicon: check('pass', 'Favicon'),
    } as SecurityResult,
    sampledPages: ['/'],
    ...overrides,
  };
}

describe('buildSiteAuditResult', () => {
  it('assembles a site audit and scores all nested checks', () => {
    const result = buildSiteAuditResult(makeInput({
      robotsTxt: { ...check('warn', 'robots.txt'), hasSitemapDirective: false },
      indexingCoverage: { ...check('error', 'Indexing'), indexedPages: 0 } as IndexingCoverageResult,
      metaTags: [metaTag({ jsonLd: check('fail', 'JSON-LD') })],
      internalLinks: [internalLinks({
        brokenLinks: [
          { url: 'https://example.com/missing', status: 404 },
          { url: 'https://example.com/gone', status: 410 },
        ],
        brokenLinksMessage: '2 broken',
      })],
    }));

    expect(result.siteId).toBe('site-1');
    expect(result.domain).toBe('example.com');
    expect(result.sampledPages).toEqual(['/']);
    expect(result.score).toEqual({ pass: 19, warn: 1, fail: 3, error: 1, total: 24 });
  });

  it('marks skipped checks as pass with an N/A message before scoring', () => {
    const result = buildSiteAuditResult(makeInput({
      skip: new Set<SkipCheckId>(['robotsTxt', 'title', 'internalLinks']),
      robotsTxt: { ...check('fail', 'robots.txt'), hasSitemapDirective: false },
      metaTags: [metaTag({ title: check('fail', 'Title') })],
      internalLinks: [internalLinks({
        status: 'fail',
        message: 'No internal links',
        internalLinks: 0,
        checkedInternalLinks: 2,
        brokenLinks: [{ url: 'https://example.com/missing', status: 404 }],
        brokenLinksMessage: '1 broken',
      })],
    }));

    expect(result.robotsTxt.status).toBe('pass');
    expect(result.robotsTxt.message).toContain('N/A');
    expect(result.metaTags[0].title.status).toBe('pass');
    expect(result.internalLinks[0]).toMatchObject({
      status: 'pass',
      checkedInternalLinks: 0,
      brokenLinks: [],
      brokenLinksMessage: 'N/A — broken-link verification skipped',
    });
    expect(result.score).toEqual({ pass: 22, warn: 0, fail: 0, error: 0, total: 22 });
  });

  it('can skip broken-link penalties without skipping internal-link scoring', () => {
    const result = buildSiteAuditResult(makeInput({
      skip: new Set<SkipCheckId>(['brokenLinks']),
      internalLinks: [internalLinks({
        status: 'warn',
        message: '1 internal link',
        internalLinks: 1,
        checkedInternalLinks: 1,
        brokenLinks: [{ url: 'https://example.com/missing', status: 404 }],
        brokenLinksMessage: '1 broken',
      })],
    }));

    expect(result.internalLinks[0]).toMatchObject({
      status: 'warn',
      checkedInternalLinks: 0,
      brokenLinks: [],
      brokenLinksMessage: 'N/A — broken-link verification skipped',
    });
    expect(result.score).toEqual({ pass: 21, warn: 1, fail: 0, error: 0, total: 22 });
  });
});
