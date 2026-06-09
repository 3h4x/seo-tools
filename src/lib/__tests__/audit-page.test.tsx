import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactNode } from 'react';

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: { href: string; children: ReactNode }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

const {
  mockCachedAuditAllSites,
  mockSummarizeCanonicalChecks,
  mockGetManagedSites,
  mockDiscoverPropertyIds,
  mockAnalyzeSiteGaps,
  mockLoadSiteGapSignals,
  mockDetectAllDecay,
  mockFormatRelativeTime,
  mockGetCwvAuditSummary,
  mockMetricCard,
  mockGapsClient,
  mockDataTable,
} = vi.hoisted(() => ({
  mockCachedAuditAllSites: vi.fn(),
  mockSummarizeCanonicalChecks: vi.fn(),
  mockGetManagedSites: vi.fn(),
  mockDiscoverPropertyIds: vi.fn(),
  mockAnalyzeSiteGaps: vi.fn(),
  mockLoadSiteGapSignals: vi.fn(),
  mockDetectAllDecay: vi.fn(),
  mockFormatRelativeTime: vi.fn(),
  mockGetCwvAuditSummary: vi.fn(),
  mockMetricCard: vi.fn(({ label, current }: { label: string; current: number }) => <div>{label}:{current}</div>),
  mockGapsClient: vi.fn(() => <div>Gaps Client</div>),
  mockDataTable: vi.fn(() => <div>Data Table</div>),
}));

vi.mock('@/lib/audit', () => ({
  cachedAuditAllSites: mockCachedAuditAllSites,
}));

vi.mock('@/lib/google-auth', () => ({
  hasGoogleCredentials: () => true,
}));

vi.mock('@/lib/canonical', () => ({
  summarizeCanonicalChecks: mockSummarizeCanonicalChecks,
}));

vi.mock('@/lib/sites', () => ({
  getManagedSites: mockGetManagedSites,
}));

vi.mock('@/lib/ga4', () => ({
  discoverPropertyIdsWithStatus: mockDiscoverPropertyIds,
}));

vi.mock('@/lib/gaps', () => ({
  analyzeSiteGaps: mockAnalyzeSiteGaps,
  loadSiteGapSignals: mockLoadSiteGapSignals,
}));

vi.mock('@/lib/decay', () => ({
  detectAllDecay: mockDetectAllDecay,
}));

vi.mock('@/lib/format', () => ({
  formatRelativeTime: mockFormatRelativeTime,
}));

vi.mock('@/lib/performance-site', () => ({
  getCwvAuditSummary: mockGetCwvAuditSummary,
}));

vi.mock('@/lib/constants', () => ({
  CHART_NEUTRALS: {
    grid: '#262626',
  },
  CWV_RATING_COLORS: {
    good: { text: 'text-emerald-400' },
    'needs-improvement': { text: 'text-amber-400' },
    poor: { text: 'text-red-400' },
  },
  CWV_THRESHOLDS: {
    LCP: { unit: 'ms' },
    INP: { unit: 'ms' },
    CLS: { unit: 'score' },
  },
  STATUS_COLORS: {
    pass: { chart: '#10b981', text: 'text-emerald-400', dot: 'bg-emerald-500' },
    warn: { chart: '#f59e0b', text: 'text-amber-400', dot: 'bg-amber-500' },
    fail: { chart: '#ef4444', text: 'text-red-400', dot: 'bg-red-500' },
    error: { chart: '#737373', text: 'text-neutral-400', dot: 'bg-neutral-500' },
  },
}));

vi.mock('../../../app/components/audit/check-card', () => ({
  statusDots: {
    pass: 'bg-emerald-500',
    warn: 'bg-amber-500',
    fail: 'bg-red-500',
    error: 'bg-red-500',
  },
  accentBorder: {
    pass: 'border-l-emerald-500',
    warn: 'border-l-amber-500',
    fail: 'border-l-red-500',
    error: 'border-l-red-500',
  },
  StatusBadge: ({ label }: { label: string }) => <div>{label}</div>,
}));

vi.mock('../../../app/components/metric-card', () => ({
  MetricCard: mockMetricCard,
}));

vi.mock('../../../app/components/copy-button', () => ({
  CopyButton: () => <button>Copy</button>,
}));

vi.mock('../../../app/components/gaps-client', () => ({
  GapsClient: mockGapsClient,
}));

vi.mock('../../../app/components/data-table', () => ({
  DataTable: mockDataTable,
}));

vi.mock('../../../app/components/time-range', () => ({
  default: () => <div>Time Range</div>,
}));

import AuditPage from '../../../app/audit/page';

function makeCheck(status: 'pass' | 'warn' | 'fail' | 'error' = 'pass') {
  return { status, label: status, message: status };
}

function makeAudit({
  siteId,
  domain,
  pass,
  warn = 0,
  fail = 0,
  error = 0,
  total,
  timestamp = 1_700_000_000_000,
}: {
  siteId: string;
  domain: string;
  pass: number;
  warn?: number;
  fail?: number;
  error?: number;
  total: number;
  timestamp?: number;
}) {
  return {
    siteId,
    domain,
    timestamp,
    robotsTxt: makeCheck(),
    sitemap: makeCheck(),
    scSitemapFreshness: makeCheck(),
    indexingCoverage: { ...makeCheck(), coveragePct: 95 },
    urlInspection: [],
    redirectChains: [],
    metaTags: [],
    ogImage: makeCheck(),
    ttfb: { ...makeCheck(), ms: 432 },
    imageSeo: [],
    internalLinks: [],
    security: { https: makeCheck(), hsts: makeCheck(), favicon: makeCheck() },
    score: { pass, warn, fail, error, total },
    sampledPages: ['/'],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockSummarizeCanonicalChecks.mockReturnValue({ status: 'pass', compactLabel: 'All canonical' });
  mockFormatRelativeTime.mockReturnValue('moments ago');
  mockDiscoverPropertyIds.mockResolvedValue({ sites: [], failed: false });
  mockLoadSiteGapSignals.mockResolvedValue({ days: 7 });
});

describe('Audit page', () => {
  it('falls back to 7 days and renders the no-sites empty state', async () => {
    mockCachedAuditAllSites.mockResolvedValue([]);
    mockGetManagedSites.mockResolvedValue([]);
    mockDetectAllDecay.mockResolvedValue([]);

    const page = await AuditPage({
      searchParams: Promise.resolve({ period: '999' }),
    });

    const html = renderToStaticMarkup(page);

    expect(html).toContain('No sites configured');
    expect(mockDetectAllDecay).toHaveBeenCalledWith(7);
    expect(mockGetCwvAuditSummary).not.toHaveBeenCalled();
    expect(mockGapsClient).not.toHaveBeenCalled();
    expect(mockDataTable).not.toHaveBeenCalled();
  });

  it('reads the first repeated period value and falls back when the value is unknown', async () => {
    mockCachedAuditAllSites.mockResolvedValue([]);
    mockGetManagedSites.mockResolvedValue([]);
    mockDetectAllDecay.mockResolvedValue([]);

    await AuditPage({
      searchParams: Promise.resolve({ period: ['30', '7'] }),
    });
    expect(mockDetectAllDecay).toHaveBeenLastCalledWith(30);

    await AuditPage({
      searchParams: Promise.resolve({ period: ['bogus', '30'] }),
    });
    expect(mockDetectAllDecay).toHaveBeenLastCalledWith(7);
  });

  it('keeps the audit page available when aggregate sources fail', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      mockCachedAuditAllSites.mockRejectedValueOnce(new Error('audit cache unavailable'));
      mockGetManagedSites.mockResolvedValue([
        { id: 'site-a', name: 'Site A', domain: 'a.test', ga4PropertyId: 'site-prop-a', testPages: [] },
      ]);
      mockDetectAllDecay.mockRejectedValueOnce(new Error('decay unavailable'));
      mockDiscoverPropertyIds.mockRejectedValueOnce(new Error('GA4 unavailable'));

      const page = await AuditPage({
        searchParams: Promise.resolve({ period: '30' }),
      });

      const html = renderToStaticMarkup(page);

      expect(html).toContain('No audit data available');
      expect(html).toContain('Live checks · 1 sites');
      expect(html).not.toContain('No sites configured');
      expect(html).toContain('Some data sources are unavailable');
      expect(html).toContain('site audits');
      expect(html).toContain('content decay');
      expect(html).toContain('GA4 discovery');
      expect(mockGetCwvAuditSummary).not.toHaveBeenCalled();
      expect(consoleError).toHaveBeenCalledWith('[AuditPage audits]', expect.any(Error));
      expect(consoleError).toHaveBeenCalledWith('[AuditPage decay]', expect.any(Error));
      expect(consoleError).toHaveBeenCalledWith('[AuditPage GA4 discovery]', expect.any(Error));
    } finally {
      consoleError.mockRestore();
    }
  });

  it('aggregates gaps, decay stats, and CWV summaries for configured sites', async () => {
    const siteADuplicatedScRows = [
      { page: 'https://a.test/pricing', clicks: 28, impressions: 400, ctr: 0.07, position: 4.1 },
      { page: 'https://a.test/pricing/', clicks: 26, impressions: 320, ctr: 0.08125, position: 3.4 },
    ];
    mockCachedAuditAllSites.mockResolvedValue([
      makeAudit({ siteId: 'site-a', domain: 'a.test', pass: 9, total: 10, timestamp: 1_700_000_000_000 }),
      makeAudit({ siteId: 'site-b', domain: 'b.test', pass: 4, fail: 4, total: 8, timestamp: 1_700_000_010_000 }),
    ]);
    mockGetManagedSites.mockResolvedValue([
      { id: 'site-a', name: 'Site A', domain: 'a.test', ga4PropertyId: 'site-prop-a', testPages: [] },
      { id: 'site-b', name: 'Site B', domain: 'b.test', ga4PropertyId: 'site-prop-b', testPages: [] },
    ]);
    mockDiscoverPropertyIds.mockResolvedValue({
      failed: false,
      sites: [
        { id: 'site-a', ga4PropertyId: 'discovered-prop-a' },
        { id: 'site-b', ga4PropertyId: 'discovered-prop-b' },
      ],
    });
    mockLoadSiteGapSignals
      .mockResolvedValueOnce({
        days: 30,
        ga4TopPages: [{ path: '/pricing', views: 1, users: 1, engagementRate: 0.32, avgSessionDuration: 42 }],
        scTopPages: siteADuplicatedScRows,
      })
      .mockResolvedValueOnce({ days: 30, ga4TopPages: [{ path: '/docs', views: 1, users: 1, engagementRate: 0.72, avgSessionDuration: 180 }] });
    mockAnalyzeSiteGaps
      .mockReturnValueOnce({
        gaps: [
          { severity: 'medium', category: 'performance', title: 'Perf gap' },
          { severity: 'high', category: 'social', title: 'Social gap' },
        ],
      })
      .mockReturnValueOnce({
        gaps: [
          { severity: 'high', category: 'content', title: 'Content gap' },
        ],
      });
    mockDetectAllDecay.mockResolvedValue([
      {
        siteId: 'site-a',
        domain: 'a.test',
        decayingPages: [
          {
            siteId: 'site-a',
            domain: 'a.test',
            page: 'https://a.test/posts/alpha',
            currentClicks: 12,
            clicksDelta: -50,
            currentImpressions: 100,
            impressionsDelta: -30,
            currentPosition: 9.4,
            positionDelta: 3,
            severity: 'severe',
          },
        ],
      },
      {
        siteId: 'site-b',
        domain: 'b.test',
        decayingPages: [],
      },
    ]);
    mockGetCwvAuditSummary
      .mockResolvedValueOnce({
        metrics: {
          LCP: { value: 1234, rating: 'good', sampleCount: 10 },
        },
        source: 'rum',
      })
      .mockResolvedValueOnce({
        metrics: {},
        source: 'psi-lab',
      });

    const page = await AuditPage({
      searchParams: Promise.resolve({ period: '30' }),
    });

    const html = renderToStaticMarkup(page);

    expect(mockDetectAllDecay).toHaveBeenCalledWith(30);
    expect(mockLoadSiteGapSignals).toHaveBeenNthCalledWith(1, expect.objectContaining({ id: 'site-a' }), 'discovered-prop-a', 30);
    expect(mockLoadSiteGapSignals).toHaveBeenNthCalledWith(2, expect.objectContaining({ id: 'site-b' }), 'discovered-prop-b', 30);
    expect(mockAnalyzeSiteGaps).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ siteId: 'site-a' }),
      expect.objectContaining({ id: 'site-a' }),
      {
        days: 30,
        ga4TopPages: [{ path: '/pricing', views: 1, users: 1, engagementRate: 0.32, avgSessionDuration: 42 }],
        scTopPages: siteADuplicatedScRows,
      },
    );
    expect(mockGetCwvAuditSummary).toHaveBeenCalledTimes(2);
    expect(mockGetCwvAuditSummary).toHaveBeenNthCalledWith(1, 'site-a');
    expect(mockGetCwvAuditSummary).toHaveBeenNthCalledWith(2, 'site-b');
    expect(mockMetricCard).toHaveBeenCalledWith(expect.objectContaining({ label: 'Decaying Pages', current: 1, accentTone: 'danger' }), undefined);
    expect(mockMetricCard).toHaveBeenCalledWith(expect.objectContaining({ label: 'Severe', current: 1, accentTone: 'warning' }), undefined);
    expect(mockMetricCard).toHaveBeenCalledWith(expect.objectContaining({ label: 'Sites Affected', current: 1, accentTone: 'info' }), undefined);

    const gapsCall = (mockGapsClient.mock.calls as unknown as Array<[{
      allSiteGaps: Array<{ siteId: string; gap: { severity: string; category: string; title: string } }>;
      categories: string[];
      sites: Array<{ id: string }>;
    }]>).at(0);
    expect(gapsCall).toBeDefined();
    expect(gapsCall![0].allSiteGaps.map((entry) => `${entry.gap.severity}:${entry.gap.category}:${entry.gap.title}`)).toEqual([
      'high:content:Content gap',
      'high:social:Social gap',
      'medium:performance:Perf gap',
    ]);
    expect(gapsCall![0].categories).toEqual(['content', 'social', 'performance']);
    expect(gapsCall![0].sites.map((site) => site.id)).toEqual(expect.arrayContaining(['site-a', 'site-b']));
    expect(gapsCall![0].sites).toHaveLength(2);

    const dataTableCall = (mockDataTable.mock.calls as unknown as Array<[{
      rowKeys: string[];
    }]>).at(0);
    expect(dataTableCall).toBeDefined();
    expect(dataTableCall![0].rowKeys).toEqual(['site-a:https://a.test/posts/alpha']);

    expect(html).toContain('Pages losing traffic · 30-day comparison');
    expect(html).toContain('1 recommendation');
    expect(html).toContain('1234ms');
    expect(html).toContain('RUM');
    expect(html).toContain('Checked moments ago');
  });

  it('flags stale audit timestamps after 24 hours', async () => {
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);
    try {
      mockCachedAuditAllSites.mockResolvedValue([
        makeAudit({
          siteId: 'site-a',
          domain: 'a.test',
          pass: 9,
          total: 10,
          timestamp: 1_700_000_000_000 - 25 * 60 * 60 * 1000,
        }),
      ]);
      mockGetManagedSites.mockResolvedValue([
        { id: 'site-a', name: 'Site A', domain: 'a.test', ga4PropertyId: 'site-prop-a', testPages: [] },
      ]);
      mockDetectAllDecay.mockResolvedValue([]);
      mockAnalyzeSiteGaps.mockReturnValue({ gaps: [] });
      mockGetCwvAuditSummary.mockResolvedValue({
        metrics: {},
        source: 'psi-lab',
      });

      const page = await AuditPage({
        searchParams: Promise.resolve({ period: '7' }),
      });

      const html = renderToStaticMarkup(page);

      expect(html).toContain('Stale · Checked moments ago');
      expect(html).toContain('text-amber-400 text-[10px]');
    } finally {
      nowSpy.mockRestore();
    }
  });

  it('keeps rendering when optional per-site audit augmentations fail', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      mockCachedAuditAllSites.mockResolvedValue([
        makeAudit({ siteId: 'site-a', domain: 'a.test', pass: 9, total: 10 }),
        makeAudit({ siteId: 'site-b', domain: 'b.test', pass: 7, warn: 1, total: 8 }),
      ]);
      mockGetManagedSites.mockResolvedValue([
        { id: 'site-a', name: 'Site A', domain: 'a.test', ga4PropertyId: 'site-prop-a', testPages: [] },
        { id: 'site-b', name: 'Site B', domain: 'b.test', ga4PropertyId: 'site-prop-b', testPages: [] },
      ]);
      mockLoadSiteGapSignals
        .mockRejectedValueOnce(new Error('SC pages unavailable'))
        .mockResolvedValueOnce({ days: 7 });
      mockAnalyzeSiteGaps.mockReturnValueOnce({
        gaps: [
          { severity: 'low', category: 'content', title: 'Refresh content' },
        ],
      });
      mockDetectAllDecay.mockResolvedValue([]);
      mockGetCwvAuditSummary
        .mockResolvedValueOnce({
          metrics: {
            LCP: { value: 1410, rating: 'good', sampleCount: 8 },
          },
          source: 'rum',
        })
        .mockRejectedValueOnce(new Error('PSI unavailable'));

      const page = await AuditPage({
        searchParams: Promise.resolve({ period: '7' }),
      });

      const html = renderToStaticMarkup(page);

      expect(mockAnalyzeSiteGaps).toHaveBeenCalledTimes(1);
      expect(mockAnalyzeSiteGaps).toHaveBeenCalledWith(
        expect.objectContaining({ siteId: 'site-b' }),
        expect.objectContaining({ id: 'site-b' }),
        { days: 7 },
      );
      expect(consoleError).toHaveBeenCalledWith('[AuditPage gaps site-a]', expect.any(Error));
      expect(consoleError).toHaveBeenCalledWith('[AuditPage CWV site-b]', expect.any(Error));
      expect(html).toContain('a.test');
      expect(html).toContain('b.test');
      expect(html).toContain('1410ms');
      expect(html).toContain('Core Web Vitals (1 site)');
      expect(html).toContain('gap analysis signals (1 site)');
      expect(mockGapsClient).toHaveBeenCalledWith(
        expect.objectContaining({
          allSiteGaps: [
            expect.objectContaining({
              siteId: 'site-b',
              gap: expect.objectContaining({ title: 'Refresh content' }),
            }),
          ],
        }),
        undefined,
      );
    } finally {
      consoleError.mockRestore();
    }
  });
});
