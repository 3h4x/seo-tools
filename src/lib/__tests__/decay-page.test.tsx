import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactNode } from 'react';

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: { href: string; children: ReactNode }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

const {
  mockDetectAllDecay,
  mockGetManagedSites,
} = vi.hoisted(() => ({
  mockDetectAllDecay: vi.fn(),
  mockGetManagedSites: vi.fn(),
}));

vi.mock('@/lib/decay', () => ({
  detectAllDecay: mockDetectAllDecay,
}));

vi.mock('@/lib/sites', () => ({
  getManagedSites: mockGetManagedSites,
}));

vi.mock('../../../app/components/time-range', () => ({
  default: () => <div>Time Range</div>,
}));

vi.mock('../../../app/components/metric-card', () => ({
  MetricCard: ({ label }: { label: string }) => <div>{label}</div>,
}));

vi.mock('../../../app/components/data-table', () => ({
  DataTable: () => <div>Data Table</div>,
}));

import DecayPage from '../../../app/decay/page';

beforeEach(() => {
  vi.clearAllMocks();
  mockGetManagedSites.mockResolvedValue([]);
  mockDetectAllDecay.mockResolvedValue([]);
});

describe('Decay page', () => {
  it('renders the empty state when no sites are configured', async () => {
    const page = await DecayPage({
      searchParams: Promise.resolve({ period: '7' }),
    });

    const html = renderToStaticMarkup(page);

    expect(html).toContain('Decay');
    expect(html).toContain('No sites configured');
    expect(html).toContain('href="/config"');
  });
});
