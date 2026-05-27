import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactNode } from 'react';

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: { href: string; children: ReactNode }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

const {
  mockDiscoverPropertyIds,
  mockCachedGetAnalytics,
  mockCachedGetSearchConsoleData,
  mockGetSCUrl,
  mockFormatSource,
  mockTimeRange,
  mockMetricCard,
  mockTrafficSourcesChart,
  mockDailyTrafficChart,
  mockSortablePerformanceTable,
} = vi.hoisted(() => ({
  mockDiscoverPropertyIds: vi.fn(),
  mockCachedGetAnalytics: vi.fn(),
  mockCachedGetSearchConsoleData: vi.fn(),
  mockGetSCUrl: vi.fn(),
  mockFormatSource: vi.fn((source: string, medium?: string) => `${source}/${medium ?? ''}`),
  mockTimeRange: vi.fn(() => <div>Time Range</div>),
  mockMetricCard: vi.fn(({ label, current }: { label: string; current: number }) => <div>{label}:{current}</div>),
  mockTrafficSourcesChart: vi.fn(() => <div>Traffic Sources Chart</div>),
  mockDailyTrafficChart: vi.fn(() => <div>Daily Traffic Chart</div>),
  mockSortablePerformanceTable: vi.fn(() => <div>Performance Table</div>),
}));

vi.mock('@/lib/ga4', () => ({
  discoverPropertyIds: mockDiscoverPropertyIds,
  cachedGetAnalytics: mockCachedGetAnalytics,
}));

vi.mock('@/lib/search-console', () => ({
  cachedGetSearchConsoleData: mockCachedGetSearchConsoleData,
}));

vi.mock('@/lib/sites', () => ({
  getSCUrl: mockGetSCUrl,
}));

vi.mock('@/lib/format', () => ({
  formatSource: mockFormatSource,
}));

vi.mock('@/lib/constants', () => ({
  VALID_DAYS: [7, 30, 90],
}));

vi.mock('../../../app/components/time-range', () => ({
  default: mockTimeRange,
}));

vi.mock('../../../app/components/metric-card', () => ({
  MetricCard: mockMetricCard,
}));

vi.mock('../../../app/components/icons', () => ({
  Icons: {
    users: null,
    sessions: null,
    views: null,
    clicks: null,
    impressions: null,
  },
}));

vi.mock('../../../app/components/overview-charts', () => ({
  TrafficSourcesChart: mockTrafficSourcesChart,
}));

vi.mock('../../../app/components/daily-traffic-chart', () => ({
  default: mockDailyTrafficChart,
}));

vi.mock('../../../app/components/sortable-performance-table', () => ({
  SortablePerformanceTable: mockSortablePerformanceTable,
}));

import Overview from '../../../app/page';

function makeAnalytics(overrides: Partial<{
  current: { users: number; sessions: number; views: number; bounceRate: number; avgSessionDuration: number };
  previous: { users: number; sessions: number; views: number };
  trafficSources: Array<{ source: string; medium?: string; sessions: number }>;
}> = {}) {
  return {
    data: {
      current: {
        users: 0,
        sessions: 0,
        views: 0,
        bounceRate: 0,
        avgSessionDuration: 0,
      },
      previous: {
        users: 0,
        sessions: 0,
        views: 0,
      },
      topPages: [],
      trafficSources: [],
      ...overrides,
    },
    error: false,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetSCUrl.mockImplementation((site: { domain: string }) => `sc-domain:${site.domain}`);
  mockDiscoverPropertyIds.mockResolvedValue([
    {
      id: 'site-a',
      name: 'Site A',
      domain: 'a.test',
      ga4PropertyId: 'properties/111',
      searchConsole: true,
    },
    {
      id: 'site-b',
      name: 'Site B',
      domain: 'b.test',
      ga4PropertyId: 'properties/222',
      searchConsole: false,
    },
  ]);
  mockCachedGetAnalytics
    .mockResolvedValueOnce(makeAnalytics({
      current: { users: 25, sessions: 40, views: 60, bounceRate: 0.4, avgSessionDuration: 120 },
      previous: { users: 20, sessions: 30, views: 50 },
      trafficSources: [
        { source: 'google', medium: 'organic', sessions: 12 },
        { source: 'direct', medium: '(none)', sessions: 8 },
      ],
    }))
    .mockResolvedValueOnce(makeAnalytics({
      current: { users: 5, sessions: 10, views: 12, bounceRate: 0.6, avgSessionDuration: 30 },
      previous: { users: 7, sessions: 9, views: 10 },
      trafficSources: [
        { source: 'google', medium: 'organic', sessions: 3 },
        { source: 'newsletter', medium: 'email', sessions: 4 },
      ],
    }));
  mockCachedGetSearchConsoleData.mockResolvedValue({
    data: { clicks: 11, impressions: 101, position: 3.5 },
    error: false,
  });
});

describe('Overview page', () => {
  it('falls back to 7 days for invalid searchParams and skips SC fetches for disabled sites', async () => {
    const page = await Overview({
      searchParams: Promise.resolve({ days: '999' }),
    });

    const html = renderToStaticMarkup(page);

    expect(html).toContain('Last 7 days');
    expect(mockCachedGetAnalytics).toHaveBeenNthCalledWith(1, 'properties/111', 7);
    expect(mockCachedGetAnalytics).toHaveBeenNthCalledWith(2, 'properties/222', 7);
    expect(mockCachedGetSearchConsoleData).toHaveBeenCalledTimes(1);
    expect(mockCachedGetSearchConsoleData).toHaveBeenCalledWith('sc-domain:a.test', 7);
    expect(mockGetSCUrl).toHaveBeenCalledTimes(1);
    expect(mockDailyTrafficChart).toHaveBeenCalledWith({ days: 7 }, undefined);
  });

  it('handles repeated days searchParams without crashing', async () => {
    const page = await Overview({
      searchParams: Promise.resolve({ days: ['30', '90'] }),
    });

    const html = renderToStaticMarkup(page);

    expect(html).toContain('Last 30 days');
    expect(mockCachedGetAnalytics).toHaveBeenNthCalledWith(1, 'properties/111', 30);
    expect(mockCachedGetAnalytics).toHaveBeenNthCalledWith(2, 'properties/222', 30);
    expect(mockCachedGetSearchConsoleData).toHaveBeenCalledWith('sc-domain:a.test', 30);
    expect(mockDailyTrafficChart).toHaveBeenCalledWith({ days: 30 }, undefined);
  });

  it('builds sorted performance rows with SC nulls for disabled sites', async () => {
    const page = await Overview({
      searchParams: Promise.resolve({ days: '30' }),
    });
    renderToStaticMarkup(page);

    expect(mockSortablePerformanceTable).toHaveBeenCalledTimes(1);
    const firstCall = (mockSortablePerformanceTable.mock.calls as unknown as Array<[{
      rows: Array<Record<string, unknown>>;
    }]>).at(0);
    expect(firstCall).toBeDefined();
    const rows = firstCall![0].rows;

    expect(rows).toEqual([
      expect.objectContaining({
        id: 'site-a',
        users: 25,
        prevUsers: 20,
        scClicks: 11,
        scPosition: 3.5,
        hasData: true,
        ga4Error: false,
        scError: false,
      }),
      expect.objectContaining({
        id: 'site-b',
        users: 5,
        prevUsers: 7,
        scClicks: 0,
        scPosition: 0,
        hasData: true,
        ga4Error: false,
        scError: false,
      }),
    ]);
  });

  it('keeps rendering other sites when a per-site provider throws', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mockCachedGetAnalytics.mockReset();
    mockCachedGetSearchConsoleData.mockReset();
    mockCachedGetAnalytics
      .mockResolvedValueOnce(makeAnalytics({
        current: { users: 10, sessions: 12, views: 18, bounceRate: 0.3, avgSessionDuration: 90 },
        previous: { users: 8, sessions: 11, views: 16 },
      }))
      .mockRejectedValueOnce(new Error('GA4 timeout'));
    mockCachedGetSearchConsoleData.mockRejectedValueOnce(new Error('SC timeout'));

    const page = await Overview({
      searchParams: Promise.resolve({ days: '7' }),
    });
    const html = renderToStaticMarkup(page);

    expect(html).toContain('Last 7 days');
    expect(consoleError).toHaveBeenCalledWith('[OverviewPage] Search Console site-a:', expect.any(Error));
    expect(consoleError).toHaveBeenCalledWith('[OverviewPage] GA4 site-b:', expect.any(Error));

    const firstCall = (mockSortablePerformanceTable.mock.calls as unknown as Array<[{
      rows: Array<Record<string, unknown>>;
    }]>).at(0);
    expect(firstCall).toBeDefined();
    expect(firstCall![0].rows).toEqual([
      expect.objectContaining({
        id: 'site-a',
        users: 10,
        scClicks: null,
        scPosition: null,
        hasData: true,
        ga4Error: false,
        scError: true,
      }),
      expect.objectContaining({
        id: 'site-b',
        users: 0,
        scClicks: 0,
        scPosition: 0,
        hasData: false,
        ga4Error: true,
        scError: false,
      }),
    ]);

    consoleError.mockRestore();
  });

  it('renders an empty overview when site discovery throws', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mockDiscoverPropertyIds.mockReset();
    mockDiscoverPropertyIds.mockRejectedValueOnce(new Error('db unavailable'));

    const page = await Overview({
      searchParams: Promise.resolve({ days: '7' }),
    });
    const html = renderToStaticMarkup(page);

    expect(html).toContain('0 sites');
    expect(html).toContain('Some data sources are unavailable');
    expect(html).toContain('site discovery');
    expect(consoleError).toHaveBeenCalledWith(
      '[OverviewPage discoverPropertyIds]',
      expect.any(Error),
    );
    expect(mockCachedGetAnalytics).not.toHaveBeenCalled();
    expect(mockCachedGetSearchConsoleData).not.toHaveBeenCalled();

    consoleError.mockRestore();
  });

  it('aggregates traffic sources across sites before rendering the chart', async () => {
    const page = await Overview({
      searchParams: Promise.resolve({ days: '30' }),
    });
    renderToStaticMarkup(page);

    expect(mockTrafficSourcesChart).toHaveBeenCalledTimes(1);
    expect(mockTrafficSourcesChart).toHaveBeenCalledWith({
      data: [
        { name: 'google/organic', sessions: 15 },
        { name: 'direct/(none)', sessions: 8 },
        { name: 'newsletter/email', sessions: 4 },
      ],
    }, undefined);
    expect(mockFormatSource).toHaveBeenCalledWith('google', 'organic');
    expect(mockFormatSource).toHaveBeenCalledWith('newsletter', 'email');
  });
});
