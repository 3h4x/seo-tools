import { describe, expect, it, vi } from 'vitest';

import { loadCliSites, mapCliSiteRow } from '../../../scripts/seo-sites.mjs';

describe('script SEO site loading', () => {
  it('maps DB site rows to CLI site config', () => {
    expect(mapCliSiteRow({
      id: 'site-a',
      domain: 'example.com',
      sc_url: null,
      ga4_property_id: 'properties/123',
      search_console: 0,
      test_pages: '["/","/about"]',
    })).toEqual({
      id: 'site-a',
      domain: 'example.com',
      scUrl: 'sc-domain:example.com',
      ga4: 'properties/123',
      searchConsole: false,
      pages: ['/', '/about'],
    });
  });

  it('keeps Search Console enabled by default for legacy rows', () => {
    expect(mapCliSiteRow({
      id: 'site-a',
      domain: 'example.com',
      sc_url: 'https://example.com/',
      ga4_property_id: null,
      search_console: null,
      test_pages: null,
    })).toMatchObject({
      scUrl: 'https://example.com/',
      searchConsole: true,
      pages: [],
    });
  });

  it('loads sites in the same stable order as the app DB helper', () => {
    const rows = [
      {
        id: 'site-a',
        domain: 'example.com',
        sc_url: null,
        ga4_property_id: null,
        search_console: 1,
        test_pages: '[]',
      },
    ];
    const all = vi.fn(() => rows);
    const prepare = vi.fn(() => ({ all }));

    expect(loadCliSites({ prepare })).toHaveLength(1);
    expect(prepare).toHaveBeenCalledWith(
      'SELECT id, domain, sc_url, ga4_property_id, search_console, test_pages FROM sites ORDER BY sort_order ASC, id ASC',
    );
  });
});
