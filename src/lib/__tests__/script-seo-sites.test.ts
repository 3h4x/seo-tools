import { describe, expect, it, vi } from 'vitest';

import { loadCliSites, mapCliSiteRow } from '../../../scripts/seo-sites.mjs';
import { ensureSitesSearchConsoleColumn, SEARCH_CONSOLE_MIGRATION_SQL } from '../../../scripts/site-schema.mjs';

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
    const exec = vi.fn();

    expect(loadCliSites({ prepare, exec })).toHaveLength(1);
    expect(exec).toHaveBeenCalledWith(SEARCH_CONSOLE_MIGRATION_SQL);
    expect(prepare).toHaveBeenCalledWith(
      'SELECT id, domain, sc_url, ga4_property_id, search_console, test_pages FROM sites ORDER BY sort_order ASC, id ASC',
    );
  });

  it('still loads sites when the compatibility migration is already applied', () => {
    const rows = [{
      id: 'site-a',
      domain: 'example.com',
      sc_url: null,
      ga4_property_id: null,
      search_console: 1,
      test_pages: '[]',
    }];
    const all = vi.fn(() => rows);
    const prepare = vi.fn(() => ({ all }));
    const exec = vi.fn(() => {
      throw new Error('duplicate column name: search_console');
    });

    expect(loadCliSites({ prepare, exec })).toEqual([
      expect.objectContaining({ id: 'site-a', searchConsole: true }),
    ]);
  });

  it('swallows duplicate-column errors while applying script compatibility migration', () => {
    const exec = vi.fn(() => {
      throw new Error('duplicate column name: search_console');
    });

    expect(() => ensureSitesSearchConsoleColumn({ exec })).not.toThrow();
    expect(exec).toHaveBeenCalledWith(SEARCH_CONSOLE_MIGRATION_SQL);
  });
});
