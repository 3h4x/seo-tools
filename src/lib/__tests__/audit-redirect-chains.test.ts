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

import { cachedAuditSite } from '../audit';
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
  opts: { status?: number; body?: string; headers?: Record<string, string> } = {},
): Response {
  const { status = 200, body = '', headers = {} } = opts;
  return new Response(body, {
    status,
    headers: { 'content-type': 'text/html', ...headers },
  });
}

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
