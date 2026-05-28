import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getCrossLinkMatrix } from '../cross-links';
import type { Site } from '../sites';

const {
  mockCachedGetSearchConsolePages,
  mockWithCache,
} = vi.hoisted(() => ({
  mockCachedGetSearchConsolePages: vi.fn(),
  mockWithCache: vi.fn(async (
    _key: string,
    _id: string,
    fetcher: () => Promise<unknown>,
    _ttlMs?: number,
  ) => fetcher()),
}));

vi.mock('../search-console', () => ({
  cachedGetSearchConsolePages: mockCachedGetSearchConsolePages,
}));

vi.mock('../db', () => ({
  withCache: mockWithCache,
}));

const sites: Site[] = [
  { id: 'alpha', name: 'Alpha', domain: 'alpha.test', testPages: ['/'] },
  { id: 'beta', name: 'Beta', domain: 'beta.test', testPages: ['/'] },
  { id: 'gamma', name: 'Gamma', domain: 'gamma.test', testPages: ['/'] },
];

const overlappingSites: Site[] = [
  { id: 'apex', name: 'Apex', domain: 'example.com', testPages: ['/'] },
  { id: 'blog', name: 'Blog', domain: 'blog.example.com', testPages: ['/'] },
  { id: 'partner', name: 'Partner', domain: 'partner.test', testPages: ['/'] },
];

describe('getCrossLinkMatrix', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL) => {
      const url = String(input);
      if (url === 'https://alpha.test/post-a') {
        return new Response('<a href="https://beta.test/docs">Beta</a><a href="/self">Self</a>');
      }
      if (url === 'https://alpha.test/post-b') {
        return new Response('<a href="https://news.gamma.test/story">Gamma</a>');
      }
      if (url === 'https://beta.test/home') {
        return new Response('<a href="https://alpha.test/start">Alpha</a>');
      }
      if (url === 'https://gamma.test/about') {
        return new Response('<a href="mailto:test@gamma.test">Mail</a>');
      }
      return new Response('', { status: 404 });
    }) as typeof fetch);

    mockCachedGetSearchConsolePages.mockImplementation((siteUrl: string) => {
      if (siteUrl === 'sc-domain:alpha.test') {
        return [{ page: '/post-a' }, { page: 'https://alpha.test/post-b' }];
      }
      if (siteUrl === 'sc-domain:beta.test') {
        return [{ page: '/home' }];
      }
      if (siteUrl === 'sc-domain:gamma.test') {
        return [{ page: '/about' }];
      }
      return [];
    });
  });

  it('builds per-site outbound counts to other managed domains and caches each source row', async () => {
    const matrix = await getCrossLinkMatrix(sites);

    expect(mockWithCache).toHaveBeenCalledTimes(3);
    for (const call of mockWithCache.mock.calls) {
      expect(call[0]).toBe('cross-links-matrix');
      expect(call[3]).toBe(24 * 60 * 60 * 1000);
    }

    expect(matrix).toEqual([
      {
        sourceSiteId: 'alpha',
        sourceSiteName: 'Alpha',
        sourceDomain: 'alpha.test',
        status: 'ok',
        attemptedPages: 2,
        crawledPages: 2,
        failedPages: 0,
        targets: [
          {
            targetSiteId: 'beta',
            targetSiteName: 'Beta',
            targetDomain: 'beta.test',
            linkedPages: 1,
            missingPages: 1,
            linkedExamples: ['https://alpha.test/post-a'],
          },
          {
            targetSiteId: 'gamma',
            targetSiteName: 'Gamma',
            targetDomain: 'gamma.test',
            linkedPages: 1,
            missingPages: 1,
            linkedExamples: ['https://alpha.test/post-b'],
          },
        ],
      },
      {
        sourceSiteId: 'beta',
        sourceSiteName: 'Beta',
        sourceDomain: 'beta.test',
        status: 'ok',
        attemptedPages: 1,
        crawledPages: 1,
        failedPages: 0,
        targets: [
          {
            targetSiteId: 'alpha',
            targetSiteName: 'Alpha',
            targetDomain: 'alpha.test',
            linkedPages: 1,
            missingPages: 0,
            linkedExamples: ['https://beta.test/home'],
          },
          {
            targetSiteId: 'gamma',
            targetSiteName: 'Gamma',
            targetDomain: 'gamma.test',
            linkedPages: 0,
            missingPages: 1,
            linkedExamples: [],
          },
        ],
      },
      {
        sourceSiteId: 'gamma',
        sourceSiteName: 'Gamma',
        sourceDomain: 'gamma.test',
        status: 'ok',
        attemptedPages: 1,
        crawledPages: 1,
        failedPages: 0,
        targets: [
          {
            targetSiteId: 'alpha',
            targetSiteName: 'Alpha',
            targetDomain: 'alpha.test',
            linkedPages: 0,
            missingPages: 1,
            linkedExamples: [],
          },
          {
            targetSiteId: 'beta',
            targetSiteName: 'Beta',
            targetDomain: 'beta.test',
            linkedPages: 0,
            missingPages: 1,
            linkedExamples: [],
          },
        ],
      },
    ]);
  });

  it('marks disabled and Search Console-unavailable sources as not evaluated', async () => {
    const mixedSites: Site[] = [
      { id: 'alpha', name: 'Alpha', domain: 'alpha.test', testPages: ['/'], searchConsole: false },
      { id: 'beta', name: 'Beta', domain: 'beta.test', testPages: ['/'] },
    ];

    mockCachedGetSearchConsolePages.mockImplementation((siteUrl: string) => {
      if (siteUrl === 'sc-domain:beta.test') {
        return null;
      }
      return [];
    });

    const matrix = await getCrossLinkMatrix(mixedSites);

    expect(matrix).toEqual([
      {
        sourceSiteId: 'alpha',
        sourceSiteName: 'Alpha',
        sourceDomain: 'alpha.test',
        status: 'disabled',
        attemptedPages: 0,
        crawledPages: 0,
        failedPages: 0,
        targets: [
          {
            targetSiteId: 'beta',
            targetSiteName: 'Beta',
            targetDomain: 'beta.test',
            linkedPages: null,
            missingPages: null,
            linkedExamples: [],
          },
        ],
      },
      {
        sourceSiteId: 'beta',
        sourceSiteName: 'Beta',
        sourceDomain: 'beta.test',
        status: 'search-console-unavailable',
        attemptedPages: 0,
        crawledPages: 0,
        failedPages: 0,
        targets: [
          {
            targetSiteId: 'alpha',
            targetSiteName: 'Alpha',
            targetDomain: 'alpha.test',
            linkedPages: null,
            missingPages: null,
            linkedExamples: [],
          },
        ],
      },
    ]);
  });

  it('keeps other source rows when one source-level provider call rejects', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mockCachedGetSearchConsolePages.mockImplementation((siteUrl: string) => {
      if (siteUrl === 'sc-domain:alpha.test') {
        throw new Error('Search Console failed');
      }
      if (siteUrl === 'sc-domain:beta.test') {
        return [{ page: '/home' }];
      }
      if (siteUrl === 'sc-domain:gamma.test') {
        return [];
      }
      return [];
    });

    const matrix = await getCrossLinkMatrix(sites);

    expect(matrix).toEqual([
      {
        sourceSiteId: 'alpha',
        sourceSiteName: 'Alpha',
        sourceDomain: 'alpha.test',
        status: 'search-console-unavailable',
        attemptedPages: 0,
        crawledPages: 0,
        failedPages: 0,
        targets: [
          {
            targetSiteId: 'beta',
            targetSiteName: 'Beta',
            targetDomain: 'beta.test',
            linkedPages: null,
            missingPages: null,
            linkedExamples: [],
          },
          {
            targetSiteId: 'gamma',
            targetSiteName: 'Gamma',
            targetDomain: 'gamma.test',
            linkedPages: null,
            missingPages: null,
            linkedExamples: [],
          },
        ],
      },
      {
        sourceSiteId: 'beta',
        sourceSiteName: 'Beta',
        sourceDomain: 'beta.test',
        status: 'ok',
        attemptedPages: 1,
        crawledPages: 1,
        failedPages: 0,
        targets: [
          {
            targetSiteId: 'alpha',
            targetSiteName: 'Alpha',
            targetDomain: 'alpha.test',
            linkedPages: 1,
            missingPages: 0,
            linkedExamples: ['https://beta.test/home'],
          },
          {
            targetSiteId: 'gamma',
            targetSiteName: 'Gamma',
            targetDomain: 'gamma.test',
            linkedPages: 0,
            missingPages: 1,
            linkedExamples: [],
          },
        ],
      },
      {
        sourceSiteId: 'gamma',
        sourceSiteName: 'Gamma',
        sourceDomain: 'gamma.test',
        status: 'no-pages',
        attemptedPages: 0,
        crawledPages: 0,
        failedPages: 0,
        targets: [
          {
            targetSiteId: 'alpha',
            targetSiteName: 'Alpha',
            targetDomain: 'alpha.test',
            linkedPages: null,
            missingPages: null,
            linkedExamples: [],
          },
          {
            targetSiteId: 'beta',
            targetSiteName: 'Beta',
            targetDomain: 'beta.test',
            linkedPages: null,
            missingPages: null,
            linkedExamples: [],
          },
        ],
      },
    ]);
    expect(consoleError).toHaveBeenCalledWith('[cross-links] alpha:', expect.any(Error));
    consoleError.mockRestore();
  });

  it('excludes failed page fetches from missing-page counts and marks fully failed crawls unavailable', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL) => {
      const url = String(input);
      if (url === 'https://alpha.test/post-a') {
        return new Response('<a href="https://beta.test/docs">Beta</a>');
      }
      if (url === 'https://alpha.test/post-b') {
        throw new Error('timeout');
      }
      if (url === 'https://beta.test/home') {
        return new Response('', { status: 503 });
      }
      return new Response('', { status: 404 });
    }) as typeof fetch);

    mockCachedGetSearchConsolePages.mockImplementation((siteUrl: string) => {
      if (siteUrl === 'sc-domain:alpha.test') {
        return [{ page: '/post-a' }, { page: '/post-b' }];
      }
      if (siteUrl === 'sc-domain:beta.test') {
        return [{ page: '/home' }];
      }
      if (siteUrl === 'sc-domain:gamma.test') {
        return [];
      }
      return [];
    });

    const matrix = await getCrossLinkMatrix(sites);

    expect(matrix).toEqual([
      {
        sourceSiteId: 'alpha',
        sourceSiteName: 'Alpha',
        sourceDomain: 'alpha.test',
        status: 'ok',
        attemptedPages: 2,
        crawledPages: 1,
        failedPages: 1,
        targets: [
          {
            targetSiteId: 'beta',
            targetSiteName: 'Beta',
            targetDomain: 'beta.test',
            linkedPages: 1,
            missingPages: 0,
            linkedExamples: ['https://alpha.test/post-a'],
          },
          {
            targetSiteId: 'gamma',
            targetSiteName: 'Gamma',
            targetDomain: 'gamma.test',
            linkedPages: 0,
            missingPages: 1,
            linkedExamples: [],
          },
        ],
      },
      {
        sourceSiteId: 'beta',
        sourceSiteName: 'Beta',
        sourceDomain: 'beta.test',
        status: 'crawl-unavailable',
        attemptedPages: 1,
        crawledPages: 0,
        failedPages: 1,
        targets: [
          {
            targetSiteId: 'alpha',
            targetSiteName: 'Alpha',
            targetDomain: 'alpha.test',
            linkedPages: null,
            missingPages: null,
            linkedExamples: [],
          },
          {
            targetSiteId: 'gamma',
            targetSiteName: 'Gamma',
            targetDomain: 'gamma.test',
            linkedPages: null,
            missingPages: null,
            linkedExamples: [],
          },
        ],
      },
      {
        sourceSiteId: 'gamma',
        sourceSiteName: 'Gamma',
        sourceDomain: 'gamma.test',
        status: 'no-pages',
        attemptedPages: 0,
        crawledPages: 0,
        failedPages: 0,
        targets: [
          {
            targetSiteId: 'alpha',
            targetSiteName: 'Alpha',
            targetDomain: 'alpha.test',
            linkedPages: null,
            missingPages: null,
            linkedExamples: [],
          },
          {
            targetSiteId: 'beta',
            targetSiteName: 'Beta',
            targetDomain: 'beta.test',
            linkedPages: null,
            missingPages: null,
            linkedExamples: [],
          },
        ],
      },
    ]);
  });

  it('caps crawled pages at the top 20 from Search Console and ignores the rest', async () => {
    const twoSites: Site[] = [
      { id: 'alpha', name: 'Alpha', domain: 'alpha.test', testPages: ['/'] },
      { id: 'beta', name: 'Beta', domain: 'beta.test', testPages: ['/'] },
    ];

    const fetchSpy = vi.fn(async (input: string | URL) => {
      const url = String(input);
      const match = url.match(/^https:\/\/alpha\.test\/post-(\d+)$/);
      if (match) {
        return new Response('<a href="https://beta.test/docs">Beta</a>');
      }
      return new Response('', { status: 404 });
    });
    vi.stubGlobal('fetch', fetchSpy as typeof fetch);

    mockCachedGetSearchConsolePages.mockImplementation((siteUrl: string) => {
      if (siteUrl === 'sc-domain:alpha.test') {
        return Array.from({ length: 25 }, (_, i) => ({ page: `/post-${i}` }));
      }
      return [];
    });

    const matrix = await getCrossLinkMatrix(twoSites);

    const alpha = matrix.find((row) => row.sourceSiteId === 'alpha');
    expect(alpha?.status).toBe('ok');
    expect(alpha?.attemptedPages).toBe(20);
    expect(alpha?.crawledPages).toBe(20);
    expect(alpha?.targets[0]).toMatchObject({
      targetSiteId: 'beta',
      linkedPages: 20,
      missingPages: 0,
    });
    expect(alpha?.targets[0].linkedExamples).toHaveLength(3);

    const alphaFetches = fetchSpy.mock.calls.filter((call) =>
      String(call[0]).startsWith('https://alpha.test/'),
    );
    expect(alphaFetches).toHaveLength(20);
    expect(alphaFetches.some((call) => String(call[0]) === 'https://alpha.test/post-20')).toBe(false);
  });

  it('drops Search Console rows that fail URL normalization before crawling', async () => {
    const twoSites: Site[] = [
      { id: 'alpha', name: 'Alpha', domain: 'alpha.test', testPages: ['/'] },
      { id: 'beta', name: 'Beta', domain: 'beta.test', testPages: ['/'] },
    ];

    const fetchSpy = vi.fn(async (input: string | URL) => {
      const url = String(input);
      if (url === 'https://alpha.test/good') {
        return new Response('<a href="https://beta.test/x">Beta</a>');
      }
      return new Response('', { status: 404 });
    });
    vi.stubGlobal('fetch', fetchSpy as typeof fetch);

    mockCachedGetSearchConsolePages.mockImplementation((siteUrl: string) => {
      if (siteUrl === 'sc-domain:alpha.test') {
        return [
          { page: '' },
          { page: 'http://[invalid-host' },
          { page: '/good' },
        ];
      }
      return [];
    });

    const matrix = await getCrossLinkMatrix(twoSites);

    const alpha = matrix.find((row) => row.sourceSiteId === 'alpha');
    expect(alpha?.status).toBe('ok');
    expect(alpha?.attemptedPages).toBe(1);
    expect(alpha?.crawledPages).toBe(1);
    expect(alpha?.failedPages).toBe(0);
    expect(alpha?.targets[0]).toMatchObject({
      targetSiteId: 'beta',
      linkedPages: 1,
      missingPages: 0,
      linkedExamples: ['https://alpha.test/good'],
    });

    const alphaFetches = fetchSpy.mock.calls.filter((call) =>
      String(call[0]).startsWith('https://alpha.test/'),
    );
    expect(alphaFetches).toHaveLength(1);
    const [firstAlphaFetch] = alphaFetches;
    expect(String(firstAlphaFetch?.[0])).toBe('https://alpha.test/good');
  });

  it('falls back to no-pages when every Search Console row fails URL normalization', async () => {
    const twoSites: Site[] = [
      { id: 'alpha', name: 'Alpha', domain: 'alpha.test', testPages: ['/'] },
      { id: 'beta', name: 'Beta', domain: 'beta.test', testPages: ['/'] },
    ];

    const fetchSpy = vi.fn(async (_input: string | URL) => new Response('', { status: 404 }));
    vi.stubGlobal('fetch', fetchSpy as typeof fetch);

    mockCachedGetSearchConsolePages.mockImplementation((siteUrl: string) => {
      if (siteUrl === 'sc-domain:alpha.test') {
        return [{ page: '' }, { page: 'http://[bad' }];
      }
      return [];
    });

    const matrix = await getCrossLinkMatrix(twoSites);

    const alpha = matrix.find((row) => row.sourceSiteId === 'alpha');
    expect(alpha?.status).toBe('no-pages');
    expect(alpha?.attemptedPages).toBe(0);
    expect(alpha?.targets[0]).toMatchObject({
      targetSiteId: 'beta',
      linkedPages: null,
      missingPages: null,
      linkedExamples: [],
    });

    const alphaFetches = fetchSpy.mock.calls.filter((call) =>
      String(call[0]).startsWith('https://alpha.test/'),
    );
    expect(alphaFetches).toHaveLength(0);
  });

  it('does not treat sibling hostnames as managed-domain matches', async () => {
    const twoSites: Site[] = [
      { id: 'alpha', name: 'Alpha', domain: 'alpha.test', testPages: ['/'] },
      { id: 'beta', name: 'Beta', domain: 'beta.test', testPages: ['/'] },
    ];

    vi.stubGlobal('fetch', vi.fn(async (input: string | URL) => {
      const url = String(input);
      if (url === 'https://beta.test/home') {
        return new Response('<a href="https://xalpha.test/near-miss">Near miss</a>');
      }
      return new Response('', { status: 404 });
    }) as typeof fetch);

    mockCachedGetSearchConsolePages.mockImplementation((siteUrl: string) => {
      if (siteUrl === 'sc-domain:beta.test') {
        return [{ page: '/home' }];
      }
      return [];
    });

    const matrix = await getCrossLinkMatrix(twoSites);

    const beta = matrix.find((row) => row.sourceSiteId === 'beta');
    expect(beta?.status).toBe('ok');
    expect(beta?.targets[0]).toMatchObject({
      targetSiteId: 'alpha',
      linkedPages: 0,
      missingPages: 1,
      linkedExamples: [],
    });
  });

  it('prefers the most specific managed domain when apex and subdomain sites overlap', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL) => {
      const url = String(input);
      if (url === 'https://example.com/home') {
        return new Response('<a href="https://blog.example.com/post-1">Blog</a>');
      }
      if (url === 'https://blog.example.com/post-1') {
        return new Response('<a href="https://example.com/docs">Apex</a>');
      }
      if (url === 'https://partner.test/start') {
        return new Response('<a href="https://news.blog.example.com/story">Blog network</a>');
      }
      return new Response('', { status: 404 });
    }) as typeof fetch);

    mockCachedGetSearchConsolePages.mockImplementation((siteUrl: string) => {
      if (siteUrl === 'sc-domain:example.com') {
        return [{ page: '/home' }];
      }
      if (siteUrl === 'sc-domain:blog.example.com') {
        return [{ page: '/post-1' }];
      }
      if (siteUrl === 'sc-domain:partner.test') {
        return [{ page: '/start' }];
      }
      return [];
    });

    const matrix = await getCrossLinkMatrix(overlappingSites);

    expect(matrix).toEqual([
      {
        sourceSiteId: 'apex',
        sourceSiteName: 'Apex',
        sourceDomain: 'example.com',
        status: 'ok',
        attemptedPages: 1,
        crawledPages: 1,
        failedPages: 0,
        targets: [
          {
            targetSiteId: 'blog',
            targetSiteName: 'Blog',
            targetDomain: 'blog.example.com',
            linkedPages: 1,
            missingPages: 0,
            linkedExamples: ['https://example.com/home'],
          },
          {
            targetSiteId: 'partner',
            targetSiteName: 'Partner',
            targetDomain: 'partner.test',
            linkedPages: 0,
            missingPages: 1,
            linkedExamples: [],
          },
        ],
      },
      {
        sourceSiteId: 'blog',
        sourceSiteName: 'Blog',
        sourceDomain: 'blog.example.com',
        status: 'ok',
        attemptedPages: 1,
        crawledPages: 1,
        failedPages: 0,
        targets: [
          {
            targetSiteId: 'apex',
            targetSiteName: 'Apex',
            targetDomain: 'example.com',
            linkedPages: 1,
            missingPages: 0,
            linkedExamples: ['https://blog.example.com/post-1'],
          },
          {
            targetSiteId: 'partner',
            targetSiteName: 'Partner',
            targetDomain: 'partner.test',
            linkedPages: 0,
            missingPages: 1,
            linkedExamples: [],
          },
        ],
      },
      {
        sourceSiteId: 'partner',
        sourceSiteName: 'Partner',
        sourceDomain: 'partner.test',
        status: 'ok',
        attemptedPages: 1,
        crawledPages: 1,
        failedPages: 0,
        targets: [
          {
            targetSiteId: 'apex',
            targetSiteName: 'Apex',
            targetDomain: 'example.com',
            linkedPages: 0,
            missingPages: 1,
            linkedExamples: [],
          },
          {
            targetSiteId: 'blog',
            targetSiteName: 'Blog',
            targetDomain: 'blog.example.com',
            linkedPages: 1,
            missingPages: 0,
            linkedExamples: ['https://partner.test/start'],
          },
        ],
      },
    ]);
  });
});
