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

vi.mock('@/lib/google-auth', () => ({
  hasGoogleCredentials: () => true,
}));

const {
  mockGetPerformanceSiteData,
  mockGetPerformanceOverviewRows,
  mockTrendChart,
  mockCwvSetupGuide,
  mockCwvMetricsCards,
} = vi.hoisted(() => ({
  mockGetPerformanceSiteData: vi.fn(),
  mockGetPerformanceOverviewRows: vi.fn(),
  mockTrendChart: vi.fn(({ valueFormat }: { valueFormat?: string }) => <div>Trend Chart:{valueFormat ?? 'default'}</div>),
  mockCwvSetupGuide: vi.fn(({ defaultOpen }: { defaultOpen?: boolean }) => (
    <div>CWV Setup:{defaultOpen ? 'open' : 'closed'}</div>
  )),
  mockCwvMetricsCards: vi.fn(({
    source,
    metrics,
    getFooter,
  }: {
    source?: string;
    metrics?: Record<string, unknown>;
    getFooter?: (name: string) => string;
  }) => (
    <div>
      <div>CWV Metrics:{source ?? 'none'}</div>
      {getFooter && metrics
        ? Object.keys(metrics).map((name) => (
          <div key={name}>{getFooter(name)}</div>
        ))
        : null}
    </div>
  )),
}));

vi.mock('@/lib/performance-site', () => ({
  getPerformanceSiteData: mockGetPerformanceSiteData,
}));

vi.mock('@/lib/performance-overview', () => ({
  getPerformanceOverviewRows: mockGetPerformanceOverviewRows,
}));

vi.mock('../../../app/components/time-range', () => ({
  default: () => <div>Time Range</div>,
}));

vi.mock('../../../app/components/cwv-setup-guide', () => ({
  default: mockCwvSetupGuide,
}));

vi.mock('../../../app/components/cwv-cell', () => ({
  CwvCell: ({ value }: { value?: number }) => <span>{value ?? '—'}</span>,
  formatCwv: (_name: string, value: number) => String(value),
}));

vi.mock('../../../app/components/trend-chart', () => ({
  default: mockTrendChart,
}));

vi.mock('../../../app/components/cwv-metrics-cards', () => ({
  CwvMetricsCards: mockCwvMetricsCards,
}));

import PerfSiteDetail from '../../../app/performance/[site]/page';
import PerformancePage from '../../../app/performance/page';

beforeEach(() => {
  vi.clearAllMocks();
  mockGetPerformanceSiteData.mockResolvedValue({
    site: {
      id: 'borged-io',
      name: 'Borged',
      domain: 'borged.io',
    },
    days: 7,
    propertyId: 'prop-1',
    url: 'https://borged.io',
    source: 'rum',
    heroSource: 'RUM (GA4)',
    hasRum: true,
    propagating: false,
    eventCount: 10,
    needsKey: false,
    overall: {
      LCP: { value: 1200, rating: 'good', sampleCount: 10 },
      INP: { value: 100, rating: 'good', sampleCount: 10 },
    },
    byDevice: { mobile: {}, desktop: {}, tablet: {} },
    slowestPages: [],
    trend: [
      { date: '2026-05-08', metrics: { LCP: { value: 1200, rating: 'good', sampleCount: 2 } } },
      { date: '2026-05-09', metrics: { LCP: { value: 1400, rating: 'good', sampleCount: 2 } } },
    ],
    psi: {
      mobile: {
        url: 'https://borged.io',
        strategy: 'mobile',
        performanceScore: 90,
        field: null,
        lab: {},
        fetchedAt: Date.now(),
      },
      desktop: null,
    },
    failures: [],
  });
  mockGetPerformanceOverviewRows.mockResolvedValue({
    rows: [
      {
        id: 'psi-site',
        name: 'PSI Site',
        domain: 'psi.example.com',
        source: 'psi-field',
        metrics: {
          LCP: { value: 2400, rating: 'good' },
          INP: { value: 180, rating: 'good' },
        },
        perfScore: 82,
        needsKey: false,
        cwvEventCount: 0,
      },
    ],
    failures: [],
  });
});

describe('Performance overview page', () => {
  it('uses PSI fallback metrics in the overall summary cards', async () => {
    const page = await PerformancePage({
      searchParams: Promise.resolve({ days: '7' }),
    });

    const html = renderToStaticMarkup(page);

    expect(html.match(/avg across 1 site/g)).toHaveLength(2);
    expect(html).toContain('<th scope="col" class="px-3 py-2 font-semibold text-left">Site</th>');
    expect(html).toContain('<th scope="row" class="px-3 py-2 font-normal text-left"><div><a href="/performance/psi-site" class="text-white hover:underline">PSI Site</a>');
    expect(html).toContain('<th scope="col" class="px-3 py-2 font-semibold text-right">PSI</th>');
  });

  it('keeps the setup guide closed when no sites are configured', async () => {
    mockGetPerformanceOverviewRows.mockResolvedValueOnce({ rows: [], failures: [] });

    const page = await PerformancePage({
      searchParams: Promise.resolve({ days: '7' }),
    });

    const html = renderToStaticMarkup(page);

    expect(html).toContain('No sites configured');
    expect(html).toContain('href="/config"');
    expect(mockCwvSetupGuide).toHaveBeenCalledWith(
      expect.objectContaining({ defaultOpen: false }),
      undefined,
    );
  });

  it('renders the partial-failure banner when overview reports failures', async () => {
    mockGetPerformanceOverviewRows.mockResolvedValueOnce({
      rows: [],
      failures: ['RUM data (2 sites)', 'PageSpeed Insights (1 site)'],
    });

    const page = await PerformancePage({
      searchParams: Promise.resolve({ days: '7' }),
    });

    const html = renderToStaticMarkup(page);

    expect(html).toContain('Some data sources are unavailable');
    expect(html).toContain('RUM data (2 sites), PageSpeed Insights (1 site)');
  });

  it('uses the first repeated guide searchParam for the setup guide state', async () => {
    const page = await PerformancePage({
      searchParams: Promise.resolve({ days: '7', guide: ['1', '0'] }),
    });

    renderToStaticMarkup(page);

    expect(mockCwvSetupGuide).toHaveBeenCalledWith(
      expect.objectContaining({ defaultOpen: true }),
      undefined,
    );
  });
});

describe('Performance site detail page', () => {
  it('passes a serializable chart formatting mode to TrendChart', async () => {
    const page = await PerfSiteDetail({
      params: Promise.resolve({ site: 'borged-io' }),
      searchParams: Promise.resolve({ days: '7' }),
    });

    const html = renderToStaticMarkup(page);

    expect(html).toContain('Trend Chart:integer');
  });

  it('keeps the RUM detail header focused on RUM data', async () => {
    mockGetPerformanceSiteData.mockResolvedValueOnce({
      site: {
        id: 'borged-io',
        name: 'Borged',
        domain: 'borged.io',
      },
      days: 7,
      propertyId: 'prop-1',
      url: 'https://borged.io',
      source: 'rum',
      heroSource: 'RUM (GA4)',
      hasRum: true,
      propagating: false,
      eventCount: 10,
      needsKey: false,
      overall: {
        LCP: { value: 1200, rating: 'good', sampleCount: 10 },
      },
      byDevice: { mobile: {}, desktop: {}, tablet: {} },
      slowestPages: [],
      trend: [],
      psi: { mobile: null, desktop: null },
      failures: [],
    });

    const html = renderToStaticMarkup(await PerfSiteDetail({
      params: Promise.resolve({ site: 'borged-io' }),
      searchParams: Promise.resolve({ days: '7' }),
    }));

    expect(html).not.toContain('Lighthouse mobile:');
    expect(html).not.toContain('PageSpeed Insights rate-limited');
    expect(html).toContain('Overall (RUM (GA4))');
  });

  it('converts CLS trend values to chart-friendly thousandths', async () => {
    mockGetPerformanceSiteData.mockResolvedValueOnce({
      site: {
        id: 'borged-io',
        name: 'Borged',
        domain: 'borged.io',
      },
      days: 7,
      propertyId: 'prop-1',
      url: 'https://borged.io',
      source: 'rum',
      heroSource: 'RUM (GA4)',
      hasRum: true,
      propagating: false,
      eventCount: 10,
      needsKey: false,
      overall: {
        CLS: { value: 0.12, rating: 'good', sampleCount: 10 },
      },
      byDevice: { mobile: {}, desktop: {}, tablet: {} },
      slowestPages: [],
      trend: [
        { date: '2026-05-08', metrics: { CLS: { value: 0.123, rating: 'needs-improvement', sampleCount: 2 } } },
        { date: '2026-05-09', metrics: { CLS: { value: 0.2, rating: 'poor', sampleCount: 2 } } },
      ],
      psi: { mobile: null, desktop: null },
    });

    renderToStaticMarkup(await PerfSiteDetail({
      params: Promise.resolve({ site: 'borged-io' }),
      searchParams: Promise.resolve({ days: '7' }),
    }));

    expect(mockTrendChart).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [
          { date: '2026-05-08', LCP: null, INP: null, CLS: 123 },
          { date: '2026-05-09', LCP: null, INP: null, CLS: 200 },
        ],
      }),
      undefined,
    );
  });

  it('renders slowest pages with table captions and row headers', async () => {
    mockGetPerformanceSiteData.mockResolvedValueOnce({
      site: {
        id: 'borged-io',
        name: 'Borged',
        domain: 'borged.io',
      },
      days: 7,
      propertyId: 'prop-1',
      url: 'https://borged.io',
      source: 'rum',
      heroSource: 'RUM (GA4)',
      hasRum: true,
      propagating: false,
      eventCount: 10,
      needsKey: false,
      overall: {
        LCP: { value: 1200, rating: 'good', sampleCount: 10 },
      },
      byDevice: { mobile: {}, desktop: {}, tablet: {} },
      slowestPages: [{
        path: '/pricing',
        totalSamples: 8,
        metrics: {
          LCP: { value: 3100, rating: 'needs-improvement', sampleCount: 8 },
        },
      }],
      trend: [],
      psi: { mobile: null, desktop: null },
    });

    const html = renderToStaticMarkup(await PerfSiteDetail({
      params: Promise.resolve({ site: 'borged-io' }),
      searchParams: Promise.resolve({ days: '7' }),
    }));

    expect(html).toContain('<caption class="sr-only">Slowest pages by Core Web Vitals samples</caption>');
    expect(html).toContain('<th scope="row" class="px-3 py-2 font-mono text-xs font-normal text-left text-neutral-300">/pricing</th>');
  });

  it('normalizes invalid days before loading site performance', async () => {
    await PerfSiteDetail({
      params: Promise.resolve({ site: 'borged-io' }),
      searchParams: Promise.resolve({ days: 'abc' }),
    });

    expect(mockGetPerformanceSiteData).toHaveBeenCalledWith('borged-io', 7);
  });

  it('handles repeated days searchParams before loading site performance', async () => {
    await PerfSiteDetail({
      params: Promise.resolve({ site: 'borged-io' }),
      searchParams: Promise.resolve({ days: ['28', '7'] }),
    });

    expect(mockGetPerformanceSiteData).toHaveBeenCalledWith('borged-io', 28);
  });

  it('throws notFound for unknown sites', async () => {
    mockGetPerformanceSiteData.mockResolvedValueOnce(null);

    await expect(PerfSiteDetail({
      params: Promise.resolve({ site: 'missing' }),
      searchParams: Promise.resolve({ days: '7' }),
    })).rejects.toThrow('notFound');
  });

  it('renders the partial-failure banner for degraded site performance data', async () => {
    mockGetPerformanceSiteData.mockResolvedValueOnce({
      site: {
        id: 'borged-io',
        name: 'Borged',
        domain: 'borged.io',
      },
      days: 7,
      propertyId: 'prop-1',
      url: 'https://borged.io',
      source: 'psi-field',
      heroSource: 'CrUX field (mobile)',
      hasRum: false,
      propagating: false,
      eventCount: 0,
      needsKey: false,
      overall: {
        LCP: { value: 2400, rating: 'good', sampleCount: 0 },
      },
      byDevice: null,
      slowestPages: [],
      trend: [],
      psi: {
        mobile: {
          url: 'https://borged.io',
          strategy: 'mobile',
          performanceScore: 90,
          field: {
            LCP: { value: 2400, rating: 'good' },
          },
          lab: {},
          fetchedAt: Date.now(),
        },
        desktop: null,
      },
      failures: ['RUM data', 'PageSpeed Insights desktop'],
    });

    const html = renderToStaticMarkup(await PerfSiteDetail({
      params: Promise.resolve({ site: 'borged-io' }),
      searchParams: Promise.resolve({ days: '7' }),
    }));

    expect(html).toContain('Some data sources are unavailable');
    expect(html).toContain('RUM data, PageSpeed Insights desktop');
  });

  it('renders PSI fallback cards and opens the setup guide when RUM is unavailable', async () => {
    mockGetPerformanceSiteData.mockResolvedValueOnce({
      site: {
        id: 'psi-only',
        name: 'PSI Only',
        domain: 'psi.example.com',
      },
      days: 28,
      propertyId: null,
      url: 'https://psi.example.com',
      source: 'psi-field',
      heroSource: 'CrUX',
      hasRum: false,
      propagating: false,
      eventCount: 0,
      needsKey: false,
      overall: {
        LCP: { value: 2400, rating: 'good', sampleCount: 0 },
      },
      byDevice: { mobile: {}, desktop: {}, tablet: {} },
      slowestPages: [],
      trend: [],
      psi: {
        mobile: {
          url: 'https://psi.example.com',
          strategy: 'mobile',
          performanceScore: 88,
          field: {
            LCP: { value: 2500, rating: 'needs-improvement' },
          },
          lab: {},
          fetchedAt: Date.now(),
        },
        desktop: {
          url: 'https://psi.example.com',
          strategy: 'desktop',
          performanceScore: 96,
          field: null,
          lab: {
            INP: 180,
          },
          fetchedAt: Date.now(),
        },
      },
    });

    const page = await PerfSiteDetail({
      params: Promise.resolve({ site: 'psi-only' }),
      searchParams: Promise.resolve({ days: '28' }),
    });

    const html = renderToStaticMarkup(page);

    expect(html).toContain('Mobile vs Desktop (PSI)');
    expect(html).toContain('Mobile · score 88');
    expect(html).toContain('Desktop · score 96');
    expect(mockCwvMetricsCards).toHaveBeenCalledWith(
      expect.objectContaining({ source: 'CrUX' }),
      undefined,
    );
    expect(mockCwvMetricsCards).toHaveBeenCalledWith(
      expect.objectContaining({ source: 'Lab' }),
      undefined,
    );
    expect(mockCwvSetupGuide).toHaveBeenCalledWith(
      expect.objectContaining({ defaultOpen: true }),
      undefined,
    );
  });

  it('renders an explicit no-data state when RUM and PSI have no metrics', async () => {
    mockGetPerformanceSiteData.mockResolvedValueOnce({
      site: {
        id: 'empty-site',
        name: 'Empty Site',
        domain: 'empty.example.com',
      },
      days: 7,
      propertyId: '',
      url: 'https://empty.example.com',
      source: 'none',
      heroSource: 'no data',
      hasRum: false,
      propagating: false,
      eventCount: 0,
      needsKey: false,
      overall: {},
      byDevice: null,
      slowestPages: [],
      trend: [],
      psi: { mobile: null, desktop: null },
    });

    const html = renderToStaticMarkup(await PerfSiteDetail({
      params: Promise.resolve({ site: 'empty-site' }),
      searchParams: Promise.resolve({ days: '7' }),
    }));

    expect(html).toContain('No data');
    expect(html).toContain('No Core Web Vitals data yet');
    expect(html).toContain('No RUM events were queryable for the last 7 days');
    expect(html).toContain('https://empty.example.com');
    expect(html).toContain('Overall (no data)');
    expect(mockCwvSetupGuide).toHaveBeenCalledWith(
      expect.objectContaining({ defaultOpen: true }),
      undefined,
    );
  });
});
