import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { SortablePerformanceTable, type PerformanceRow } from '../../../app/components/sortable-performance-table';

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: { href: string; children: ReactNode }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

const rows: PerformanceRow[] = [
  {
    id: 'site-a',
    name: 'Site A',
    domain: 'a.test',
    users: 25,
    prevUsers: 20,
    sessions: 40,
    views: 60,
    bounceRate: 0.4,
    avgSessionDuration: 120,
    scClicks: 11,
    scPosition: 3.5,
    hasData: true,
  },
  {
    id: 'site-b',
    name: 'Site B',
    domain: 'b.test',
    users: 5,
    prevUsers: 7,
    sessions: 10,
    views: 12,
    bounceRate: 0.6,
    avgSessionDuration: 30,
    scClicks: null,
    scPosition: null,
    hasData: true,
    ga4Error: true,
    scError: true,
  },
];

describe('SortablePerformanceTable', () => {
  it('renders sortable metric headers as keyboard-accessible buttons', () => {
    const html = renderToStaticMarkup(<SortablePerformanceTable rows={rows} />);

    expect(html).toContain('aria-sort="descending"');
    expect(html).toMatch(/<button\b[^>]*type="button"/);
    expect(html).toContain('<th scope="col" class="px-5 py-3.5 font-semibold">Site</th>');
    expect(html).toContain('aria-label="Sort by Users ascending"');
    expect(html).toContain('aria-label="Sort by Sessions descending"');
    expect(html).toContain('<svg aria-hidden="true"');
    expect(html).toContain('title="Sort by SC Position"');
  });

  it('surfaces provider failures on the affected site row', () => {
    const html = renderToStaticMarkup(
      <SortablePerformanceTable
        rows={rows.map((row) => row.id === 'site-b' ? { ...row, users: 0, hasData: false } : row)}
      />
    );

    expect(html).toContain('GA4 error');
    expect(html).toContain('SC error');
    expect(html).toContain('GA4 failed');
    expect(html).toContain('<span class="text-red-400/60 text-xs">error</span>');
  });

  it('keeps site details linked while the domain copy button stays outside the site link', () => {
    const html = renderToStaticMarkup(<SortablePerformanceTable rows={rows} />);
    const siteCell = html.slice(html.indexOf('href="/site-a"'), html.indexOf('href="/site-b"'));
    const linkHtml = siteCell.slice(0, siteCell.indexOf('</a>'));
    const afterLinkHtml = siteCell.slice(siteCell.indexOf('</a>'));

    expect(linkHtml).toContain('Site A');
    expect(linkHtml).toContain('a.test');
    expect(linkHtml).toContain('bg-emerald-500/60');
    expect(linkHtml).not.toContain('<button');
    expect(afterLinkHtml).toContain('title="Copy domain"');
  });
});
