import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactNode } from 'react';

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: { href: string; children: ReactNode }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('notFound');
  },
}));

const {
  mockGetManagedSite,
  mockGetSCUrl,
  mockGetCwvAuditSummary,
  mockDiscoverPropertyIds,
  mockCachedGetAnalytics,
  mockCachedGetSearchConsoleDataWithComparison,
  mockCachedGetSearchConsolePages,
  mockCachedGetSearchConsoleQueries,
  mockCachedGetSitemapSubmissions,
  mockCachedAuditSite,
  mockCreateFailedSiteAuditResult,
  mockNormalizeSiteAuditResult,
  mockAnalyzeSiteGaps,
  mockCreateSiteGapSignals,
  mockGapsBySection,
  mockSummarizeCanonicalChecks,
  mockGetScDaily,
  mockGetGa4Daily,
  mockGetKeywordDeltas,
  mockPageQueriesTable,
} = vi.hoisted(() => ({
  mockGetManagedSite: vi.fn(),
  mockGetSCUrl: vi.fn(),
  mockGetCwvAuditSummary: vi.fn(),
  mockDiscoverPropertyIds: vi.fn(),
  mockCachedGetAnalytics: vi.fn(),
  mockCachedGetSearchConsoleDataWithComparison: vi.fn(),
  mockCachedGetSearchConsolePages: vi.fn(),
  mockCachedGetSearchConsoleQueries: vi.fn(),
  mockCachedGetSitemapSubmissions: vi.fn(),
  mockCachedAuditSite: vi.fn(),
  mockCreateFailedSiteAuditResult: vi.fn(),
  mockNormalizeSiteAuditResult: vi.fn(),
  mockAnalyzeSiteGaps: vi.fn(),
  mockCreateSiteGapSignals: vi.fn(),
  mockGapsBySection: vi.fn(),
  mockSummarizeCanonicalChecks: vi.fn(),
  mockGetScDaily: vi.fn(),
  mockGetGa4Daily: vi.fn(),
  mockGetKeywordDeltas: vi.fn(),
  mockPageQueriesTable: vi.fn(({ siteId, days }: { siteId: string; days: number }) => (
    <div>PageQueries:{siteId}:{days}</div>
  )),
}));

vi.mock('@/lib/sites', () => ({
  getManagedSite: mockGetManagedSite,
  getSCUrl: mockGetSCUrl,
}));

vi.mock('@/lib/performance-site', () => ({
  getCwvAuditSummary: mockGetCwvAuditSummary,
}));

vi.mock('@/lib/ga4', () => ({
  discoverPropertyIds: mockDiscoverPropertyIds,
  cachedGetAnalytics: mockCachedGetAnalytics,
}));

vi.mock('@/lib/search-console', () => ({
  cachedGetSearchConsoleDataWithComparison: mockCachedGetSearchConsoleDataWithComparison,
  cachedGetSearchConsolePages: mockCachedGetSearchConsolePages,
  cachedGetSearchConsoleQueries: mockCachedGetSearchConsoleQueries,
  cachedGetSitemapSubmissions: mockCachedGetSitemapSubmissions,
}));

vi.mock('@/lib/audit', () => ({
  cachedAuditSite: mockCachedAuditSite,
  createFailedSiteAuditResult: mockCreateFailedSiteAuditResult,
  normalizeSiteAuditResult: mockNormalizeSiteAuditResult,
}));

vi.mock('@/lib/gaps', () => ({
  analyzeSiteGaps: mockAnalyzeSiteGaps,
  createSiteGapSignals: mockCreateSiteGapSignals,
  gapsBySection: mockGapsBySection,
}));

vi.mock('@/lib/canonical', () => ({
  summarizeCanonicalChecks: mockSummarizeCanonicalChecks,
}));

vi.mock('@/lib/db', () => ({
  getScDaily: mockGetScDaily,
  getGa4Daily: mockGetGa4Daily,
  getKeywordDeltas: mockGetKeywordDeltas,
}));

vi.mock('@/lib/constants', () => ({
  METRIC_COLORS: {
    position: '#1',
    clicks: '#2',
    impressions: '#3',
    users: '#4',
    sessions: '#5',
    views: '#6',
  },
  CWV_RATING_COLORS: {
    good: { text: 'text-emerald-400', label: 'Good' },
    'needs-improvement': { text: 'text-amber-400', label: 'Needs Improvement' },
    poor: { text: 'text-red-400', label: 'Poor' },
  },
  CWV_THRESHOLDS: {
    LCP: { unit: 'ms' },
    INP: { unit: 'ms' },
    CLS: { unit: 'score' },
  },
  VALID_DAYS: [7, 30, 90],
}));

vi.mock('@/lib/format', () => ({
  pluralize: (value: number, label: string) => `${value} ${label}${value === 1 ? '' : 's'}`,
  formatSource: (source: string, medium?: string) => `${source}/${medium ?? ''}`,
  formatDuration: (value: number) => `${Math.round(value)}s`,
  formatBounce: (value: number) => `${Math.round(value * 100)}%`,
}));

vi.mock('../../../app/components/keyword-rank-table', () => ({
  KeywordRankTable: () => <div>Keyword Rank Table</div>,
}));

vi.mock('../../../app/components/time-range', () => ({
  default: () => <div>Time Range</div>,
}));

vi.mock('../../../app/components/icons', () => ({
  Icons: {
    users: null,
    sessions: null,
    views: null,
    clicks: null,
    impressions: null,
    ctr: null,
    position: null,
    bounce: null,
    duration: null,
  },
}));

vi.mock('../../../app/components/trend-chart', () => ({
  default: () => <div>Trend Chart</div>,
}));

vi.mock('../../../app/components/metric-card', () => ({
  MetricCard: ({
    label,
    current,
    value,
  }: {
    label: string;
    current?: number;
    value?: string;
  }) => <div>{label}:{value ?? current ?? '—'}</div>,
}));

vi.mock('../../../app/components/audit/check-card', () => ({
  CheckCard: ({
    check,
    children,
  }: {
    check: { label: string; status: string };
    children?: ReactNode;
  }) => <div>{check.label}:{check.status}{children}</div>,
  statusDots: {
    pass: 'dot-pass',
    warn: 'dot-warn',
    fail: 'dot-fail',
    error: 'dot-error',
  },
  Recommendation: ({ gap }: { gap: { id: string; title?: string } }) => <div>{gap.title ?? gap.id}</div>,
  MetaChecksTable: () => <div>Meta Checks</div>,
}));

vi.mock('../../../app/components/indexnow-button', () => ({
  IndexNowButton: ({ siteId }: { siteId: string }) => <div>IndexNow:{siteId}</div>,
}));

vi.mock('../../../app/components/sc-table', () => ({
  ScTable: ({ heading, rows }: { heading: string; rows: Array<unknown> }) => <div>{heading}:{rows.length}</div>,
}));

vi.mock('../../../app/components/page-queries-table', () => ({
  PageQueriesTable: mockPageQueriesTable,
}));

import SiteDashboardPage from '../../../app/[site]/page';

function makeCheck(label: string, status: 'pass' | 'warn' | 'fail' | 'error' = 'pass', message = 'ok') {
  return { label, status, message };
}

function makeAudit() {
  return {
    score: { pass: 3, warn: 0, fail: 0, error: 0 },
    robotsTxt: { ...makeCheck('Robots.txt'), raw: null },
    sitemap: makeCheck('Sitemap'),
    scSitemapFreshness: makeCheck('SC Sitemap'),
    indexingCoverage: makeCheck('Indexing'),
    indexNow: makeCheck('IndexNow'),
    urlInspection: [],
    metaTags: [],
    ogImage: makeCheck('OG Image'),
    imageSeo: [],
    redirectChains: [],
    internalLinks: [],
    security: {
      https: makeCheck('HTTPS'),
      hsts: makeCheck('HSTS'),
      favicon: makeCheck('Favicon'),
    },
    ttfb: { ...makeCheck('TTFB'), ms: 250 },
  };
}

function makeAnalytics() {
  return {
    data: {
      current: {
        users: 12,
        sessions: 18,
        views: 30,
        bounceRate: 0.4,
        avgSessionDuration: 75,
      },
      previous: {
        users: 10,
        sessions: 16,
        views: 24,
        bounceRate: 0.45,
        avgSessionDuration: 70,
      },
      topPages: [],
      trafficSources: [],
    },
    error: false,
  };
}

function makeSearchConsoleComparison() {
  return {
    data: {
      current: {
        clicks: 20,
        impressions: 100,
        ctr: 0.2,
        position: 4.2,
      },
      previous: {
        clicks: 18,
        impressions: 90,
        ctr: 0.18,
        position: 4.8,
      },
    },
    error: false,
  };
}

beforeEach(() => {
  vi.clearAllMocks();

  const audit = makeAudit();

  mockGetManagedSite.mockResolvedValue({
    id: 'site-1',
    name: 'Site 1',
    domain: 'site1.test',
    ga4PropertyId: 'properties/123',
    searchConsole: true,
    testPages: [],
  });
  mockGetSCUrl.mockReturnValue('sc-domain:site1.test');
  mockGetCwvAuditSummary.mockResolvedValue(null);
  mockDiscoverPropertyIds.mockResolvedValue([]);
  mockCachedGetAnalytics.mockResolvedValue(makeAnalytics());
  mockCachedGetSearchConsoleDataWithComparison.mockResolvedValue(makeSearchConsoleComparison());
  mockCachedGetSearchConsolePages.mockResolvedValue([]);
  mockCachedGetSearchConsoleQueries.mockResolvedValue([]);
  mockCachedGetSitemapSubmissions.mockResolvedValue([]);
  mockCachedAuditSite.mockResolvedValue(audit);
  mockCreateFailedSiteAuditResult.mockReturnValue(audit);
  mockNormalizeSiteAuditResult.mockImplementation((value: unknown) => value);
  mockAnalyzeSiteGaps.mockReturnValue({
    gaps: [],
    counts: { high: 0, medium: 0, low: 0 },
  });
  mockCreateSiteGapSignals.mockReturnValue({});
  mockGapsBySection.mockReturnValue({});
  mockSummarizeCanonicalChecks.mockReturnValue(makeCheck('Canonical'));
  mockGetScDaily.mockReturnValue([]);
  mockGetGa4Daily.mockReturnValue([]);
  mockGetKeywordDeltas.mockReturnValue([]);
});

describe('SiteDashboardPage', () => {
  it('falls back to 7 days and skips Search Console fetches for disabled sites', async () => {
    mockGetManagedSite.mockResolvedValueOnce({
      id: 'site-1',
      name: 'Site 1',
      domain: 'site1.test',
      ga4PropertyId: 'properties/123',
      searchConsole: false,
      testPages: [],
    });
    mockGetScDaily.mockReturnValueOnce([
      { date: '2026-05-20', clicks: 10, impressions: 100, ctr: 0.1, position: 4 },
    ]);
    mockGetKeywordDeltas.mockReturnValueOnce([
      {
        query: 'stale keyword',
        currentPosition: 9,
        position7d: 3,
        position30d: null,
        delta7d: -6,
        delta30d: null,
        trend: 'down',
      },
    ]);

    const page = await SiteDashboardPage({
      params: Promise.resolve({ site: 'site-1' }),
      searchParams: Promise.resolve({ days: '999' }),
    });

    const html = renderToStaticMarkup(page);

    expect(html).toContain('site1.test');
    expect(html).toContain('Last 7 days');
    expect(mockCachedGetAnalytics).toHaveBeenCalledWith('properties/123', 7);
    expect(mockCachedGetSearchConsoleDataWithComparison).not.toHaveBeenCalled();
    expect(mockCachedGetSearchConsolePages).not.toHaveBeenCalled();
    expect(mockCachedGetSearchConsoleQueries).not.toHaveBeenCalled();
    expect(mockCachedGetSitemapSubmissions).not.toHaveBeenCalled();
    expect(mockGetScDaily).not.toHaveBeenCalled();
    expect(mockGetKeywordDeltas).not.toHaveBeenCalled();
    expect(html).not.toContain('Keyword Rank Table');
    expect(html).toContain('Search Console is disabled for this site in Config');
    expect(html).not.toContain('Top Queries:');
    expect(mockPageQueriesTable).not.toHaveBeenCalled();
    expect(mockCreateSiteGapSignals).toHaveBeenCalledWith({
      ga4TopPages: [],
      scTopPages: undefined,
      days: 7,
    });
  });

  it('renders fallback badges and a failed audit when providers throw', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const failedAudit = {
      ...makeAudit(),
      score: { pass: 0, warn: 0, fail: 1, error: 0 },
    };

    mockDiscoverPropertyIds.mockRejectedValueOnce(new Error('GA4 discovery down'));
    mockCachedAuditSite.mockRejectedValueOnce(new Error('audit down'));
    mockCreateFailedSiteAuditResult.mockReturnValueOnce(failedAudit);
    mockCachedGetSitemapSubmissions.mockRejectedValueOnce(new Error('sitemaps down'));
    mockCachedGetSearchConsoleDataWithComparison.mockRejectedValueOnce(new Error('comparison down'));
    mockCachedGetSearchConsoleQueries.mockRejectedValueOnce(new Error('queries down'));
    mockCachedGetSearchConsolePages.mockRejectedValueOnce(new Error('pages down'));
    mockCachedGetAnalytics.mockRejectedValueOnce(new Error('GA4 data down'));
    mockGetCwvAuditSummary.mockRejectedValueOnce(new Error('CWV down'));

    const page = await SiteDashboardPage({
      params: Promise.resolve({ site: 'site-1' }),
      searchParams: Promise.resolve({ days: '30' }),
    });

    const html = renderToStaticMarkup(page);

    expect(html).toContain('Site 1');
    expect(html).toContain('Site Audit');
    expect(html.match(/data unavailable/g)).toHaveLength(2);
    expect(mockCreateFailedSiteAuditResult).toHaveBeenCalledWith(expect.objectContaining({ id: 'site-1' }));
    expect(consoleError).toHaveBeenCalledWith('[SiteDashboard GA4 discovery]', expect.any(Error));
    expect(consoleError).toHaveBeenCalledWith('[SiteDashboard audit site-1]', expect.any(Error));
    expect(consoleError).toHaveBeenCalledWith('[SiteDashboard Search Console comparison site-1]', expect.any(Error));
    expect(consoleError).toHaveBeenCalledWith('[SiteDashboard GA4 site-1]', expect.any(Error));
    expect(consoleError).toHaveBeenCalledWith('[SiteDashboard CWV site-1]', expect.any(Error));

    consoleError.mockRestore();
  });

  it('throws notFound for unknown site ids', async () => {
    mockGetManagedSite.mockResolvedValueOnce(null);

    await expect(SiteDashboardPage({
      params: Promise.resolve({ site: 'missing' }),
      searchParams: Promise.resolve({ days: '7' }),
    })).rejects.toThrow('notFound');
  });
});
