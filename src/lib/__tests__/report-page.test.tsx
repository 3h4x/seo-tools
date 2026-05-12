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
} = vi.hoisted(() => ({
  mockDiscoverPropertyIds: vi.fn(),
}));

vi.mock('@/lib/ga4', () => ({
  discoverPropertyIds: mockDiscoverPropertyIds,
  cachedGetAnalytics: vi.fn(),
}));

vi.mock('@/lib/search-console', () => ({
  cachedGetSearchConsoleData: vi.fn(),
}));

vi.mock('@/lib/sites', () => ({
  getSCUrl: vi.fn(),
}));

vi.mock('@/lib/format', () => ({
  formatSource: (value: string) => value,
}));

vi.mock('../../../app/components/time-range', () => ({
  default: () => <div>Time Range</div>,
}));

vi.mock('../../../app/components/metric-card', () => ({
  MetricCard: ({ label }: { label: string }) => <div>{label}</div>,
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
  TrafficSourcesChart: () => <div>Traffic Sources</div>,
}));

vi.mock('../../../app/components/daily-traffic-chart', () => ({
  default: () => <div>Daily Traffic</div>,
}));

vi.mock('../../../app/components/sortable-performance-table', () => ({
  SortablePerformanceTable: () => <div>Site Performance</div>,
}));

import ReportPage from '../../../app/report/page';

beforeEach(() => {
  vi.clearAllMocks();
  mockDiscoverPropertyIds.mockResolvedValue([]);
});

describe('Report page', () => {
  it('renders the empty state when no sites are configured', async () => {
    const page = await ReportPage({
      searchParams: Promise.resolve({ days: '7' }),
    });

    const html = renderToStaticMarkup(page);

    expect(html).toContain('Report');
    expect(html).toContain('No sites configured');
    expect(html).toContain('href="/config"');
  });
});
