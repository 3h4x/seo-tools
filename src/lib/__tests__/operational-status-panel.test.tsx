import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import OperationalStatusPanel from '../../../app/components/operational-status-panel';

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-05-12T12:00:00Z'));
});

describe('OperationalStatusPanel', () => {
  it('renders fresh, stale, and never states with reason text', () => {
    const html = renderToStaticMarkup(
      <OperationalStatusPanel
        statuses={[
          { key: 'sc-daily', label: 'Daily Search Console', state: 'fresh', timestamp: Date.now() - 5 * 60_000, reason: 'Latest collected date 2026-05-10', details: 'Collector writes are current' },
          { key: 'sitemap-sync', label: 'Sitemap Sync', state: 'stale', timestamp: Date.now() - 10 * 60 * 60_000, reason: '1/3 sites not checked within 8h', details: 'Last submit 12h ago' },
          { key: 'snapshots', label: 'Snapshots', state: 'never', timestamp: null, reason: 'No snapshot history recorded yet' },
        ]}
      />
    );

    expect(html).toContain('Operational Status');
    expect(html).toContain('Cached status');
    expect(html).toContain('Fresh');
    expect(html).toContain('Stale');
    expect(html).toContain('Never');
    expect(html).toContain('Latest collected date 2026-05-10');
    expect(html).toContain('1/3 sites not checked within 8h');
    expect(html).toContain('No snapshot history recorded yet');
    expect(html).toContain('GA4 coverage may fall back to saved property IDs when discovery data is unavailable.');
    expect(html).toContain('Updated 5m ago');
    expect(html).toContain('No timestamp yet');
  });
});
