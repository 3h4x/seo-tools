import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: { href: string; children: ReactNode }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

const { mockLoadActionQueue } = vi.hoisted(() => ({
  mockLoadActionQueue: vi.fn(),
}));

vi.mock('@/lib/actions', () => ({
  loadActionQueue: mockLoadActionQueue,
}));

import ActionsPage from '../../../app/actions/page';

describe('actions page', () => {
  it('renders action priority and kind labels with shared badge styling', async () => {
    mockLoadActionQueue.mockResolvedValue({
      counts: { critical: 1, high: 0, medium: 0, low: 0 },
      items: [
        {
          id: 'site-a-gap',
          kind: 'gap',
          priority: 'critical',
          score: 12,
          siteId: 'site-a',
          siteName: 'Site A',
          siteDomain: 'a.example.com',
          title: 'Add structured data',
          detail: 'JSON-LD is missing.',
          affected: 'Sitewide',
          impactLabel: 'Structural issue',
          href: '/site-a',
        },
      ],
    });

    const html = renderToStaticMarkup(await ActionsPage());

    expect(html).toContain('inline-flex items-center border font-medium');
    expect(html).toContain('uppercase tracking-wider');
    expect(html).toContain('critical');
    expect(html).toContain('gap');
  });

  it('renders the empty state when there are no ranked actions', async () => {
    mockLoadActionQueue.mockResolvedValue({
      counts: { critical: 0, high: 0, medium: 0, low: 0 },
      items: [],
    });

    const html = renderToStaticMarkup(await ActionsPage());

    expect(html).toContain('No ranked actions yet.');
    expect(html).toContain('Add managed sites, snapshots, and audit data');
  });
});
