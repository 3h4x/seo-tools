import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockSitemapsList = vi.fn().mockResolvedValue({ data: { sitemap: [] } });
const mockSearchAnalyticsQuery = vi.fn().mockResolvedValue({ data: { rows: [] } });
const mockUrlInspectionInspect = vi.fn().mockResolvedValue({ data: { inspectionResult: { indexStatusResult: { verdict: 'PASS', coverageState: 'Submitted and indexed' } } } });

// Mock all external dependencies so audit.ts can be imported without credentials
vi.mock('../google-auth', () => ({ getAuth: () => ({}) }));
vi.mock('@googleapis/searchconsole', () => ({
  searchconsole_v1: {
    Searchconsole: class {
      sitemaps = { list: mockSitemapsList };
      searchanalytics = { query: mockSearchAnalyticsQuery };
      urlInspection = { index: { inspect: mockUrlInspectionInspect } };
    },
  },
}));
vi.mock('../db', () => ({
  withCache: vi.fn((_key: string, _id: string, fn: () => unknown) => fn()),
  CACHE_TTL_WEEK: 604800000,
}));
vi.mock('../sites', () => ({
  getManagedSites: vi.fn(),
  getSCUrl: vi.fn((site: { scUrl?: string; domain: string }) => site.scUrl ?? `sc-domain:${site.domain}`),
}));

import { cachedAuditAllSites, cachedAuditSite } from '../audit';
import { withCache } from '../db';
import { getManagedSites } from '../sites';
import type { Site } from '../sites';

function makeSite(overrides: Partial<Site> = {}): Site {
  return {
    id: 'test-site',
    name: 'Test Site',
    domain: 'example.com',
    testPages: ['/'],
    searchConsole: true,
    ...overrides,
  };
}

function makeResponse(
  opts: { status?: number; body?: string; headers?: Record<string, string>; ttfbMs?: number } = {},
): Response {
  const { status = 200, body = '', headers = {} } = opts;
  return new Response(body, {
    status,
    headers: { 'content-type': 'text/html', ...headers },
  });
}

describe('cachedAuditAllSites', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns an error audit row when one site audit rejects', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const site = makeSite({ id: 'bad-site', domain: 'bad.example.com' });
      vi.mocked(getManagedSites).mockResolvedValueOnce([site]);
      vi.mocked(withCache).mockRejectedValueOnce(new Error('audit failed'));

      const result = await cachedAuditAllSites();

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        siteId: 'bad-site',
        domain: 'bad.example.com',
        robotsTxt: { status: 'error', message: 'Audit unavailable' },
        score: { pass: 0, warn: 0, fail: 0, error: 1, total: 1 },
      });
      expect(consoleError).toHaveBeenCalledWith('[Audit] bad-site:', expect.any(Error));
    } finally {
      consoleError.mockRestore();
    }
  });
});

// ---------------------------------------------------------------------------
// robots.txt checks
// ---------------------------------------------------------------------------

describe('auditSite — robots.txt', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSitemapsList.mockResolvedValue({ data: { sitemap: [] } });
    mockSearchAnalyticsQuery.mockResolvedValue({ data: { rows: [] } });
    mockUrlInspectionInspect.mockResolvedValue({ data: { inspectionResult: { indexStatusResult: { verdict: 'PASS', coverageState: 'Submitted and indexed' } } } });
  });

  it('reports pass when robots.txt has Sitemap directive', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string) => {
        const u = String(url);
        if (u.includes('robots.txt')) {
          return makeResponse({ body: 'User-agent: *\nDisallow:\nSitemap: https://example.com/sitemap.xml\n' });
        }
        if (u.includes('sitemap')) {
          return makeResponse({ body: '<urlset><url><loc>https://example.com/</loc><lastmod>2024-12-01</lastmod></url></urlset>' });
        }
        return makeResponse({ body: '<html><title>Example</title></html>' });
      }),
    );

    const result = await cachedAuditSite(makeSite());
    expect(result.robotsTxt.status).toBe('pass');
    expect(result.robotsTxt.hasSitemapDirective).toBe(true);
    expect(result.robotsTxt.sitemapUrl).toBe('https://example.com/sitemap.xml');
  });

  it('reports warn when robots.txt exists but has no Sitemap directive', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string) => {
        const u = String(url);
        if (u.includes('robots.txt')) {
          return makeResponse({ body: 'User-agent: *\nDisallow:\n' });
        }
        if (u.includes('sitemap')) {
          return makeResponse({ body: '<urlset><url><loc>https://example.com/</loc></url></urlset>' });
        }
        return makeResponse({ body: '<html><title>Example</title></html>' });
      }),
    );

    const result = await cachedAuditSite(makeSite());
    expect(result.robotsTxt.status).toBe('warn');
    expect(result.robotsTxt.hasSitemapDirective).toBe(false);
  });

  it('reports fail when robots.txt returns 404', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string) => {
        const u = String(url);
        if (u.includes('robots.txt')) return makeResponse({ status: 404, body: 'Not Found' });
        if (u.includes('sitemap')) return makeResponse({ body: '<urlset></urlset>' });
        return makeResponse({ body: '<html><title>Test</title></html>' });
      }),
    );

    const result = await cachedAuditSite(makeSite());
    expect(result.robotsTxt.status).toBe('fail');
    expect(result.robotsTxt.hasSitemapDirective).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Sitemap checks
// ---------------------------------------------------------------------------

describe('auditSite — sitemap', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSitemapsList.mockResolvedValue({ data: { sitemap: [] } });
    mockSearchAnalyticsQuery.mockResolvedValue({ data: { rows: [] } });
    mockUrlInspectionInspect.mockResolvedValue({ data: { inspectionResult: { indexStatusResult: { verdict: 'PASS', coverageState: 'Submitted and indexed' } } } });
  });

  it('reports pass for valid sitemap with URLs and recent lastmod', async () => {
    const recentDate = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string) => {
        const u = String(url);
        if (u.includes('robots.txt')) return makeResponse({ body: `Sitemap: https://example.com/sitemap.xml\n` });
        if (u.includes('sitemap.xml')) {
          return makeResponse({
            body: `<urlset><url><loc>https://example.com/</loc><lastmod>${recentDate}</lastmod></url></urlset>`,
          });
        }
        return makeResponse({ body: '<html><title>Test</title></html>' });
      }),
    );

    const result = await cachedAuditSite(makeSite());
    expect(result.sitemap.status).toBe('pass');
    expect(result.sitemap.urlCount).toBe(1);
  });

  it('reports warn for sitemap with stale lastmod', async () => {
    const staleDate = '2020-01-01';
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string) => {
        const u = String(url);
        if (u.includes('robots.txt')) return makeResponse({ body: '' });
        if (u.includes('sitemap.xml')) {
          return makeResponse({
            body: `<urlset><url><loc>https://example.com/</loc><lastmod>${staleDate}</lastmod></url></urlset>`,
          });
        }
        return makeResponse({ body: '<html><title>Test</title></html>' });
      }),
    );

    const result = await cachedAuditSite(makeSite());
    expect(result.sitemap.status).toBe('warn');
  });

  it('reports dead sitemap URLs and crawl coverage details', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string, init?: RequestInit) => {
        const u = String(url);
        const method = init?.method ?? 'GET';
        if (u.includes('robots.txt')) return makeResponse({ body: 'Sitemap: https://example.com/sitemap.xml\n' });
        if (u.endsWith('/sitemap.xml')) {
          return makeResponse({
            body: [
              '<urlset>',
              '<url><loc>https://example.com/</loc><lastmod>2026-05-01</lastmod></url>',
              '<url><loc>https://example.com/in-sitemap</loc><lastmod>2026-05-01</lastmod></url>',
              '<url><loc>https://example.com/missing</loc><lastmod>2026-05-01</lastmod></url>',
              '</urlset>',
            ].join(''),
          });
        }
        if (u.endsWith('/missing') && method === 'HEAD') return makeResponse({ status: 404 });
        if (u.endsWith('/missing')) return makeResponse({ status: 404 });
        if (u.endsWith('/start')) {
          return makeResponse({
            body: '<html><head><title>Start</title></head><body><a href="/in-sitemap">In sitemap</a><a href="/not-in-sitemap">Missing</a></body></html>',
          });
        }
        return makeResponse({ body: '<html><head><title>Page</title></head></html>' });
      }),
    );

    const result = await cachedAuditSite(makeSite({ testPages: ['/start'] }));
    expect(result.sitemap.status).toBe('fail');
    expect(result.sitemap.checkedUrlCount).toBe(3);
    expect(result.sitemap.deadUrlCount).toBe(1);
    expect(result.sitemap.deadUrls).toContain('https://example.com/missing (404)');
    expect(result.sitemap.crawledPagesInSitemap).toBe(2);
    expect(result.sitemap.crawledPagesChecked).toBe(3);
    expect(result.sitemap.crawlCoveragePct).toBe(67);
    expect(result.sitemap.message).toContain('Coverage 2/3 sampled sitemap URLs reachable');
  });

  it('warns when all sampled sitemap lastmod dates are older than 90 days', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string) => {
        const u = String(url);
        if (u.includes('robots.txt')) return makeResponse({ body: 'Sitemap: https://example.com/sitemap.xml\n' });
        if (u.endsWith('/sitemap.xml')) {
          return makeResponse({
            body: [
              '<urlset>',
              '<url><loc>https://example.com/</loc><lastmod>2020-01-01</lastmod></url>',
              '<url><loc>https://example.com/about</loc><lastmod>2020-02-01</lastmod></url>',
              '</urlset>',
            ].join(''),
          });
        }
        return makeResponse({ body: '<html><head><title>Page</title></head></html>' });
      }),
    );

    const result = await cachedAuditSite(makeSite({ testPages: [] }));
    expect(result.sitemap.status).toBe('warn');
    expect(result.sitemap.staleLastmodCount).toBe(2);
    expect(result.sitemap.checkedLastmodCount).toBe(2);
    expect(result.sitemap.message).toContain('older than 90 days');
  });

  it('limits stale lastmod checks to the sampled sitemap URLs', async () => {
    const urlRows = Array.from({ length: 55 }, (_, index) => {
      const path = `/page-${index + 1}`;
      const lastmod = index < 50 ? '2026-05-01' : '2020-01-01';
      return `<url><loc>https://example.com${path}</loc><lastmod>${lastmod}</lastmod></url>`;
    }).join('');

    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string) => {
        const u = String(url);
        if (u.includes('robots.txt')) return makeResponse({ body: 'Sitemap: https://example.com/sitemap.xml\n' });
        if (u.endsWith('/sitemap.xml')) {
          return makeResponse({ body: `<urlset>${urlRows}</urlset>` });
        }
        return makeResponse({ body: '<html><head><title>Page</title></head></html>' });
      }),
    );

    const result = await cachedAuditSite(makeSite({ testPages: [] }));
    expect(result.sitemap.status).toBe('pass');
    expect(result.sitemap.checkedUrlCount).toBe(50);
    expect(result.sitemap.checkedLastmodCount).toBe(50);
    expect(result.sitemap.staleLastmodCount).toBe(0);
    expect(result.sitemap.message).toContain('Checked 50 sitemap URLs');
  });

  it('excludes sitemap index lastmod values from sampled page freshness', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string) => {
        const u = String(url);
        if (u.includes('robots.txt')) return makeResponse({ body: 'Sitemap: https://example.com/sitemap-index.xml\n' });
        if (u.endsWith('/sitemap-index.xml')) {
          return makeResponse({
            body: [
              '<sitemapindex>',
              '<sitemap><loc>https://example.com/posts.xml</loc><lastmod>2020-01-01</lastmod></sitemap>',
              '</sitemapindex>',
            ].join(''),
          });
        }
        if (u.endsWith('/posts.xml')) {
          return makeResponse({
            body: [
              '<urlset>',
              '<url><loc>https://example.com/</loc><lastmod>2026-05-01</lastmod></url>',
              '<url><loc>https://example.com/about</loc><lastmod>2026-05-02</lastmod></url>',
              '</urlset>',
            ].join(''),
          });
        }
        return makeResponse({ body: '<html><head><title>Page</title></head></html>' });
      }),
    );

    const result = await cachedAuditSite(makeSite({ testPages: [] }));
    expect(result.sitemap.status).toBe('warn');
    expect(result.sitemap.checkedUrlCount).toBe(2);
    expect(result.sitemap.checkedLastmodCount).toBe(2);
    expect(result.sitemap.staleLastmodCount).toBe(0);
    expect(result.sitemap.message).toContain('stale lastmod: 2020-01-01');
    expect(result.sitemap.message).toContain('0/2 sampled lastmod dates are older than 90 days');
  });

  it('reports fail when no sitemap is found', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string) => {
        const u = String(url);
        if (u.includes('robots.txt')) return makeResponse({ body: '' });
        return makeResponse({ status: 404, body: '' });
      }),
    );

    const result = await cachedAuditSite(makeSite({ testPages: [] }));
    expect(result.sitemap.status).toBe('fail');
    expect(result.sitemap.message).toContain('No sitemap found');
  });

  it('recognizes sitemap index format', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string) => {
        const u = String(url);
        if (u.includes('robots.txt')) return makeResponse({ body: `Sitemap: https://example.com/sitemap-index.xml\n` });
        if (u.includes('sitemap-index.xml')) {
          return makeResponse({
            body: `<sitemapindex><sitemap><loc>https://example.com/sitemap1.xml</loc></sitemap><sitemap><loc>https://example.com/sitemap2.xml</loc></sitemap></sitemapindex>`,
          });
        }
        return makeResponse({ body: '<html><title>Test</title></html>' });
      }),
    );

    const result = await cachedAuditSite(makeSite({ testPages: [] }));
    expect(result.sitemap.isIndex).toBe(true);
    expect(result.sitemap.urlCount).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// TTFB checks
// ---------------------------------------------------------------------------

describe('auditSite — TTFB', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSitemapsList.mockResolvedValue({ data: { sitemap: [] } });
    mockSearchAnalyticsQuery.mockResolvedValue({ data: { rows: [] } });
  });

  it('reports pass for fast responses (<800ms)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(() => makeResponse({ body: '<html><title>Fast</title></html>' })),
    );

    const result = await cachedAuditSite(makeSite({ testPages: [] }));
    // TTFB measured from real timing — mocked fetch returns instantly so should be < 800ms
    expect(['pass', 'warn']).toContain(result.ttfb.status);
    expect(result.ttfb.ms).toBeDefined();
  });

  it('reports error when fetch throws', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new Error('ECONNREFUSED')),
    );

    const result = await cachedAuditSite(makeSite({ testPages: [] }));
    expect(result.ttfb.status).toBe('error');
  });
});

// ---------------------------------------------------------------------------
// Security checks
// ---------------------------------------------------------------------------

describe('auditSite — security', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSitemapsList.mockResolvedValue({ data: { sitemap: [] } });
    mockSearchAnalyticsQuery.mockResolvedValue({ data: { rows: [] } });
  });

  it('reports HTTPS pass when HTTP redirects to HTTPS', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string, opts?: { redirect?: string }) => {
        const u = String(url);
        if (u.startsWith('http://') && opts?.redirect === 'manual') {
          return Promise.resolve(new Response('', { status: 301, headers: { location: 'https://example.com/' } }));
        }
        return makeResponse({ body: '<html><title>Test</title></html>', headers: { 'strict-transport-security': 'max-age=31536000' } });
      }),
    );

    const result = await cachedAuditSite(makeSite({ testPages: [] }));
    expect(result.security.https.status).toBe('pass');
    expect(result.security.hsts.status).toBe('pass');
  });

  it('reports HSTS warn when header is missing', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string, opts?: { redirect?: string }) => {
        const u = String(url);
        if (u.startsWith('http://') && opts?.redirect === 'manual') {
          return Promise.resolve(new Response('', { status: 301, headers: { location: 'https://example.com/' } }));
        }
        return makeResponse({ body: '<html><title>Test</title></html>' });
      }),
    );

    const result = await cachedAuditSite(makeSite({ testPages: [] }));
    expect(result.security.hsts.status).toBe('warn');
  });

  it('reports HTTPS pass when HTTP is not available (HTTPS only)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string, opts?: { redirect?: string }) => {
        const u = String(url);
        if (u.startsWith('http://') && opts?.redirect === 'manual') {
          return Promise.reject(new Error('ECONNREFUSED'));
        }
        return makeResponse({ body: '<html><title>Test</title></html>' });
      }),
    );

    const result = await cachedAuditSite(makeSite({ testPages: [] }));
    expect(result.security.https.status).toBe('pass');
    expect(result.security.https.message).toContain('HTTPS only');
  });
});

describe('auditSite — redirect chains', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSitemapsList.mockResolvedValue({ data: { sitemap: [] } });
    mockSearchAnalyticsQuery.mockResolvedValue({ data: { rows: [] } });
  });

  it('fails a single-hop 303 redirect as non-permanent', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string, opts?: { redirect?: string }) => {
        const u = String(url);
        if (u.endsWith('/robots.txt')) {
          return makeResponse({ body: 'Sitemap: https://example.com/sitemap.xml\n' });
        }
        if (u.endsWith('/sitemap.xml')) {
          return makeResponse({ body: '<urlset><url><loc>https://example.com/source</loc></url></urlset>' });
        }
        if (u === 'http://example.com/' && opts?.redirect === 'manual') {
          return Promise.resolve(new Response('', { status: 301, headers: { location: 'https://example.com/' } }));
        }
        if (u === 'https://example.com/source' && opts?.redirect === 'manual') {
          return Promise.resolve(new Response('', { status: 303, headers: { location: 'https://example.com/target' } }));
        }
        if (u === 'https://example.com/target' && opts?.redirect === 'manual') {
          return makeResponse({ body: '<html><title>Target</title></html>' });
        }
        return makeResponse({ body: '<html><title>Source</title></html>' });
      }),
    );

    const result = await cachedAuditSite(makeSite({ testPages: ['/source'] }));
    const chain = result.redirectChains.find(c => c.page === '/source');
    expect(chain?.status).toBe('fail');
    expect(chain?.hasTemporaryRedirect).toBe(true);
    expect(chain?.message).toContain('temporary redirect');
    expect(result.score.fail).toBeGreaterThan(0);
  });

  it('passes single-hop 301 and 308 redirects as permanent', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string, opts?: { redirect?: string }) => {
        const u = String(url);
        if (u.endsWith('/robots.txt')) {
          return makeResponse({ body: 'Sitemap: https://example.com/sitemap.xml\n' });
        }
        if (u.endsWith('/sitemap.xml')) {
          return makeResponse({
            body: '<urlset><url><loc>https://example.com/permanent-301</loc></url><url><loc>https://example.com/permanent-308</loc></url></urlset>',
          });
        }
        if (u === 'http://example.com/' && opts?.redirect === 'manual') {
          return Promise.resolve(new Response('', { status: 301, headers: { location: 'https://example.com/' } }));
        }
        if (u === 'https://example.com/permanent-301' && opts?.redirect === 'manual') {
          return Promise.resolve(new Response('', { status: 301, headers: { location: 'https://example.com/target-301' } }));
        }
        if (u === 'https://example.com/permanent-308' && opts?.redirect === 'manual') {
          return Promise.resolve(new Response('', { status: 308, headers: { location: 'https://example.com/target-308' } }));
        }
        return makeResponse({ body: '<html><title>Permanent</title></html>' });
      }),
    );

    const result = await cachedAuditSite(makeSite({ testPages: ['/permanent-301', '/permanent-308'] }));
    expect(result.redirectChains.find(c => c.page === '/permanent-301')?.status).toBe('pass');
    expect(result.redirectChains.find(c => c.page === '/permanent-308')?.status).toBe('pass');
  });
});

// ---------------------------------------------------------------------------
// skipChecks
// ---------------------------------------------------------------------------

describe('auditSite — skipChecks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSitemapsList.mockResolvedValue({ data: { sitemap: [] } });
    mockSearchAnalyticsQuery.mockResolvedValue({ data: { rows: [] } });
  });

  it('marks skipped checks as pass with N/A prefix', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(() => makeResponse({ body: '<html><title>Test</title></html>' })),
    );

    const result = await cachedAuditSite(makeSite({ testPages: [], skipChecks: ['hsts', 'favicon'] }));
    expect(result.security.hsts.status).toBe('pass');
    expect(result.security.hsts.message).toContain('N/A');
    expect(result.security.favicon.status).toBe('pass');
    expect(result.security.favicon.message).toContain('N/A');
  });

  it('marks skipped canonical checks as pass with N/A prefix', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string, opts?: { method?: string }) => {
        const u = String(url);
        if (opts?.method === 'HEAD' && u === 'https://example.com/') {
          return Promise.resolve(new Response('', { status: 404 }));
        }
        return makeResponse({ body: '<html><head><title>Test</title><link rel="canonical" href="https://example.com/"></head></html>' });
      }),
    );

    const result = await cachedAuditSite(makeSite({ skipChecks: ['canonical'] }));
    expect(result.metaTags[0].canonical.status).toBe('pass');
    expect(result.metaTags[0].canonical.message).toContain('N/A');
  });

  it('matches identifier-style skip keys for OG image and internal links', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
        const u = String(url);
        if (u.endsWith('/favicon.ico')) {
          return makeResponse({ status: 404, body: 'missing' });
        }
        if (u.endsWith('/robots.txt')) {
          return makeResponse({ body: 'Sitemap: https://example.com/sitemap.xml\n' });
        }
        if (u.endsWith('/sitemap.xml')) {
          return makeResponse({ body: '<urlset><url><loc>https://example.com/</loc></url></urlset>' });
        }
        return makeResponse({
          body: '<html><head><title>Test</title></head><body><img src="/hero.jpg"><a href="/about">About</a></body></html>',
        });
      });
    vi.stubGlobal('fetch', fetchMock);

    const result = await cachedAuditSite(makeSite({ skipChecks: ['ogImage', 'internalLinks'] }));
    expect(result.ogImage.status).toBe('pass');
    expect(result.ogImage.message).toContain('N/A');
    expect(result.internalLinks[0].status).toBe('pass');
    expect(result.internalLinks[0].message).toContain('N/A');
    expect(result.internalLinks[0].brokenLinks).toEqual([]);
    expect(result.internalLinks[0].brokenLinksMessage).toContain('N/A');
    expect(
      fetchMock.mock.calls.some(([url, init]) => String(url).endsWith('/about') && (init as RequestInit | undefined)?.method === 'HEAD'),
    ).toBe(false);
  });

  it('supports the broken-links skip alias without skipping internal link counts', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
        const u = String(url);
        const method = init?.method ?? 'GET';
        if (u.endsWith('/robots.txt')) {
          return makeResponse({ body: 'Sitemap: https://example.com/sitemap.xml\n' });
        }
        if (u.endsWith('/sitemap.xml')) {
          return makeResponse({ body: '<urlset><url><loc>https://example.com/</loc></url></urlset>' });
        }
        if (u.endsWith('/missing') && method === 'HEAD') {
          return makeResponse({ status: 404 });
        }
        return makeResponse({
          body: '<html><head><title>Test</title></head><body><a href="/about">About</a><a href="/missing">Missing</a><a href="/contact">Contact</a></body></html>',
        });
      });
    vi.stubGlobal('fetch', fetchMock);

    const result = await cachedAuditSite(makeSite({ skipChecks: ['broken-links'] }));
    expect(result.internalLinks[0].internalLinks).toBe(3);
    expect(result.internalLinks[0].status).toBe('pass');
    expect(result.internalLinks[0].checkedInternalLinks).toBe(0);
    expect(result.internalLinks[0].brokenLinks).toEqual([]);
    expect(result.internalLinks[0].brokenLinksMessage).toContain('N/A');
    expect(
      fetchMock.mock.calls.some(([url, init]) => {
        const target = String(url);
        const method = (init as RequestInit | undefined)?.method ?? 'GET';
        return (target.endsWith('/about') || target.endsWith('/missing') || target.endsWith('/contact')) &&
          (method === 'HEAD' || method === 'GET');
      }),
    ).toBe(false);
  });

  it('removes broken-link penalties when internal links are skipped', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      const u = String(url);
      const method = init?.method ?? 'GET';
      if (u.endsWith('/robots.txt')) {
        return makeResponse({ body: 'Sitemap: https://example.com/sitemap.xml\n' });
      }
      if (u.endsWith('/sitemap.xml')) {
        return makeResponse({ body: '<urlset><url><loc>https://example.com/</loc></url></urlset>' });
      }
      if (u.endsWith('/missing') && method === 'HEAD') {
        return makeResponse({ status: 404 });
      }
      return makeResponse({
        body: '<html><head><title>Test</title></head><body><a href="/about">About</a><a href="/missing">Missing</a><a href="/contact">Contact</a></body></html>',
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const baseline = await cachedAuditSite(makeSite());
    const skipped = await cachedAuditSite(makeSite({ skipChecks: ['internalLinks'] }));

    expect(baseline.internalLinks[0].brokenLinks).toEqual([{ url: 'https://example.com/missing', status: 404 }]);
    expect(skipped.internalLinks[0].status).toBe('pass');
    expect(skipped.internalLinks[0].brokenLinks).toEqual([]);
    expect(skipped.internalLinks[0].brokenLinksMessage).toContain('N/A');
    expect(skipped.score.fail).toBe(baseline.score.fail - 1);
    expect(
      fetchMock.mock.calls.some(([url, init]) => String(url).endsWith('/missing') && (init as RequestInit | undefined)?.method === 'HEAD'),
    ).toBe(true);
  });

  it('keeps og:image meta skips separate from the OG Image asset check', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string) => {
        const u = String(url);
        if (u.endsWith('/robots.txt')) {
          return makeResponse({ body: 'Sitemap: https://example.com/sitemap.xml\n' });
        }
        if (u.endsWith('/sitemap.xml')) {
          return makeResponse({ body: '<urlset><url><loc>https://example.com/</loc></url></urlset>' });
        }
        return makeResponse({
          body: '<html><head><title>Test</title><meta property="og:image" content="https://example.com/og.png"></head><body></body></html>',
        });
      }),
    );

    const result = await cachedAuditSite(makeSite({ skipChecks: ['ogImage'] }));
    expect(result.ogImage.status).toBe('pass');
    expect(result.ogImage.message).toContain('N/A');
    expect(result.metaTags[0].ogImage.status).toBe('pass');
    expect(result.metaTags[0].ogImage.message).not.toContain('N/A');
  });
});

describe('auditSite — canonical', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSitemapsList.mockResolvedValue({ data: { sitemap: [] } });
    mockSearchAnalyticsQuery.mockResolvedValue({ data: { rows: [] } });
  });

  it('skips the HEAD validation when canonical is missing', async () => {
    const fetchMock = vi.fn().mockImplementation(() => makeResponse({ body: '<html><head><title>Test</title></head></html>' }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await cachedAuditSite(makeSite());
    expect(result.metaTags[0].canonical.status).toBe('fail');
    expect(result.metaTags[0].canonicalStatus).toBeNull();
    expect(fetchMock).not.toHaveBeenCalledWith('https://example.com/', expect.objectContaining({ method: 'HEAD' }));
  });

  it('passes when canonical is self-referential and returns 200', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string, opts?: { method?: string }) => {
        if (opts?.method === 'HEAD') {
          return Promise.resolve(new Response('', { status: 200 }));
        }
        return makeResponse({ body: '<html><head><title>Test</title><link rel="canonical" href="https://example.com/"></head></html>' });
      }),
    );

    const result = await cachedAuditSite(makeSite());
    expect(result.metaTags[0].canonical.status).toBe('pass');
    expect(result.metaTags[0].canonicalValid).toBe(true);
    expect(result.metaTags[0].canonicalStatus).toBe(200);
    expect(result.metaTags[0].canonicalTarget).toBe('https://example.com/');
  });

  it('warns when canonical returns a redirect', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string, opts?: { method?: string }) => {
        if (opts?.method === 'HEAD') {
          return Promise.resolve(new Response('', { status: 301, headers: { location: 'https://example.com/final' } }));
        }
        return makeResponse({ body: '<html><head><title>Test</title><link rel="canonical" href="https://example.com/"></head></html>' });
      }),
    );

    const result = await cachedAuditSite(makeSite());
    expect(result.metaTags[0].canonical.status).toBe('warn');
    expect(result.metaTags[0].canonicalStatus).toBe(301);
    expect(result.metaTags[0].canonical.message).toContain('redirects');
  });

  it('fails when canonical returns 404', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string, opts?: { method?: string }) => {
        if (opts?.method === 'HEAD') {
          return Promise.resolve(new Response('', { status: 404 }));
        }
        return makeResponse({ body: '<html><head><title>Test</title><link rel="canonical" href="https://example.com/"></head></html>' });
      }),
    );

    const result = await cachedAuditSite(makeSite());
    expect(result.metaTags[0].canonical.status).toBe('fail');
    expect(result.metaTags[0].canonicalValid).toBe(false);
    expect(result.metaTags[0].canonicalStatus).toBe(404);
  });

  it('warns when canonical points to a different page', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string, opts?: { method?: string }) => {
        if (opts?.method === 'HEAD') {
          return Promise.resolve(new Response('', { status: 200 }));
        }
        return makeResponse({ body: '<html><head><title>Test</title><link rel="canonical" href="https://example.com/other"></head></html>' });
      }),
    );

    const result = await cachedAuditSite(makeSite());
    expect(result.metaTags[0].canonical.status).toBe('warn');
    expect(result.metaTags[0].canonicalValid).toBe(false);
    expect(result.metaTags[0].canonicalTarget).toBe('https://example.com/other');
    expect(result.metaTags[0].canonical.message).toContain('different URL');
  });

  it('falls back to GET when HEAD is not supported', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string, opts?: { method?: string }) => {
      if (opts?.method === 'HEAD') {
        return Promise.resolve(new Response('', { status: 405 }));
      }
      if (opts?.method === 'GET') {
        return Promise.resolve(new Response('<html></html>', { status: 200 }));
      }
      return makeResponse({ body: '<html><head><title>Test</title><link rel="canonical" href="https://example.com/"></head></html>' });
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await cachedAuditSite(makeSite());
    expect(result.metaTags[0].canonical.status).toBe('pass');
    expect(result.metaTags[0].canonicalStatus).toBe(200);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://example.com/',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('fails when HEAD is unsupported and GET also fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string, opts?: { method?: string }) => {
        if (opts?.method === 'HEAD') {
          return Promise.resolve(new Response('', { status: 501 }));
        }
        if (opts?.method === 'GET') {
          return Promise.resolve(new Response('missing', { status: 404 }));
        }
        return makeResponse({ body: '<html><head><title>Test</title><link rel="canonical" href="https://example.com/"></head></html>' });
      }),
    );

    const result = await cachedAuditSite(makeSite());
    expect(result.metaTags[0].canonical.status).toBe('fail');
    expect(result.metaTags[0].canonicalStatus).toBe(404);
    expect(result.metaTags[0].canonical.message).toContain('HTTP 404');
  });
});

describe('auditSite — broken internal links', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSitemapsList.mockResolvedValue({ data: { sitemap: [] } });
    mockSearchAnalyticsQuery.mockResolvedValue({ data: { rows: [] } });
  });

  it('checks up to 20 unique internal links and records broken targets', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string, init?: RequestInit) => {
        const u = String(url);
        const method = init?.method ?? 'GET';
        if (u.endsWith('/robots.txt')) {
          return makeResponse({ body: 'Sitemap: https://example.com/sitemap.xml\n' });
        }
        if (u.endsWith('/sitemap.xml')) {
          return makeResponse({ body: '<urlset><url><loc>https://example.com/</loc></url></urlset>' });
        }
        if (method === 'HEAD' && u.endsWith('/missing-a')) {
          return makeResponse({ status: 404 });
        }
        if (method === 'HEAD' && u.endsWith('/missing-b')) {
          return makeResponse({ status: 500 });
        }
        if (method === 'HEAD' && u.startsWith('https://example.com/page-')) {
          return makeResponse({ status: 200 });
        }

        return makeResponse({
          body: [
            '<html><head><title>Test</title></head><body>',
            '<a href="/page-1">One</a>',
            '<a href="/page-2">Two</a>',
            '<a href="/page-3">Three</a>',
            '<a href="/page-4">Four</a>',
            '<a href="/page-5">Five</a>',
            '<a href="/page-6">Six</a>',
            '<a href="/page-7">Seven</a>',
            '<a href="/page-8">Eight</a>',
            '<a href="/page-9">Nine</a>',
            '<a href="/page-10">Ten</a>',
            '<a href="/page-11">Eleven</a>',
            '<a href="/page-12">Twelve</a>',
            '<a href="/page-13">Thirteen</a>',
            '<a href="/page-14">Fourteen</a>',
            '<a href="/page-15">Fifteen</a>',
            '<a href="/page-16">Sixteen</a>',
            '<a href="/page-17">Seventeen</a>',
            '<a href="/page-18">Eighteen</a>',
            '<a href="/missing-a">Missing A</a>',
            '<a href="/missing-b">Missing B</a>',
            '<a href="/page-19">Nineteen</a>',
            '<a href="/page-20">Twenty</a>',
            '<a href="/page-21">Twenty One</a>',
            '</body></html>',
          ].join(''),
        });
      }),
    );

    const result = await cachedAuditSite(makeSite());
    expect(result.internalLinks[0].checkedInternalLinks).toBe(20);
    expect(result.internalLinks[0].brokenLinks).toEqual([
      { url: 'https://example.com/missing-a', status: 404 },
      { url: 'https://example.com/missing-b', status: 500 },
    ]);
    expect(result.internalLinks[0].brokenLinksMessage).toContain('2 broken');
    expect(result.score.fail).toBeGreaterThanOrEqual(2);
  });

  it('verifies internal links with bounded concurrency instead of one-by-one', async () => {
    let inFlight = 0;
    let maxInFlight = 0;

    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string, init?: RequestInit) => {
        const u = String(url);
        const method = init?.method ?? 'GET';
        if (u.endsWith('/robots.txt')) {
          return makeResponse({ body: 'Sitemap: https://example.com/sitemap.xml\n' });
        }
        if (u.endsWith('/sitemap.xml')) {
          return makeResponse({ body: '<urlset><url><loc>https://example.com/</loc></url></urlset>' });
        }
        if (method === 'HEAD' && u.startsWith('https://example.com/page-')) {
          inFlight++;
          maxInFlight = Math.max(maxInFlight, inFlight);
          return new Promise((resolve) => {
            setTimeout(() => {
              inFlight--;
              resolve(makeResponse({ status: 200 }));
            }, 20);
          });
        }

        return makeResponse({
          body: [
            '<html><head><title>Test</title></head><body>',
            '<a href="/page-1">One</a>',
            '<a href="/page-2">Two</a>',
            '<a href="/page-3">Three</a>',
            '<a href="/page-4">Four</a>',
            '<a href="/page-5">Five</a>',
            '<a href="/page-6">Six</a>',
            '</body></html>',
          ].join(''),
        });
      }),
    );

    const result = await cachedAuditSite(makeSite());
    expect(result.internalLinks[0].checkedInternalLinks).toBe(6);
    expect(maxInFlight).toBeGreaterThan(1);
  });
});

// ---------------------------------------------------------------------------
// Score calculation
// ---------------------------------------------------------------------------

describe('auditSite — score', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSitemapsList.mockResolvedValue({ data: { sitemap: [] } });
    mockSearchAnalyticsQuery.mockResolvedValue({ data: { rows: [] } });
  });

  it('score total equals sum of pass + warn + fail + error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(() => makeResponse({ body: '<html><title>Test Site</title></html>' })),
    );

    const result = await cachedAuditSite(makeSite({ testPages: ['/'] }));
    const { pass, warn, fail, error, total } = result.score;
    expect(pass + warn + fail + error).toBe(total);
    expect(total).toBeGreaterThan(0);
  });
});

describe('auditSite — indexing coverage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSitemapsList.mockResolvedValue({ data: { sitemap: [] } });
    mockSearchAnalyticsQuery.mockResolvedValue({ data: { rows: [{}, {}, {}] } });
  });

  it('caps coverage at 100% when indexed pages exceed sitemap URLs', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string, opts?: { redirect?: string }) => {
        const u = String(url);
        if (u.includes('robots.txt')) {
          return makeResponse({ body: 'Sitemap: https://example.com/sitemap.xml\n' });
        }
        if (u.includes('sitemap.xml')) {
          return makeResponse({
            body: '<urlset><url><loc>https://example.com/1</loc></url><url><loc>https://example.com/2</loc></url></urlset>',
          });
        }
        if (u.startsWith('http://') && opts?.redirect === 'manual') {
          return Promise.resolve(new Response('', { status: 301, headers: { location: 'https://example.com/' } }));
        }
        return makeResponse({ body: '<html><title>Test</title></html>' });
      }),
    );

    const result = await cachedAuditSite(makeSite({ testPages: [] }));
    expect(result.indexingCoverage.coveragePct).toBe(100);
    expect(result.indexingCoverage.indexedPages).toBe(3);
    expect(result.indexingCoverage.message).toContain('2/2 sitemap URLs indexed (100%)');
  });
});
