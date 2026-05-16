import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('notFound');
  },
}));

const {
  mockTrendsTable,
  mockGetManagedSites,
  mockGetManagedSite,
  mockGetSCUrl,
  mockGetSnapshotCount,
  mockGetKeywordCount,
  mockGetScTrends,
  mockGetGa4Trends,
  mockGetAuditTrends,
  mockGetTtfbTrends,
  mockGetTopKeywordsWithHistory,
  mockGetKeywordDeltas,
  mockGetScDaily,
  mockGetGa4Daily,
  mockAnalyzeSiteGaps,
  mockCreateSiteGapSignals,
  mockGapsBySection,
} = vi.hoisted(() => ({
  mockTrendsTable: vi.fn(({ title }: { title: string }) => <div>{title}</div>),
  mockGetManagedSites: vi.fn(),
  mockGetManagedSite: vi.fn(),
  mockGetSCUrl: vi.fn(),
  mockGetSnapshotCount: vi.fn(),
  mockGetKeywordCount: vi.fn(),
  mockGetScTrends: vi.fn(),
  mockGetGa4Trends: vi.fn(),
  mockGetAuditTrends: vi.fn(),
  mockGetTtfbTrends: vi.fn(),
  mockGetTopKeywordsWithHistory: vi.fn(),
  mockGetKeywordDeltas: vi.fn(),
  mockGetScDaily: vi.fn(),
  mockGetGa4Daily: vi.fn(),
  mockAnalyzeSiteGaps: vi.fn(() => ({
    gaps: [],
    counts: { high: 0, medium: 0, low: 0 },
  })),
  mockCreateSiteGapSignals: vi.fn((signals) => signals),
  mockGapsBySection: vi.fn(() => ({})),
}));

vi.mock('@/lib/sites', () => ({
  getManagedSites: mockGetManagedSites,
  getManagedSite: mockGetManagedSite,
  getSCUrl: mockGetSCUrl,
}));

vi.mock('@/lib/db', () => ({
  getSnapshotCount: mockGetSnapshotCount,
  getKeywordCount: mockGetKeywordCount,
  getScTrends: mockGetScTrends,
  getGa4Trends: mockGetGa4Trends,
  getAuditTrends: mockGetAuditTrends,
  getTtfbTrends: mockGetTtfbTrends,
  getTopKeywordsWithHistory: mockGetTopKeywordsWithHistory,
  getKeywordDeltas: mockGetKeywordDeltas,
  getScDaily: mockGetScDaily,
  getGa4Daily: mockGetGa4Daily,
}));

vi.mock('@/lib/format', () => ({
  formatDuration: (value: number) => `${value}s`,
  formatBounce: (value: number) => `${value}%`,
  pluralize: (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`,
  formatSource: (value: string) => value,
}));

vi.mock('@/lib/constants', () => ({
  METRIC_COLORS: {
    users: '#1',
    views: '#2',
    sessions: '#3',
    clicks: '#4',
    impressions: '#5',
    position: '#6',
  },
  CHART_COLORS: ['#1', '#2', '#3', '#4', '#5'],
  VALID_DAYS: [7, 30, 90],
}));

vi.mock('../../../app/components/trend-chart', () => ({
  default: () => <div>Trend Chart</div>,
}));

vi.mock('../../../app/components/position-badge', () => ({
  PositionBadge: ({ position }: { position: number }) => <span>{position}</span>,
}));

vi.mock('../../../app/components/trend-badge', () => ({
  TrendBadge: () => <span>trend</span>,
}));

vi.mock('../../../app/components/trends-table', () => ({
  TrendsTable: mockTrendsTable,
}));

vi.mock('../../../app/components/keyword-rank-table', () => ({
  KeywordRankTable: ({ deltas }: { deltas: Array<{ query: string }> }) => (
    <div>{deltas.map((delta) => delta.query).join(',')}</div>
  ),
}));

vi.mock('@/lib/ga4', () => ({
  discoverPropertyIds: vi.fn(async () => [{ id: 'site-1', ga4PropertyId: 'prop-1' }]),
  cachedGetAnalytics: vi.fn(async () => ({
    data: {
      current: { users: 10, sessions: 20, views: 30, bounceRate: 0.45, avgSessionDuration: 12 },
      previous: { users: 8, sessions: 16, views: 24, bounceRate: 0.4, avgSessionDuration: 10 },
      topPages: [],
      trafficSources: [],
    },
    error: false,
  })),
}));

vi.mock('@/lib/search-console', () => ({
  cachedGetSearchConsoleDataWithComparison: vi.fn(async () => ({
    data: {
      current: { clicks: 10, impressions: 100, ctr: 0.1, position: 4.2 },
      previous: { clicks: 8, impressions: 80, ctr: 0.1, position: 4.8 },
    },
    error: false,
  })),
  cachedGetSearchConsoleQueries: vi.fn(async () => []),
  cachedGetSearchConsolePages: vi.fn(async () => []),
  cachedGetSitemapSubmissions: vi.fn(async () => []),
}));

vi.mock('@/lib/audit', () => ({
  cachedAuditSite: vi.fn(async () => makeAuditResult()),
  normalizeSiteAuditResult: vi.fn((audit) => ({
    ...audit,
    redirectChains: audit.redirectChains ?? [],
  })),
}));

vi.mock('@/lib/performance-site', () => ({
  getCwvAuditSummary: vi.fn(async () => null),
}));

vi.mock('@/lib/gaps', () => ({
  analyzeSiteGaps: mockAnalyzeSiteGaps,
  createSiteGapSignals: mockCreateSiteGapSignals,
  gapsBySection: mockGapsBySection,
}));

vi.mock('../../../app/components/time-range', () => ({
  default: () => <div>Time Range</div>,
}));

vi.mock('../../../app/components/icons', () => ({
  Icons: {
    clicks: null,
    impressions: null,
    ctr: null,
    position: null,
    users: null,
    sessions: null,
    views: null,
    bounce: null,
    duration: null,
  },
}));

vi.mock('../../../app/components/metric-card', () => ({
  MetricCard: ({ label }: { label: string }) => <div>{label}</div>,
}));

vi.mock('../../../app/components/audit/check-card', () => ({
  CheckCard: ({
    check,
    gaps,
    children,
  }: {
    check: { label: string; message: string };
    gaps?: Array<{ title: string; hint: string }>;
    children?: React.ReactNode;
  }) => (
    <div>
      <div>{check.label}</div>
      <div>{check.message}</div>
      {gaps?.map((gap) => (
        <div key={gap.title}>
          <div>{gap.title}</div>
          <div>{gap.hint}</div>
        </div>
      ))}
      {children}
    </div>
  ),
  statusDots: {},
  Recommendation: ({ gap }: { gap: { title: string } }) => <div>{gap.title}</div>,
  MetaChecksTable: () => <div>Meta Checks</div>,
}));

vi.mock('../../../app/components/sc-table', () => ({
  ScTable: ({ heading }: { heading: string }) => <div>{heading}</div>,
}));

function makeCheckResult(overrides: Partial<{
  status: 'pass' | 'warn' | 'fail' | 'error';
  label: string;
  message: string;
  details?: string;
}> = {}) {
  return {
    status: 'pass' as const,
    label: 'Check',
    message: 'OK',
    ...overrides,
  };
}

function makeAuditResult() {
  return {
    siteId: 'site-1',
    domain: 'site-one.test',
    timestamp: Date.now(),
    robotsTxt: {
      ...makeCheckResult({ label: 'robots.txt' }),
      hasSitemapDirective: true,
      sitemapUrl: 'https://site-one.test/sitemap.xml',
      raw: 'Sitemap: https://site-one.test/sitemap.xml',
    },
    sitemap: {
      ...makeCheckResult({ label: 'Sitemap' }),
      url: 'https://site-one.test/sitemap.xml',
      urlCount: 10,
      isIndex: false,
      hasLastmod: true,
      lastmodSample: '2026-05-02',
    },
    scSitemapFreshness: makeCheckResult({ label: 'SC Sitemap' }),
    indexNow: makeCheckResult({ label: 'IndexNow' }),
    indexingCoverage: {
      ...makeCheckResult({ label: 'Indexing' }),
      sitemapUrls: 10,
      indexedPages: 8,
      coveragePct: 80,
    },
    urlInspection: [],
    redirectChains: [],
    metaTags: [],
    ogImage: {
      ...makeCheckResult({ label: 'OG Image' }),
      url: 'https://site-one.test/og.png',
      contentType: 'image/png',
      dimensions: '1200x630',
    },
    ttfb: {
      ...makeCheckResult({ label: 'TTFB' }),
      ms: 320,
    },
    imageSeo: [],
    internalLinks: [],
    security: {
      https: makeCheckResult({ label: 'HTTPS' }),
      hsts: makeCheckResult({ label: 'HSTS' }),
      favicon: makeCheckResult({ label: 'Favicon' }),
    },
    score: { pass: 5, warn: 1, fail: 0, error: 0, total: 6 },
    sampledPages: ['/'],
  };
}

import TrendsPage from '../../../app/trends/page';
import SiteDashboardPage from '../../../app/[site]/page';

const managedSite = {
  id: 'site-1',
  name: 'Site One',
  domain: 'site-one.test',
  ga4PropertyId: 'prop-1',
  searchConsole: true,
  testPages: [],
  skipChecks: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  mockTrendsTable.mockImplementation(({ title }: { title: string }) => <div>{title}</div>);
  mockAnalyzeSiteGaps.mockReturnValue({
    gaps: [],
    counts: { high: 0, medium: 0, low: 0 },
  });
  mockCreateSiteGapSignals.mockImplementation((signals) => signals);
  mockGapsBySection.mockReturnValue({});

  mockGetManagedSites.mockResolvedValue([managedSite]);
  mockGetManagedSite.mockResolvedValue(managedSite);
  mockGetSCUrl.mockReturnValue('sc-domain:site-one.test');

  mockGetSnapshotCount.mockReturnValue(2);
  mockGetKeywordCount.mockReturnValue(3);
  mockGetScTrends.mockReturnValue([
    { date: '2026-05-01', clicks: 10, impressions: 100, ctr: 0.1, position: 4.5 },
    { date: '2026-05-02', clicks: 12, impressions: 120, ctr: 0.1, position: 4.1 },
  ]);
  mockGetGa4Trends.mockReturnValue([
    { date: '2026-05-01', users: 20, sessions: 30, views: 40, bounceRate: 0.4, avgDuration: 15 },
    { date: '2026-05-02', users: 25, sessions: 35, views: 45, bounceRate: 0.35, avgDuration: 18 },
  ]);
  mockGetAuditTrends.mockReturnValue([
    { date: '2026-05-02', pass: 7, warn: 1, fail: 0, sitemapUrls: 10, indexedPages: 8, coveragePct: 80 },
  ]);
  mockGetTtfbTrends.mockReturnValue([]);
  mockGetTopKeywordsWithHistory.mockReturnValue({
    topQueries: ['seo tools'],
    history: [
      { date: '2026-05-01', query: 'seo tools', clicks: 1, impressions: 10, ctr: 0.1, position: 6 },
      { date: '2026-05-02', query: 'seo tools', clicks: 2, impressions: 12, ctr: 0.16, position: 4 },
    ],
  });
  mockGetKeywordDeltas.mockReturnValue([
    { query: 'seo tools', currentPosition: 4, delta7d: 2, delta30d: null, trend: 'up' },
  ]);
  mockGetScDaily.mockReturnValue([]);
  mockGetGa4Daily.mockReturnValue([]);
});

describe('TrendsPage', () => {
  it('renders the overview section first by default', async () => {
    const html = renderToStaticMarkup(await TrendsPage({
      searchParams: Promise.resolve({}),
    }));

    expect(html).toContain('Per-Site Data');
    expect(html).toContain('Keyword History');
    expect(html.indexOf('Per-Site Data')).toBeLessThan(html.indexOf('Keyword History'));
  });

  it('wires site trend tables through TrendsTable for the sticky-header views', async () => {
    renderToStaticMarkup(await TrendsPage({
      searchParams: Promise.resolve({}),
    }));

    expect(mockTrendsTable).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'GA4 Data',
        columns: expect.arrayContaining([
          expect.objectContaining({ label: 'Date' }),
          expect.objectContaining({ label: 'Users', align: 'right' }),
        ]),
      }),
      undefined
    );
    expect(mockTrendsTable).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'SC Data',
        columns: expect.arrayContaining([
          expect.objectContaining({ label: 'CTR', align: 'right' }),
          expect.objectContaining({ label: 'Position', align: 'right' }),
        ]),
      }),
      undefined
    );
    expect(mockTrendsTable).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Audit Score',
        columns: expect.arrayContaining([
          expect.objectContaining({ label: 'Pass', align: 'right' }),
          expect.objectContaining({ label: 'Fail', align: 'right' }),
        ]),
      }),
      undefined
    );
    expect(mockTrendsTable).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Indexing Coverage',
        columns: expect.arrayContaining([
          expect.objectContaining({ label: 'Coverage', align: 'right' }),
          expect.objectContaining({ label: 'Sitemap URLs', align: 'right' }),
        ]),
      }),
      undefined
    );
  });

  it('does not render indexing coverage trends when coverage fields are unavailable', async () => {
    mockGetAuditTrends.mockReturnValue([
      { date: '2026-05-02', pass: 7, warn: 1, fail: 0 },
    ]);

    const html = renderToStaticMarkup(await TrendsPage({
      searchParams: Promise.resolve({}),
    }));

    expect(html).not.toContain('Indexing Coverage');
    expect(mockTrendsTable.mock.calls.some(([props]) => props.title === 'Indexing Coverage')).toBe(false);
  });

  it('renders the keyword section first for legacy tab=keywords links', async () => {
    const html = renderToStaticMarkup(await TrendsPage({
      searchParams: Promise.resolve({ tab: 'keywords' }),
    }));

    expect(html).toContain('Per-Site Data');
    expect(html).toContain('Keyword History');
    expect(html.indexOf('Keyword History')).toBeLessThan(html.indexOf('Per-Site Data'));
  });
});

describe('SiteDashboardPage', () => {
  it('links keyword history cards to the merged trends keyword anchor', async () => {
    const html = renderToStaticMarkup(await SiteDashboardPage({
      params: Promise.resolve({ site: 'site-1' }),
      searchParams: Promise.resolve({}),
    }));

    expect(html).toContain('href="/trends#keywords"');
  });

  it('shows data unavailable indicator on GA4 provider error, not on real zero data', async () => {
    const { cachedGetAnalytics } = await import('@/lib/ga4');
    const mockAnalytics = vi.mocked(cachedGetAnalytics);

    mockAnalytics.mockResolvedValueOnce({ data: null, error: true });
    const errorHtml = renderToStaticMarkup(await SiteDashboardPage({
      params: Promise.resolve({ site: 'site-1' }),
      searchParams: Promise.resolve({}),
    }));
    expect(errorHtml).toContain('data unavailable');

    mockAnalytics.mockResolvedValueOnce({
      data: {
        current: { users: 0, sessions: 0, views: 0, bounceRate: 0, avgSessionDuration: 0 },
        previous: { users: 0, sessions: 0, views: 0, bounceRate: 0, avgSessionDuration: 0 },
        topPages: [],
        trafficSources: [],
      },
      error: false,
    });
    const zeroHtml = renderToStaticMarkup(await SiteDashboardPage({
      params: Promise.resolve({ site: 'site-1' }),
      searchParams: Promise.resolve({}),
    }));
    expect(zeroHtml).not.toContain('data unavailable');
  });

  it('shows skipped canonical checks as N/A instead of valid self-referential canonicals', async () => {
    const { cachedAuditSite } = await import('@/lib/audit');
    vi.mocked(cachedAuditSite).mockResolvedValueOnce({
      ...makeAuditResult(),
      metaTags: [{
        page: '/',
        noindex: false,
        canonicalValid: true,
        canonicalStatus: 200,
        canonicalTarget: 'https://site-one.test/',
        title: makeCheckResult({ label: 'title' }),
        description: makeCheckResult({ label: 'description' }),
        ogTitle: makeCheckResult({ label: 'og:title' }),
        ogImage: makeCheckResult({ label: 'og:image' }),
        ogDescription: makeCheckResult({ label: 'og:description' }),
        twitterCard: makeCheckResult({ label: 'twitter:card' }),
        canonical: makeCheckResult({ label: 'canonical', message: 'N/A — Self-referential canonical resolves' }),
        jsonLd: makeCheckResult({ label: 'JSON-LD' }),
      }],
    });

    const html = renderToStaticMarkup(await SiteDashboardPage({
      params: Promise.resolve({ site: 'site-1' }),
      searchParams: Promise.resolve({}),
    }));

    expect(html).toContain('1 page skipped (N/A)');
    expect(html).not.toContain('1/1 pages have valid self-referential canonicals');
  });

  it('describes missing canonicals without calling them broken targets', async () => {
    const { cachedAuditSite } = await import('@/lib/audit');
    vi.mocked(cachedAuditSite).mockResolvedValueOnce({
      ...makeAuditResult(),
      metaTags: [{
        page: '/',
        noindex: false,
        canonicalValid: null,
        canonicalStatus: null,
        canonicalTarget: null,
        title: makeCheckResult({ label: 'title' }),
        description: makeCheckResult({ label: 'description' }),
        ogTitle: makeCheckResult({ label: 'og:title' }),
        ogImage: makeCheckResult({ label: 'og:image' }),
        ogDescription: makeCheckResult({ label: 'og:description' }),
        twitterCard: makeCheckResult({ label: 'twitter:card' }),
        canonical: makeCheckResult({ status: 'fail', label: 'canonical', message: 'Not found' }),
        jsonLd: makeCheckResult({ label: 'JSON-LD' }),
      }],
    });

    const html = renderToStaticMarkup(await SiteDashboardPage({
      params: Promise.resolve({ site: 'site-1' }),
      searchParams: Promise.resolve({}),
    }));

    expect(html).toContain('1 page missing canonical tags');
    expect(html).not.toContain('failing canonical targets');
  });

  it('builds site gap analysis from the shared signal helper', async () => {
    const { cachedGetAnalytics } = await import('@/lib/ga4');
    const { cachedGetSearchConsolePages } = await import('@/lib/search-console');
    const duplicatedScRows = [
      { page: 'https://site-one.test/pricing', clicks: 28, impressions: 400, ctr: 0.07, position: 4.1 },
      { page: 'https://site-one.test/pricing/', clicks: 26, impressions: 320, ctr: 0.08125, position: 3.4 },
    ];

    vi.mocked(cachedGetAnalytics).mockResolvedValueOnce({
      data: {
        current: { users: 10, sessions: 20, views: 30, bounceRate: 0.45, avgSessionDuration: 12 },
        previous: { users: 8, sessions: 16, views: 24, bounceRate: 0.4, avgSessionDuration: 10 },
        topPages: [{ path: '/pricing', views: 300, users: 180, engagementRate: 0.32, avgSessionDuration: 42 }],
        trafficSources: [],
      },
      error: false,
    });
    vi.mocked(cachedGetSearchConsolePages).mockResolvedValueOnce(duplicatedScRows);

    await SiteDashboardPage({
      params: Promise.resolve({ site: 'site-1' }),
      searchParams: Promise.resolve({ days: '30' }),
    });

    expect(mockCreateSiteGapSignals).toHaveBeenCalledWith({
      ga4TopPages: [{ path: '/pricing', views: 300, users: 180, engagementRate: 0.32, avgSessionDuration: 42 }],
      scTopPages: duplicatedScRows,
      days: 30,
    });
    expect(mockAnalyzeSiteGaps).toHaveBeenCalledWith(
      expect.objectContaining({ siteId: 'site-1' }),
      expect.objectContaining({ id: 'site-1' }),
      {
        ga4TopPages: [{ path: '/pricing', views: 300, users: 180, engagementRate: 0.32, avgSessionDuration: 42 }],
        scTopPages: duplicatedScRows,
        days: 30,
      },
    );
  });

  it('renders indexing gaps through the shared recommendation path', async () => {
    mockGapsBySection.mockReturnValue({
      indexing: [{
        id: 'noindex-but-ranking',
        title: 'Remove accidental noindex from ranking pages',
        description: '1 noindexed page still receives Search Console clicks.',
        severity: 'high',
        category: 'indexing',
        hint: 'Remove the noindex directive from the rendered HTML or X-Robots-Tag response header.',
        evidence: ['https://site-one.test/pricing · 24 clicks · 240 impressions'],
      }],
    });

    const html = renderToStaticMarkup(await SiteDashboardPage({
      params: Promise.resolve({ site: 'site-1' }),
      searchParams: Promise.resolve({}),
    }));

    expect(html).toContain('Remove accidental noindex from ranking pages');
    expect(html).toContain('X-Robots-Tag response header');
    expect(html.match(/Remove accidental noindex from ranking pages/g)).toHaveLength(1);
  });

  it('renders the low-engagement recommendation alongside the summary count', async () => {
    const gap = {
      id: 'low-engagement-despite-traffic',
      title: 'Fix pages that rank but do not engage visitors',
      description: '1 page attracts search traffic but converts poorly once users land.',
      severity: 'medium' as const,
      category: 'content' as const,
      hint: 'Tighten intent match and CTA placement.',
      affectedPages: ['/pricing'],
    };

    mockAnalyzeSiteGaps.mockReturnValueOnce({
      gaps: [gap],
      counts: { high: 0, medium: 1, low: 0 },
    } as never);
    mockGapsBySection.mockReturnValueOnce({
      content: [gap],
    } as never);

    const html = renderToStaticMarkup(await SiteDashboardPage({
      params: Promise.resolve({ site: 'site-1' }),
      searchParams: Promise.resolve({}),
    }));

    expect(html).toContain('recommendations');
    expect(html).toContain('1 med');
    expect(html).toContain('Content Opportunities');
    expect(html).toContain('Fix pages that rank but do not engage visitors');
  });
});
