import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockCachedGetSearchConsolePages,
  mockAuditPageMetaTags,
  mockWithCache,
} = vi.hoisted(() => ({
  mockCachedGetSearchConsolePages: vi.fn(),
  mockAuditPageMetaTags: vi.fn(),
  mockWithCache: vi.fn((_key: string, _id: string, fetcher: () => unknown) => fetcher()),
}));

vi.mock('../db', () => ({
  withCache: mockWithCache,
}));

vi.mock('../search-console', () => ({
  cachedGetSearchConsolePages: mockCachedGetSearchConsolePages,
}));

vi.mock('../audit', () => ({
  auditPageMetaTags: mockAuditPageMetaTags,
}));

import { getPageOpportunityRows } from '../page-opportunities';

describe('getPageOpportunityRows', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns quick-win rows when impressions are high, ctr is low, and metadata issues exist', async () => {
    mockCachedGetSearchConsolePages.mockResolvedValue([
      {
        page: 'https://example.com/pricing',
        clicks: 8,
        impressions: 320,
        ctr: 0.025,
        position: 11.4,
      },
    ]);

    mockAuditPageMetaTags.mockResolvedValue([
      {
        page: 'https://example.com/pricing',
        title: { status: 'pass', label: 'title', message: 'Pricing' },
        description: { status: 'fail', label: 'description', message: 'Not found' },
        ogImage: { status: 'warn', label: 'og:image', message: 'Missing image' },
        canonical: { status: 'pass', label: 'canonical', message: 'Valid' },
      },
    ]);

    const rows = await getPageOpportunityRows({
      id: 'example',
      name: 'Example',
      domain: 'example.com',
      searchConsole: true,
      testPages: [],
      skipChecks: [],
    }, 7);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      page: 'https://example.com/pricing',
      issueCount: 2,
      quickWin: true,
    });
  });

  it('returns an empty list when search console is disabled', async () => {
    const rows = await getPageOpportunityRows({
      id: 'example',
      name: 'Example',
      domain: 'example.com',
      searchConsole: false,
      testPages: [],
      skipChecks: [],
    }, 7);

    expect(rows).toEqual([]);
    expect(mockCachedGetSearchConsolePages).not.toHaveBeenCalled();
    expect(mockAuditPageMetaTags).not.toHaveBeenCalled();
  });

  it('neutralizes skipped page metadata checks before counting issues or quick wins', async () => {
    mockCachedGetSearchConsolePages.mockResolvedValue([
      {
        page: 'https://example.com/pricing',
        clicks: 4,
        impressions: 500,
        ctr: 0.01,
        position: 9.2,
      },
    ]);

    mockAuditPageMetaTags.mockResolvedValue([
      {
        page: 'https://example.com/pricing',
        title: { status: 'pass', label: 'title', message: 'Pricing' },
        description: { status: 'pass', label: 'description', message: 'Plans and pricing' },
        ogImage: { status: 'fail', label: 'og:image', message: 'Not found' },
        canonical: { status: 'fail', label: 'canonical', message: 'Not found' },
      },
    ]);

    const rows = await getPageOpportunityRows({
      id: 'example',
      name: 'Example',
      domain: 'example.com',
      searchConsole: true,
      testPages: [],
      skipChecks: ['canonical', 'og:image'],
    }, 7);

    expect(rows).toHaveLength(1);
    expect(rows[0].issueCount).toBe(0);
    expect(rows[0].quickWin).toBe(false);
    expect(rows[0].checks.canonical).toMatchObject({
      status: 'pass',
      message: 'N/A — Not found',
    });
    expect(rows[0].checks.ogImage).toMatchObject({
      status: 'pass',
      message: 'N/A — Not found',
    });
  });

  it('keeps the OG image asset skip separate from the og:image meta check', async () => {
    mockCachedGetSearchConsolePages.mockResolvedValue([
      {
        page: 'https://example.com/pricing',
        clicks: 4,
        impressions: 500,
        ctr: 0.01,
        position: 9.2,
      },
    ]);

    mockAuditPageMetaTags.mockResolvedValue([
      {
        page: 'https://example.com/pricing',
        title: { status: 'pass', label: 'title', message: 'Pricing' },
        description: { status: 'pass', label: 'description', message: 'Plans and pricing' },
        ogImage: { status: 'fail', label: 'og:image', message: 'Not found' },
        canonical: { status: 'pass', label: 'canonical', message: 'Valid' },
      },
    ]);

    const rows = await getPageOpportunityRows({
      id: 'example',
      name: 'Example',
      domain: 'example.com',
      searchConsole: true,
      testPages: [],
      skipChecks: ['ogImage'],
    }, 7);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      issueCount: 1,
      quickWin: true,
    });
    expect(rows[0].checks.ogImage.status).toBe('fail');
  });

  it('keeps server-render enrichment bounded to a small audited subset', async () => {
    const scPages = Array.from({ length: 20 }, (_, index) => ({
      page: `https://example.com/page-${index + 1}`,
      clicks: 1,
      impressions: 500,
      ctr: 0.01,
      position: 8,
    }));

    mockCachedGetSearchConsolePages.mockResolvedValue(scPages);
    mockAuditPageMetaTags.mockResolvedValue(
      scPages.slice(0, 10).map((page) => ({
        page: page.page,
        title: { status: 'pass', label: 'title', message: 'Title' },
        description: { status: 'pass', label: 'description', message: 'Description' },
        ogImage: { status: 'pass', label: 'og:image', message: 'Image' },
        canonical: { status: 'pass', label: 'canonical', message: 'Canonical' },
      })),
    );

    const rows = await getPageOpportunityRows({
      id: 'example',
      name: 'Example',
      domain: 'example.com',
      searchConsole: true,
      testPages: [],
      skipChecks: [],
    }, 7);

    expect(mockCachedGetSearchConsolePages).toHaveBeenCalledWith('sc-domain:example.com', 7, 20);
    expect(mockAuditPageMetaTags).toHaveBeenCalledWith(
      'example.com',
      scPages.slice(0, 10).map((page) => page.page),
      {
        concurrency: 3,
        timeoutMs: 3000,
        canonicalTimeoutMs: 1500,
        retries: 0,
      },
    );
    expect(rows).toHaveLength(20);
    expect(rows[10]).toMatchObject({
      issueCount: 0,
      quickWin: false,
    });
    expect(rows[10].checks.title).toMatchObject({
      status: 'pass',
      message: 'N/A — Audit not run for this page',
    });
  });

  it('returns neutral page rows when metadata enrichment fails', async () => {
    mockCachedGetSearchConsolePages.mockResolvedValue([
      {
        page: 'https://example.com/pricing',
        clicks: 4,
        impressions: 500,
        ctr: 0.01,
        position: 9.2,
      },
    ]);
    mockAuditPageMetaTags.mockRejectedValue(new Error('metadata timeout'));
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const rows = await getPageOpportunityRows({
      id: 'example',
      name: 'Example',
      domain: 'example.com',
      searchConsole: true,
      testPages: [],
      skipChecks: [],
    }, 7);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      issueCount: 0,
      quickWin: false,
    });
    expect(rows[0].checks.canonical).toMatchObject({
      status: 'pass',
      message: 'N/A — Audit not run for this page',
    });
  });
});
