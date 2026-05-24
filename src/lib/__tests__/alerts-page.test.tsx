import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: { href: string; children: ReactNode }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

const { mockDbGetAlertEvents, mockGetManagedSites } = vi.hoisted(() => ({
  mockDbGetAlertEvents: vi.fn(),
  mockGetManagedSites: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  dbGetAlertEvents: mockDbGetAlertEvents,
}));

vi.mock('@/lib/sites', () => ({
  getManagedSites: mockGetManagedSites,
}));

vi.mock('@/lib/alerts', () => ({
  getAlertMetricLabel: (metric: string) => metric === 'sc_clicks' ? 'SC clicks' : metric,
  formatAlertMetricValue: (_metric: string, value: number) => String(value),
}));

import AlertsPage from '../../../app/alerts/page';

describe('alerts page', () => {
  it('renders the empty state with config guidance', async () => {
    mockDbGetAlertEvents.mockReturnValue([]);
    mockGetManagedSites.mockResolvedValue([]);

    const html = renderToStaticMarkup(await AlertsPage());

    expect(html).toContain('No alerts have fired yet.');
    expect(html).toContain('href="/config"');
  });

  it('falls back to empty state when underlying reads fail', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mockDbGetAlertEvents.mockImplementation(() => {
      throw new Error('sqlite locked');
    });
    mockGetManagedSites.mockRejectedValue(new Error('sites unavailable'));

    const html = renderToStaticMarkup(await AlertsPage());

    expect(html).toContain('No alerts have fired yet.');
    expect(consoleError).toHaveBeenCalledWith('[AlertsPage events]', expect.any(Error));
    expect(consoleError).toHaveBeenCalledWith('[AlertsPage managed sites]', expect.any(Error));

    consoleError.mockRestore();
  });

  it('renders recent alert rows', async () => {
    mockDbGetAlertEvents.mockReturnValue([
      {
        id: 1,
        siteId: 'site-a',
        ruleId: 1,
        metric: 'sc_clicks',
        thresholdPct: 25,
        previousValue: 100,
        currentValue: 60,
        deltaPct: 40,
        snapshotDate: '2026-05-17',
        deliveredChannels: ['email'],
        deliveryError: null,
        createdAt: '2026-05-17 08:30:00',
      },
    ]);
    mockGetManagedSites.mockResolvedValue([
      { id: 'site-a', name: 'Site A', domain: 'a.example.com', testPages: ['/'] },
    ]);

    const html = renderToStaticMarkup(await AlertsPage());

    expect(html).toContain('Site A');
    expect(html).toContain('<th scope="col" class="px-4 py-3 font-medium">Site</th>');
    expect(html).toContain('SC clicks');
    expect(html).toContain('40.0%');
  });
});
