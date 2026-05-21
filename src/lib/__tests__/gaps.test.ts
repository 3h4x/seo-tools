import { beforeEach, describe, it, expect, vi } from 'vitest';

const {
  mockCachedGetAnalytics,
  mockCachedGetSearchConsolePages,
} = vi.hoisted(() => ({
  mockCachedGetAnalytics: vi.fn(),
  mockCachedGetSearchConsolePages: vi.fn(),
}));

vi.mock('../ga4', () => ({
  cachedGetAnalytics: mockCachedGetAnalytics,
}));

vi.mock('../search-console', () => ({
  cachedGetSearchConsolePages: mockCachedGetSearchConsolePages,
}));

import { analyzeSiteGaps, gapsBySection, loadSiteGapSignals } from '../gaps';
import { parseMetaTags, type FetchResult, type SiteAuditResult } from '../audit';
import type { Site } from '../sites';
import { getSkipCheckId } from '../skip-checks';

beforeEach(() => {
  vi.clearAllMocks();
  mockCachedGetAnalytics.mockResolvedValue({ data: null, error: false });
  mockCachedGetSearchConsolePages.mockResolvedValue(null);
});

function makeCheckResult(status: 'pass' | 'warn' | 'fail' | 'error', label: string = '') {
  return { status, label, message: `${status} result` };
}

function makeMetaTagResult(page: string, overrides: Record<string, unknown> = {}) {
  return {
    page,
    noindex: false,
    canonicalValid: null,
    canonicalStatus: null,
    canonicalTarget: null,
    title: makeCheckResult('pass', 'title'),
    description: makeCheckResult('pass', 'description'),
    ogTitle: makeCheckResult('pass', 'og:title'),
    ogImage: makeCheckResult('pass', 'og:image'),
    ogDescription: makeCheckResult('pass', 'og:description'),
    twitterCard: makeCheckResult('pass', 'twitter:card'),
    canonical: makeCheckResult('pass', 'canonical'),
    jsonLd: makeCheckResult('pass', 'JSON-LD'),
    ...overrides,
  };
}

function makeAudit(overrides: Partial<SiteAuditResult> = {}): SiteAuditResult {
  return {
    siteId: 'testsite',
    domain: 'example.com',
    timestamp: Date.now(),
    robotsTxt: { ...makeCheckResult('pass', 'robots.txt'), hasSitemapDirective: true, raw: 'Sitemap: https://example.com/sitemap.xml', sitemapUrl: 'https://example.com/sitemap.xml' },
    sitemap: { ...makeCheckResult('pass', 'Sitemap'), url: 'https://example.com/sitemap.xml', urlCount: 10, isIndex: false, hasLastmod: true, lastmodSample: new Date().toISOString().split('T')[0] },
    scSitemapFreshness: makeCheckResult('pass', 'SC Sitemap'),
    indexingCoverage: { ...makeCheckResult('pass', 'Indexing'), indexedPages: 10 },
    indexNow: makeCheckResult('pass', 'IndexNow'),
    urlInspection: [],
    redirectChains: [],
    metaTags: [makeMetaTagResult('/')],
    ogImage: makeCheckResult('pass', 'OG Image'),
    ttfb: { ...makeCheckResult('pass', 'TTFB'), ms: 300 },
    imageSeo: [],
    internalLinks: [],
    security: {
      https: makeCheckResult('pass', 'HTTPS'),
      hsts: makeCheckResult('pass', 'HSTS'),
      favicon: makeCheckResult('pass', 'Favicon'),
    },
    score: { pass: 20, warn: 0, fail: 0, error: 0, total: 20 },
    sampledPages: ['/'],
    ...overrides,
  };
}

function makeSite(overrides: Partial<Site> = {}): Site {
  return {
    id: 'testsite',
    name: 'Test Site',
    domain: 'example.com',
    searchConsole: true,
    testPages: ['/'],
    ...overrides,
  };
}

describe('loadSiteGapSignals', () => {
  it('keeps Search Console pages when GA4 signal loading throws', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const scPages = [
      { page: 'https://example.com/pricing', clicks: 42, impressions: 420, ctr: 0.1, position: 3.4 },
    ];
    mockCachedGetSearchConsolePages.mockResolvedValueOnce(scPages);
    mockCachedGetAnalytics.mockRejectedValueOnce(new Error('GA4 unavailable'));

    const result = await loadSiteGapSignals(makeSite({ id: 'site-a' }), 'properties/123', 7);

    expect(result).toEqual({
      scTopPages: scPages,
      ga4TopPages: undefined,
      days: 7,
    });
    expect(consoleError).toHaveBeenCalledWith('[Gaps] GA4 site-a:', expect.any(Error));

    consoleError.mockRestore();
  });

  it('keeps GA4 top pages when Search Console signal loading throws', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const ga4TopPages = [
      { path: '/pricing', views: 120, users: 80, engagementRate: 0.35, avgSessionDuration: 48 },
    ];
    mockCachedGetSearchConsolePages.mockRejectedValueOnce(new Error('SC unavailable'));
    mockCachedGetAnalytics.mockResolvedValueOnce({
      data: { topPages: ga4TopPages },
      error: false,
    });

    const result = await loadSiteGapSignals(makeSite({ id: 'site-b' }), 'properties/456', 30);

    expect(result).toEqual({
      scTopPages: undefined,
      ga4TopPages,
      days: 30,
    });
    expect(consoleError).toHaveBeenCalledWith('[Gaps] SC pages site-b:', expect.any(Error));

    consoleError.mockRestore();
  });
});

describe('analyzeSiteGaps', () => {
  it('returns no gaps for a fully passing audit', () => {
    const result = analyzeSiteGaps(makeAudit(), makeSite());
    // Should at minimum have indexnow gap since it's not in KNOWN_CAPABILITIES for testsite
    const nonIndexNow = result.gaps.filter(g => g.id !== 'missing-indexnow');
    expect(nonIndexNow).toHaveLength(0);
  });

  it('includes missing-robots-txt gap when robots.txt fails', () => {
    const audit = makeAudit({
      robotsTxt: { ...makeCheckResult('fail', 'robots.txt'), hasSitemapDirective: false },
    });
    const result = analyzeSiteGaps(audit, makeSite());
    const gap = result.gaps.find(g => g.id === 'missing-robots-txt');
    expect(gap).toBeDefined();
    expect(gap?.severity).toBe('high');
    expect(gap?.category).toBe('crawlability');
  });

  it('includes missing-sitemap gap when sitemap fails', () => {
    const audit = makeAudit({
      sitemap: { ...makeCheckResult('fail', 'Sitemap') },
    });
    const result = analyzeSiteGaps(audit, makeSite());
    const gap = result.gaps.find(g => g.id === 'missing-sitemap');
    expect(gap).toBeDefined();
    expect(gap?.severity).toBe('high');
  });

  it('does not include missing-sitemap when a discovered sitemap fails health checks', () => {
    const audit = makeAudit({
      sitemap: {
        ...makeCheckResult('fail', 'Sitemap'),
        url: 'https://example.com/sitemap.xml',
        deadUrlCount: 1,
        checkedUrlCount: 3,
      },
    });
    const result = analyzeSiteGaps(audit, makeSite());
    expect(result.gaps.find(g => g.id === 'missing-sitemap')).toBeUndefined();
  });

  it('includes robots-no-sitemap-directive gap when robots.txt warns without sitemap line', () => {
    const audit = makeAudit({
      robotsTxt: { ...makeCheckResult('warn', 'robots.txt'), hasSitemapDirective: false },
    });
    const result = analyzeSiteGaps(audit, makeSite());
    const gap = result.gaps.find(g => g.id === 'robots-no-sitemap-directive');
    expect(gap).toBeDefined();
    expect(gap?.severity).toBe('low');
  });

  it('includes weak-meta-tags gap when title fails', () => {
    const audit = makeAudit({
      metaTags: [makeMetaTagResult('/', { title: makeCheckResult('fail', 'title') })],
    });
    const result = analyzeSiteGaps(audit, makeSite());
    const gap = result.gaps.find(g => g.id === 'weak-meta-tags');
    expect(gap).toBeDefined();
    expect(gap?.affectedPages).toContain('/');
  });

  it('includes low-engagement-despite-traffic when SC clicks are strong but engagement is weak', () => {
    const result = analyzeSiteGaps(makeAudit(), makeSite(), {
      days: 30,
      ga4TopPages: [
        { path: '/pricing', views: 300, users: 180, engagementRate: 0.32, avgSessionDuration: 42 },
        { path: '/docs', views: 120, users: 90, engagementRate: 0.72, avgSessionDuration: 180 },
      ],
      scTopPages: [
        { page: 'https://example.com/pricing', clicks: 88, impressions: 900, ctr: 0.1, position: 3.2 },
        { page: 'https://example.com/docs', clicks: 70, impressions: 600, ctr: 0.11, position: 4.1 },
      ],
    });

    const gap = result.gaps.find(g => g.id === 'low-engagement-despite-traffic');
    expect(gap).toBeDefined();
    expect(gap?.severity).toBe('medium');
    expect(gap?.affectedPages).toEqual(['/pricing']);
  });

  it('aggregates duplicate normalized SC pages before scoring low-engagement traffic', () => {
    const result = analyzeSiteGaps(makeAudit(), makeSite(), {
      days: 30,
      ga4TopPages: [
        { path: '/pricing', views: 300, users: 180, engagementRate: 0.32, avgSessionDuration: 42 },
      ],
      scTopPages: [
        { page: 'https://example.com/pricing', clicks: 28, impressions: 400, ctr: 0.07, position: 4.1 },
        { page: 'https://example.com/pricing/', clicks: 26, impressions: 320, ctr: 0.08125, position: 3.4 },
      ],
    });

    const gap = result.gaps.find((candidate) => candidate.id === 'low-engagement-despite-traffic');

    expect(gap).toBeDefined();
    expect(gap?.affectedPages).toEqual(['/pricing']);
    expect(gap?.description).toContain('54 Search Console clicks');
  });

  it('does not merge distinct case-sensitive SC paths when scoring low-engagement traffic', () => {
    const result = analyzeSiteGaps(makeAudit(), makeSite(), {
      days: 30,
      ga4TopPages: [
        { path: '/pricing', views: 300, users: 180, engagementRate: 0.32, avgSessionDuration: 42 },
      ],
      scTopPages: [
        { page: 'https://example.com/pricing', clicks: 30, impressions: 400, ctr: 0.075, position: 4.1 },
        { page: 'https://example.com/Pricing', clicks: 30, impressions: 320, ctr: 0.09375, position: 3.4 },
      ],
    });

    const gap = result.gaps.find((candidate) => candidate.id === 'low-engagement-despite-traffic');

    expect(gap).toBeUndefined();
  });

  it('maps low-engagement-despite-traffic into the content section', () => {
    const result = analyzeSiteGaps(makeAudit(), makeSite(), {
      days: 30,
      ga4TopPages: [
        { path: '/pricing', views: 300, users: 180, engagementRate: 0.32, avgSessionDuration: 42 },
      ],
      scTopPages: [
        { page: 'https://example.com/pricing', clicks: 88, impressions: 900, ctr: 0.1, position: 3.2 },
      ],
    });

    const sections = gapsBySection(result.gaps);

    expect(sections.content?.map((gap) => gap.id)).toContain('low-engagement-despite-traffic');
  });

  it('emits noindex-but-ranking when a noindexed page still has Search Console clicks', () => {
    const result = analyzeSiteGaps(makeAudit({
      metaTags: [makeMetaTagResult('/pricing', { noindex: true })],
    }), makeSite(), {
      scTopPages: [
        { page: 'https://example.com/pricing', clicks: 24, impressions: 240, ctr: 0.1, position: 4.2 },
      ],
    });

    const gap = result.gaps.find((candidate) => candidate.id === 'noindex-but-ranking');
    expect(gap).toBeDefined();
    expect(gap?.severity).toBe('high');
    expect(gap?.affectedPages).toEqual(['https://example.com/pricing']);
    expect(gap?.evidence).toEqual(['https://example.com/pricing · 24 clicks · 240 impressions']);
  });

  it('emits noindex-but-ranking when noindex comes from X-Robots-Tag', () => {
    const metaFromHeader = parseMetaTags({
      ok: true,
      status: 200,
      text: '<html><head><title>Pricing</title></head></html>',
      headers: new Headers({ 'x-robots-tag': 'googlebot: noindex, nofollow' }),
      ttfbMs: 50,
    } satisfies FetchResult, '/pricing');

    const result = analyzeSiteGaps(makeAudit({
      metaTags: [metaFromHeader],
    }), makeSite(), {
      scTopPages: [
        { page: 'https://example.com/pricing', clicks: 24, impressions: 240, ctr: 0.1, position: 4.2 },
      ],
    });

    expect(result.gaps.find((candidate) => candidate.id === 'noindex-but-ranking')).toBeDefined();
  });

  it('does not emit noindex-but-ranking when X-Robots-Tag noindex targets a different bot', () => {
    const metaFromHeader = parseMetaTags({
      ok: true,
      status: 200,
      text: '<html><head><title>Pricing</title></head></html>',
      headers: new Headers({ 'x-robots-tag': 'otherbot: noindex, nofollow' }),
      ttfbMs: 50,
    } satisfies FetchResult, '/pricing');

    const result = analyzeSiteGaps(makeAudit({
      metaTags: [metaFromHeader],
    }), makeSite(), {
      scTopPages: [
        { page: 'https://example.com/pricing', clicks: 24, impressions: 240, ctr: 0.1, position: 4.2 },
      ],
    });

    expect(result.gaps.find((candidate) => candidate.id === 'noindex-but-ranking')).toBeUndefined();
  });

  it('dedupes slash variants when the same noindexed page is sampled twice', () => {
    const result = analyzeSiteGaps(makeAudit({
      metaTags: [
        makeMetaTagResult('/pricing', { noindex: true }),
        makeMetaTagResult('/pricing/', { noindex: true }),
      ],
    }), makeSite(), {
      scTopPages: [
        { page: 'https://example.com/pricing', clicks: 24, impressions: 240, ctr: 0.1, position: 4.2 },
      ],
    });

    const gap = result.gaps.find((candidate) => candidate.id === 'noindex-but-ranking');
    expect(gap).toBeDefined();
    expect(gap?.affectedPages).toEqual(['https://example.com/pricing']);
    expect(gap?.evidence).toEqual(['https://example.com/pricing · 24 clicks · 240 impressions']);
    expect(gap?.description).toContain('1 noindexed page');
  });

  it('does not emit noindex-but-ranking when a noindexed page has no Search Console traffic', () => {
    const result = analyzeSiteGaps(makeAudit({
      metaTags: [makeMetaTagResult('/pricing', { noindex: true })],
    }), makeSite(), {
      scTopPages: [
        { page: 'https://example.com/docs', clicks: 24, impressions: 240, ctr: 0.1, position: 4.2 },
      ],
    });

    expect(result.gaps.find((candidate) => candidate.id === 'noindex-but-ranking')).toBeUndefined();
  });

  it('does not emit noindex-but-ranking when a ranking page is indexable', () => {
    const result = analyzeSiteGaps(makeAudit({
      metaTags: [makeMetaTagResult('/pricing')],
    }), makeSite(), {
      scTopPages: [
        { page: 'https://example.com/pricing', clicks: 24, impressions: 240, ctr: 0.1, position: 4.2 },
      ],
    });

    expect(result.gaps.find((candidate) => candidate.id === 'noindex-but-ranking')).toBeUndefined();
  });

  it('includes redirect-chains gap for unskipped redirect chain failures', () => {
    const audit = makeAudit({
      redirectChains: [{
        ...makeCheckResult('fail', 'Redirect Chain'),
        page: '/old-page',
        requestedUrl: 'https://example.com/old-page',
        finalUrl: 'https://example.com/new-page',
        hops: [],
        hopCount: 3,
        hasTemporaryRedirect: false,
        loopDetected: false,
      }],
    });
    const result = analyzeSiteGaps(audit, makeSite());
    const gap = result.gaps.find(g => g.id === 'redirect-chains');
    expect(gap).toBeDefined();
    expect(gap?.affectedPages).toContain('/old-page');
  });

  it('includes redirect-chains gap for two-hop permanent redirect warnings', () => {
    const audit = makeAudit({
      redirectChains: [{
        ...makeCheckResult('warn', 'Redirect Chain'),
        page: '/legacy',
        requestedUrl: 'https://example.com/legacy',
        finalUrl: 'https://example.com/current',
        hops: [],
        hopCount: 2,
        hasTemporaryRedirect: false,
        loopDetected: false,
      }],
    });
    const result = analyzeSiteGaps(audit, makeSite());
    const gap = result.gaps.find(g => g.id === 'redirect-chains');
    expect(gap).toBeDefined();
    expect(gap?.affectedPages).toContain('/legacy');
  });

  it('includes redirect-chains gap for single-hop temporary redirect failures', () => {
    const audit = makeAudit({
      redirectChains: [{
        ...makeCheckResult('fail', 'Redirect Chain'),
        page: '/temporary',
        requestedUrl: 'https://example.com/temporary',
        finalUrl: 'https://example.com/current',
        hops: [{ url: 'https://example.com/temporary', status: 303, location: 'https://example.com/current' }],
        hopCount: 1,
        hasTemporaryRedirect: true,
        loopDetected: false,
      }],
    });
    const result = analyzeSiteGaps(audit, makeSite());
    const gap = result.gaps.find(g => g.id === 'redirect-chains');
    expect(gap).toBeDefined();
    expect(gap?.affectedPages).toContain('/temporary');
  });

  it('does not include redirect-chains gap for skipped redirect chain checks', () => {
    const audit = makeAudit({
      redirectChains: [{
        ...makeCheckResult('pass', 'Redirect Chain'),
        page: '/old-page',
        requestedUrl: 'https://example.com/old-page',
        finalUrl: 'https://example.com/new-page',
        hops: [],
        hopCount: 3,
        hasTemporaryRedirect: true,
        loopDetected: true,
      }],
    });
    const result = analyzeSiteGaps(audit, makeSite());
    expect(result.gaps.find(g => g.id === 'redirect-chains')).toBeUndefined();
  });

  it('includes missing-og-image gap when og image fails', () => {
    const audit = makeAudit({ ogImage: makeCheckResult('fail', 'OG Image') });
    const result = analyzeSiteGaps(audit, makeSite());
    const gap = result.gaps.find(g => g.id === 'missing-og-image');
    expect(gap).toBeDefined();
    expect(gap?.severity).toBe('medium');
  });

  it('includes missing-json-ld gap when all pages fail JSON-LD', () => {
    const audit = makeAudit({
      metaTags: [makeMetaTagResult('/', { jsonLd: makeCheckResult('fail', 'JSON-LD') })],
    });
    const result = analyzeSiteGaps(audit, makeSite());
    const gap = result.gaps.find(g => g.id === 'missing-json-ld');
    expect(gap).toBeDefined();
    expect(gap?.category).toBe('structured-data');
  });

  it('does not include missing-json-ld when at least one page passes', () => {
    const audit = makeAudit({
      metaTags: [
        makeMetaTagResult('/'),
        makeMetaTagResult('/about', { jsonLd: makeCheckResult('fail', 'JSON-LD') }),
      ],
    });
    const result = analyzeSiteGaps(audit, makeSite());
    expect(result.gaps.find(g => g.id === 'missing-json-ld')).toBeUndefined();
  });

  it('includes missing-json-ld-fields when structured data is invalid or incomplete', () => {
    const audit = makeAudit({
      metaTags: [
        makeMetaTagResult('/', {
          jsonLd: {
            ...makeCheckResult('warn', 'JSON-LD'),
            message: 'Product missing one of "offers", "brand", or "image"',
          },
        }),
      ],
    });
    const result = analyzeSiteGaps(audit, makeSite());
    const gap = result.gaps.find((candidate) => candidate.id === 'missing-json-ld-fields');
    expect(gap).toBeDefined();
    expect(gap?.severity).toBe('medium');
    expect(gap?.affectedPages).toEqual(['/']);
    expect(gap?.evidence).toEqual(['/ · Product missing one of "offers", "brand", or "image"']);
    expect(result.gaps.find((candidate) => candidate.id === 'missing-json-ld')).toBeUndefined();
  });

  it('treats malformed JSON-LD as invalid fields work, not missing JSON-LD', () => {
    const audit = makeAudit({
      metaTags: [
        makeMetaTagResult('/', {
          jsonLd: {
            ...makeCheckResult('fail', 'JSON-LD'),
            message: 'Invalid JSON in structured data',
          },
        }),
      ],
    });
    const result = analyzeSiteGaps(audit, makeSite());
    const gap = result.gaps.find((candidate) => candidate.id === 'missing-json-ld-fields');
    expect(gap).toBeDefined();
    expect(gap?.severity).toBe('high');
    expect(result.gaps.find((candidate) => candidate.id === 'missing-json-ld')).toBeUndefined();
  });

  it('includes missing-canonical gap for pages without canonical', () => {
    const audit = makeAudit({
      metaTags: [makeMetaTagResult('/', { canonical: makeCheckResult('fail', 'canonical') })],
    });
    const result = analyzeSiteGaps(audit, makeSite());
    const gap = result.gaps.find(g => g.id === 'missing-canonical');
    expect(gap).toBeDefined();
    expect(gap?.severity).toBe('high');
  });

  it('includes broken-canonical-targets gap for pages with failing canonical targets', () => {
    const audit = makeAudit({
      metaTags: [{
        ...makeMetaTagResult('/', { canonical: makeCheckResult('fail', 'canonical') }),
        canonicalTarget: 'https://example.com/broken',
        canonicalValid: false,
        canonicalStatus: 404,
      }],
    });
    const result = analyzeSiteGaps(audit, makeSite());
    expect(result.gaps.find((gap) => gap.id === 'missing-canonical')).toBeUndefined();
    const gap = result.gaps.find((g) => g.id === 'broken-canonical-targets');
    expect(gap).toBeDefined();
    expect(gap?.severity).toBe('high');
    expect(gap?.affectedPages).toContain('/');
  });

  it('includes missing-twitter-card gap for pages without twitter:card', () => {
    const audit = makeAudit({
      metaTags: [makeMetaTagResult('/', { twitterCard: makeCheckResult('fail', 'twitter:card') })],
    });
    const result = analyzeSiteGaps(audit, makeSite());
    const gap = result.gaps.find(g => g.id === 'missing-twitter-card');
    expect(gap).toBeDefined();
    expect(gap?.severity).toBe('medium');
  });

  it('includes slow-ttfb gap when TTFB fails', () => {
    const audit = makeAudit({ ttfb: { ...makeCheckResult('fail', 'TTFB'), ms: 2500 } });
    const result = analyzeSiteGaps(audit, makeSite());
    const gap = result.gaps.find(g => g.id === 'slow-ttfb');
    expect(gap).toBeDefined();
    expect(gap?.category).toBe('performance');
  });

  it('includes no-https gap when HTTPS fails', () => {
    const audit = makeAudit({
      security: {
        https: makeCheckResult('fail', 'HTTPS'),
        hsts: makeCheckResult('pass', 'HSTS'),
        favicon: makeCheckResult('pass', 'Favicon'),
      },
    });
    const result = analyzeSiteGaps(audit, makeSite());
    const gap = result.gaps.find(g => g.id === 'no-https');
    expect(gap).toBeDefined();
    expect(gap?.severity).toBe('high');
  });

  it('includes missing-hsts gap when HSTS is not pass', () => {
    const audit = makeAudit({
      security: {
        https: makeCheckResult('pass', 'HTTPS'),
        hsts: makeCheckResult('warn', 'HSTS'),
        favicon: makeCheckResult('pass', 'Favicon'),
      },
    });
    const result = analyzeSiteGaps(audit, makeSite());
    const gap = result.gaps.find(g => g.id === 'missing-hsts');
    expect(gap).toBeDefined();
    expect(gap?.severity).toBe('medium');
  });

  it('includes missing-favicon gap when favicon is not pass', () => {
    const audit = makeAudit({
      security: {
        https: makeCheckResult('pass', 'HTTPS'),
        hsts: makeCheckResult('pass', 'HSTS'),
        favicon: makeCheckResult('warn', 'Favicon'),
      },
    });
    const result = analyzeSiteGaps(audit, makeSite());
    const gap = result.gaps.find(g => g.id === 'missing-favicon');
    expect(gap).toBeDefined();
  });

  it('always includes missing-indexnow', () => {
    const result = analyzeSiteGaps(makeAudit(), makeSite());
    const gap = result.gaps.find(g => g.id === 'missing-indexnow');
    expect(gap).toBeDefined();
    expect(gap!.severity).toBe('low');
  });

  it('counts gap severities correctly', () => {
    const audit = makeAudit({
      robotsTxt: { ...makeCheckResult('fail', 'robots.txt'), hasSitemapDirective: false }, // high
      ogImage: makeCheckResult('fail', 'OG Image'), // medium
    });
    const result = analyzeSiteGaps(audit, makeSite());
    expect(result.counts.high).toBeGreaterThanOrEqual(1);
    expect(result.counts.medium).toBeGreaterThanOrEqual(1);
  });

  it('includes stale-sitemap gap when lastmod is older than 30 days', () => {
    const staleDate = new Date();
    staleDate.setDate(staleDate.getDate() - 60);
    const audit = makeAudit({
      sitemap: {
        ...makeCheckResult('pass', 'Sitemap'),
        url: 'https://example.com/sitemap.xml',
        urlCount: 10,
        isIndex: false,
        hasLastmod: true,
        lastmodSample: staleDate.toISOString().split('T')[0],
      },
    });
    const result = analyzeSiteGaps(audit, makeSite());
    const gap = result.gaps.find(g => g.id === 'stale-sitemap');
    expect(gap).toBeDefined();
    expect(gap?.severity).toBe('medium');
  });

  it('does not include stale-sitemap gap when lastmod is recent', () => {
    const result = analyzeSiteGaps(makeAudit(), makeSite());
    expect(result.gaps.find(g => g.id === 'stale-sitemap')).toBeUndefined();
  });

  it('normalizes sitemap-coverage to the sitemap skip check', () => {
    expect(getSkipCheckId('sitemap-coverage')).toBe('sitemap');
  });
});
