import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactNode } from 'react';

const {
  mockGetManagedSites,
  mockGetSCUrl,
  mockCachedGetKeywordOpportunities,
  mockDataTable,
  mockTimeRange,
} = vi.hoisted(() => ({
  mockGetManagedSites: vi.fn(),
  mockGetSCUrl: vi.fn(),
  mockCachedGetKeywordOpportunities: vi.fn(),
  mockDataTable: vi.fn(({ rows }: { rows: ReactNode[][] }) => (
    <div>{rows.map((row) => row.map((cell) => cell).join('')).join('|')}</div>
  )),
  mockTimeRange: vi.fn(() => <div>Time Range</div>),
}));

vi.mock('@/lib/sites', () => ({
  getManagedSites: mockGetManagedSites,
  getSCUrl: mockGetSCUrl,
}));

vi.mock('@/lib/opportunities', async () => {
  const actual = await vi.importActual<typeof import('../opportunities')>('../opportunities');
  return {
    ...actual,
    cachedGetKeywordOpportunities: mockCachedGetKeywordOpportunities,
  };
});

vi.mock('../../../app/components/data-table', () => ({
  DataTable: mockDataTable,
}));

vi.mock('../../../app/components/time-range', () => ({
  default: mockTimeRange,
}));

import OpportunitiesPage from '../../../app/opportunities/page';

const opportunity = {
  query: 'seo dashboard',
  page: 'https://example.com/seo',
  position: 8.2,
  impressions: 1000,
  actualCtr: 0.03,
  expectedCtr: 0.11,
  ctrGap: 0.08,
  estimatedClicks: 80,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockGetManagedSites.mockResolvedValue([
    { id: 'site-a', name: 'Site A', domain: 'a.test', searchConsole: true, testPages: ['/'] },
    { id: 'site-b', name: 'Site B', domain: 'b.test', searchConsole: false, testPages: ['/'] },
  ]);
  mockGetSCUrl.mockImplementation((site: { domain: string }) => `sc-domain:${site.domain}`);
  mockCachedGetKeywordOpportunities.mockResolvedValue([opportunity]);
});

describe('Opportunities page', () => {
  it('uses a selectable 28-day default for invalid searchParams', async () => {
    const page = await OpportunitiesPage({
      searchParams: Promise.resolve({ days: '365' }),
    });
    renderToStaticMarkup(page);

    expect(mockCachedGetKeywordOpportunities).toHaveBeenCalledWith('sc-domain:a.test', 'site-a', 28);
    expect(mockCachedGetKeywordOpportunities).toHaveBeenCalledTimes(1);
    expect(mockTimeRange).toHaveBeenCalledWith({
      options: [
        { value: '7', label: '7d' },
        { value: '28', label: '28d' },
        { value: '90', label: '90d' },
      ],
      defaultValue: '28',
    }, undefined);
  });

  it('accepts supported opportunities ranges', async () => {
    const page = await OpportunitiesPage({
      searchParams: Promise.resolve({ days: '90' }),
    });
    renderToStaticMarkup(page);

    expect(mockCachedGetKeywordOpportunities).toHaveBeenCalledWith('sc-domain:a.test', 'site-a', 90);
  });

  it('keeps rendering other site opportunities when one provider call fails', async () => {
    mockGetManagedSites.mockResolvedValue([
      { id: 'site-a', name: 'Site A', domain: 'a.test', searchConsole: true, testPages: ['/'] },
      { id: 'site-b', name: 'Site B', domain: 'b.test', searchConsole: true, testPages: ['/'] },
    ]);
    mockCachedGetKeywordOpportunities
      .mockResolvedValueOnce([opportunity])
      .mockRejectedValueOnce(new Error('Search Console timeout'));

    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    const page = await OpportunitiesPage({
      searchParams: Promise.resolve({ days: '28' }),
    });
    const html = renderToStaticMarkup(page);

    expect(mockDataTable).toHaveBeenCalledWith(
      expect.objectContaining({
        rows: expect.arrayContaining([
          expect.arrayContaining([
            expect.objectContaining({ props: expect.objectContaining({ children: 'seo dashboard' }) }),
          ]),
        ]),
      }),
      undefined,
    );
    expect(consoleError).toHaveBeenCalledWith(
      '[OpportunitiesPage keyword opportunities site-b]',
      expect.any(Error),
    );
    expect(html).toContain('Some data sources are unavailable');
    expect(html).toContain('b.test keyword opportunities');

    consoleError.mockRestore();
  });

  it('shows a partial failure banner when managed sites cannot load', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockGetManagedSites.mockRejectedValue(new Error('sqlite locked'));

    const html = renderToStaticMarkup(await OpportunitiesPage({
      searchParams: Promise.resolve({ days: '28' }),
    }));

    expect(html).toContain('Some data sources are unavailable');
    expect(html).toContain('Managed sites');
    expect(html).toContain("Couldn't load managed sites");
    expect(html).toContain('The sites table failed to read. Check the server logs and use Refresh to retry.');
    expect(html).toContain('border border-red-950 bg-neutral-900 text-neutral-300 p-8 border-l-4 border-l-red-500 rounded-lg text-neutral-500');
    expect(html).not.toContain('Enable Search Console for at least one managed site in Config to populate keyword opportunities.');
    expect(consoleError).toHaveBeenCalledWith(
      '[OpportunitiesPage managed sites]',
      expect.any(Error),
    );

    consoleError.mockRestore();
  });

  it('fetches only the selected Search Console site', async () => {
    mockGetManagedSites.mockResolvedValue([
      { id: 'site-a', name: 'Site A', domain: 'a.test', searchConsole: true, testPages: ['/'] },
      { id: 'site-b', name: 'Site B', domain: 'b.test', searchConsole: true, testPages: ['/'] },
    ]);

    const page = await OpportunitiesPage({
      searchParams: Promise.resolve({ days: '28', site: 'b.test' }),
    });
    const html = renderToStaticMarkup(page);

    expect(mockCachedGetKeywordOpportunities).toHaveBeenCalledTimes(1);
    expect(mockCachedGetKeywordOpportunities).toHaveBeenCalledWith('sc-domain:b.test', 'site-b', 28);
    expect(html).toContain('Showing 1 of 1 opportunities for b.test');
    expect(html).toContain('aria-label="Filter opportunities by site"');
    expect(html).toContain('<a href="/opportunities?days=28&amp;site=b.test" aria-current="page"');
  });

  it('handles repeated days and site searchParams without widening the fetch', async () => {
    mockGetManagedSites.mockResolvedValue([
      { id: 'site-a', name: 'Site A', domain: 'a.test', searchConsole: true, testPages: ['/'] },
      { id: 'site-b', name: 'Site B', domain: 'b.test', searchConsole: true, testPages: ['/'] },
    ]);

    const page = await OpportunitiesPage({
      searchParams: Promise.resolve({ days: ['90', '28'], site: ['b.test', 'a.test'] }),
    });
    const html = renderToStaticMarkup(page);

    expect(mockCachedGetKeywordOpportunities).toHaveBeenCalledTimes(1);
    expect(mockCachedGetKeywordOpportunities).toHaveBeenCalledWith('sc-domain:b.test', 'site-b', 90);
    expect(html).toContain('Showing 1 of 1 opportunities for b.test');
  });

  it('falls back to all sites for an unknown site filter', async () => {
    mockGetManagedSites.mockResolvedValue([
      { id: 'site-a', name: 'Site A', domain: 'a.test', searchConsole: true, testPages: ['/'] },
      { id: 'site-b', name: 'Site B', domain: 'b.test', searchConsole: true, testPages: ['/'] },
    ]);

    const page = await OpportunitiesPage({
      searchParams: Promise.resolve({ days: '28', site: 'missing.test' }),
    });
    const html = renderToStaticMarkup(page);

    expect(mockCachedGetKeywordOpportunities).toHaveBeenCalledTimes(2);
    expect(mockCachedGetKeywordOpportunities).toHaveBeenCalledWith('sc-domain:a.test', 'site-a', 28);
    expect(mockCachedGetKeywordOpportunities).toHaveBeenCalledWith('sc-domain:b.test', 'site-b', 28);
    expect(html).toContain('Showing 2 of 2 opportunities across all sites');
    expect(html).toContain('<a href="/opportunities?days=28" aria-current="page"');
  });

  it('shows a config-focused empty state when no sites have Search Console enabled', async () => {
    mockGetManagedSites.mockResolvedValue([
      { id: 'site-a', name: 'Site A', domain: 'a.test', searchConsole: false, testPages: ['/'] },
      { id: 'site-b', name: 'Site B', domain: 'b.test', searchConsole: false, testPages: ['/'] },
    ]);

    const page = await OpportunitiesPage({
      searchParams: Promise.resolve({ days: '28' }),
    });
    const html = renderToStaticMarkup(page);

    expect(mockCachedGetKeywordOpportunities).not.toHaveBeenCalled();
    expect(html).toContain('Enable Search Console for at least one managed site in Config to populate keyword opportunities.');
    expect(html).toContain('border border-neutral-800 bg-neutral-900/60 text-neutral-300 p-8 rounded-lg text-center text-neutral-500');
    expect(html).not.toContain('Try a longer date range.');
  });
});
