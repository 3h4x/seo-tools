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
    scClicks: 0,
    scPosition: 0,
    hasData: true,
  },
];

describe('SortablePerformanceTable', () => {
  it('renders sortable metric headers as keyboard-accessible buttons', () => {
    const html = renderToStaticMarkup(<SortablePerformanceTable rows={rows} />);

    expect(html).toContain('aria-sort="descending"');
    expect(html).toMatch(/<button\b[^>]*type="button"/);
    expect(html).toContain('aria-label="Sort by Users ascending"');
    expect(html).toContain('aria-label="Sort by Sessions descending"');
    expect(html).toContain('<svg aria-hidden="true"');
    expect(html).toContain('title="Sort by SC Position"');
  });
});
