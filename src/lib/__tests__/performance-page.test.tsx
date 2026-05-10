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
  mockDiscoverPropertyIds,
  mockCachedGetRumCoreWebVitals,
  mockCachedGetRumCwvByPage,
  mockCachedGetRumCwvTrend,
  mockCachedGetCwvEventCount,
  mockCachedGetPagespeed,
} = vi.hoisted(() => ({
  mockGetManagedSite: vi.fn(),
  mockDiscoverPropertyIds: vi.fn(),
  mockCachedGetRumCoreWebVitals: vi.fn(),
  mockCachedGetRumCwvByPage: vi.fn(),
  mockCachedGetRumCwvTrend: vi.fn(),
  mockCachedGetCwvEventCount: vi.fn(),
  mockCachedGetPagespeed: vi.fn(),
}));

vi.mock('@/lib/sites', () => ({
  getManagedSite: mockGetManagedSite,
}));

vi.mock('@/lib/ga4', () => ({
  discoverPropertyIds: mockDiscoverPropertyIds,
}));

vi.mock('@/lib/performance', () => ({
  cachedGetRumCoreWebVitals: mockCachedGetRumCoreWebVitals,
  cachedGetRumCwvByPage: mockCachedGetRumCwvByPage,
  cachedGetRumCwvTrend: mockCachedGetRumCwvTrend,
  cachedGetCwvEventCount: mockCachedGetCwvEventCount,
}));

vi.mock('@/lib/pagespeed', () => ({
  cachedGetPagespeed: mockCachedGetPagespeed,
}));

vi.mock('../../../app/components/time-range', () => ({
  default: () => <div>Time Range</div>,
}));

vi.mock('../../../app/components/cwv-setup-guide', () => ({
  default: () => <div>CWV Setup</div>,
}));

vi.mock('../../../app/components/cwv-cell', () => ({
  CwvCell: ({ value }: { value?: number }) => <span>{value ?? '—'}</span>,
  formatCwv: (_name: string, value: number) => String(value),
}));

vi.mock('../../../app/components/trend-chart', () => ({
  default: ({ valueFormat }: { valueFormat?: string }) => <div>Trend Chart:{valueFormat ?? 'default'}</div>,
}));

import PerfSiteDetail from '../../../app/performance/[site]/page';

const site = {
  id: 'borged-io',
  name: 'Borged',
  domain: 'borged.io',
  ga4PropertyId: 'prop-1',
  testPages: [],
  skipChecks: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  mockGetManagedSite.mockResolvedValue(site);
  mockDiscoverPropertyIds.mockResolvedValue([{ ...site, ga4PropertyId: 'prop-1' }]);
  mockCachedGetRumCoreWebVitals.mockResolvedValue({
    hasData: true,
    overall: {
      LCP: { value: 1200, rating: 'good', sampleCount: 10 },
      INP: { value: 100, rating: 'good', sampleCount: 10 },
    },
    byDevice: { mobile: {}, desktop: {}, tablet: {} },
  });
  mockCachedGetRumCwvByPage.mockResolvedValue([]);
  mockCachedGetRumCwvTrend.mockResolvedValue([
    { date: '20260508', metrics: { LCP: { value: 1200, rating: 'good', sampleCount: 2 } } },
    { date: '20260509', metrics: { LCP: { value: 1400, rating: 'good', sampleCount: 2 } } },
  ]);
  mockCachedGetCwvEventCount.mockResolvedValue(10);
  mockCachedGetPagespeed.mockResolvedValue({
    url: 'https://borged.io',
    strategy: 'mobile',
    performanceScore: 90,
    field: null,
    lab: {},
    fetchedAt: Date.now(),
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

  it('throws notFound for unknown sites', async () => {
    mockGetManagedSite.mockResolvedValueOnce(null);

    await expect(PerfSiteDetail({
      params: Promise.resolve({ site: 'missing' }),
      searchParams: Promise.resolve({ days: '7' }),
    })).rejects.toThrow('notFound');
  });
});
