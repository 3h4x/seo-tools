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
  mockGetPerformanceSiteData,
  mockGetPerformanceOverviewRows,
} = vi.hoisted(() => ({
  mockGetPerformanceSiteData: vi.fn(),
  mockGetPerformanceOverviewRows: vi.fn(),
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
  });
  mockGetPerformanceOverviewRows.mockResolvedValue([
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
  ]);
});

describe('Performance overview page', () => {
  it('uses PSI fallback metrics in the overall summary cards', async () => {
    const page = await PerformancePage({
      searchParams: Promise.resolve({ days: '7' }),
    });

    const html = renderToStaticMarkup(page);

    expect(html.match(/avg across 1 site/g)).toHaveLength(2);
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

  it('normalizes invalid days before loading site performance', async () => {
    await PerfSiteDetail({
      params: Promise.resolve({ site: 'borged-io' }),
      searchParams: Promise.resolve({ days: 'abc' }),
    });

    expect(mockGetPerformanceSiteData).toHaveBeenCalledWith('borged-io', 7);
  });

  it('throws notFound for unknown sites', async () => {
    mockGetPerformanceSiteData.mockResolvedValueOnce(null);

    await expect(PerfSiteDetail({
      params: Promise.resolve({ site: 'missing' }),
      searchParams: Promise.resolve({ days: '7' }),
    })).rejects.toThrow('notFound');
  });
});
