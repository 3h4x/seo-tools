import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import SitesManager, { formatDiscoverError, formatSiteMutationError } from '../../../app/components/sites-manager';

describe('SitesManager', () => {
  it('labels compact managed-site table controls and status glyphs', () => {
    const html = renderToStaticMarkup(createElement(SitesManager, {
      hasAuth: false,
      initialSites: [
        {
          id: 'site-a',
          name: 'Site A',
          domain: 'a.example.com',
          color: '#22c55e',
          ga4PropertyId: '123',
          searchConsole: true,
          testPages: ['/'],
        },
        {
          id: 'site-b',
          name: 'Site B',
          domain: 'b.example.com',
          searchConsole: false,
          testPages: ['/'],
        },
      ],
    }));

    expect(html).toContain('aria-label="Move Site A up"');
    expect(html).toContain('aria-label="Move Site B down"');
    expect(html).toContain('Search Console enabled');
    expect(html).toContain('Search Console disabled');
    expect(html).toContain('GA4 property configured');
    expect(html).toContain('GA4 property missing');
    expect(html).toContain('aria-hidden="true" class="size-2.5 rounded-full');
  });
});

describe('formatDiscoverError', () => {
  it('maps known snake_case error codes to operator-facing messages', () => {
    expect(formatDiscoverError('search_console_api_failed', 500)).toBe(
      'Search Console API request failed. Check server logs.',
    );
    expect(formatDiscoverError('failed_to_load_existing_sites', 500)).toBe(
      'Could not load existing sites. Check server logs.',
    );
  });

  it('passes through other error strings unchanged', () => {
    expect(formatDiscoverError('No SA key configured', 400)).toBe('No SA key configured');
    expect(formatDiscoverError('Some other error', 502)).toBe('Some other error');
  });

  it('falls back to status when no error string is provided', () => {
    expect(formatDiscoverError(undefined, 503)).toBe('Discovery failed (503)');
    expect(formatDiscoverError('', 500)).toBe('Discovery failed (500)');
    expect(formatDiscoverError('   ', 500)).toBe('Discovery failed (500)');
  });
});

describe('formatSiteMutationError', () => {
  it('maps known managed-site API error codes to operator-facing messages', () => {
    expect(formatSiteMutationError('failed_to_load_sites', 500, 'Save failed')).toBe(
      'Could not load existing sites. Check server logs.',
    );
    expect(formatSiteMutationError('failed_to_save_site', 500, 'Save failed')).toBe(
      'Could not save site. Check server logs.',
    );
    expect(formatSiteMutationError('failed_to_delete_site', 500, 'Delete failed')).toBe(
      'Could not delete site. Check server logs.',
    );
    expect(formatSiteMutationError('failed_to_reorder_sites', 500, 'Failed to reorder sites')).toBe(
      'Could not reorder sites. Check server logs.',
    );
  });

  it('passes through validation errors unchanged', () => {
    expect(formatSiteMutationError('domain is already used by site "other"', 400, 'Save failed')).toBe(
      'domain is already used by site "other"',
    );
  });

  it('falls back to the operation and status when no error string is provided', () => {
    expect(formatSiteMutationError(undefined, 503, 'Save failed')).toBe('Save failed (503)');
    expect(formatSiteMutationError('   ', 500, 'Delete failed')).toBe('Delete failed (500)');
  });
});
