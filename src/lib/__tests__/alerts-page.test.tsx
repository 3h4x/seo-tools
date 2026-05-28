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

  it('shows a failure state when alert history cannot load', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mockDbGetAlertEvents.mockImplementation(() => {
      throw new Error('sqlite locked');
    });
    mockGetManagedSites.mockRejectedValue(new Error('sites unavailable'));

    const html = renderToStaticMarkup(await AlertsPage());

    expect(html).toContain("Couldn't load alert history");
    expect(html).toContain('The alert events table failed to read');
    expect(html).not.toContain('No alerts have fired yet.');
    expect(html).toContain('Some data sources are unavailable');
    expect(html).toContain('Alert history');
    expect(html).toContain('Managed sites');
    expect(consoleError).toHaveBeenCalledWith('[AlertsPage events]', expect.any(Error));
    expect(consoleError).toHaveBeenCalledWith('[AlertsPage managed sites]', expect.any(Error));

    consoleError.mockRestore();
  });

  it('keeps alert rows visible when site labels fail to load', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
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
        deliveredChannels: [],
        deliveryError: null,
        createdAt: '2026-05-17 08:30:00',
      },
    ]);
    mockGetManagedSites.mockRejectedValue(new Error('sites unavailable'));

    const html = renderToStaticMarkup(await AlertsPage());

    expect(html).toContain('site-a');
    expect(html).toContain('Some data sources are unavailable');
    expect(html).toContain('Managed sites');
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
        deliveryError: 'email: delivery failed',
        createdAt: '2026-05-17 08:30:00',
      },
    ]);
    mockGetManagedSites.mockResolvedValue([
      { id: 'site-a', name: 'Site A', domain: 'a.example.com', testPages: ['/'] },
    ]);

    const html = renderToStaticMarkup(await AlertsPage());

    expect(html).toContain('Site A');
    expect(html).toContain('<th scope="col" class="px-4 py-3 font-medium text-left">Site</th>');
    expect(html).toContain('SC clicks');
    expect(html).toContain('40.0%');
    expect(html).toContain('email: delivery failed');
    expect(html).toContain('border-amber-500/30 bg-amber-500/10 text-amber-300');
    expect(html).not.toContain('<span>email<div');
  });
});
