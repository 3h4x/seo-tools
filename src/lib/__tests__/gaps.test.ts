import { describe, it, expect } from 'vitest';
import { analyzeSiteGaps } from '../gaps';
import type { SiteAuditResult } from '../audit';
import type { Site } from '../sites';
import { getSkipCheckId } from '../skip-checks';

function makeCheckResult(status: 'pass' | 'warn' | 'fail' | 'error', label: string = '') {
  return { status, label, message: `${status} result` };
}

function makeMetaTagResult(page: string, overrides: Record<string, ReturnType<typeof makeCheckResult>> = {}) {
  return {
    page,
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
