import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../db', () => ({
  clearCacheEntry: vi.fn(),
  clearCacheEntriesByPrefix: vi.fn(),
  clearSitemapSyncState: vi.fn(),
}));

import { clearCacheEntry, clearCacheEntriesByPrefix, clearSitemapSyncState } from '../db';
import { invalidateManagedSiteCache } from '../site-cache';
import type { Site } from '../sites';

function makeSite(overrides: Partial<Site> = {}): Site {
  return {
    id: 'site1',
    name: 'Site 1',
    domain: 'example.com',
    testPages: ['/'],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('invalidateManagedSiteCache', () => {
  it('clears all cache families for a new managed site identity', () => {
    const site = makeSite({ ga4PropertyId: '1234' });

    invalidateManagedSiteCache(null, site);

    expect(clearCacheEntry).toHaveBeenCalledWith('audit', 'site1');
    expect(clearSitemapSyncState).toHaveBeenCalledWith('site1');
    expect(clearCacheEntry).toHaveBeenCalledWith('sitemap-submissions', 'sc-domain:example.com');
    expect(clearCacheEntriesByPrefix).toHaveBeenCalledWith('sc-comparison-', 'sc-domain:example.com');
    expect(clearCacheEntriesByPrefix).toHaveBeenCalledWith('sc-data-', 'sc-domain:example.com');
    expect(clearCacheEntriesByPrefix).toHaveBeenCalledWith('sc-queries-', 'sc-domain:example.com');
    expect(clearCacheEntriesByPrefix).toHaveBeenCalledWith('sc-pages-', 'sc-domain:example.com');
    expect(clearCacheEntriesByPrefix).toHaveBeenCalledWith('ga4-', '1234');
    expect(clearCacheEntriesByPrefix).toHaveBeenCalledWith('rum-cwv-', '1234');
  });

  it('clears Search Console and GA4 caches for previous and next identities when updating', () => {
    const previous = makeSite({
      domain: 'old.example.com',
      scUrl: 'sc-domain:old.example.com',
      ga4PropertyId: '1234',
    });
    const next = makeSite({
      domain: 'new.example.com',
      scUrl: 'sc-domain:new.example.com',
      ga4PropertyId: '5678',
    });

    invalidateManagedSiteCache(previous, next);

    expect(clearCacheEntriesByPrefix).toHaveBeenCalledWith('sc-comparison-', 'sc-domain:old.example.com');
    expect(clearCacheEntriesByPrefix).toHaveBeenCalledWith('sc-comparison-', 'sc-domain:new.example.com');
    expect(clearCacheEntriesByPrefix).toHaveBeenCalledWith('ga4-', '1234');
    expect(clearCacheEntriesByPrefix).toHaveBeenCalledWith('ga4-', '5678');
    expect(clearCacheEntriesByPrefix).toHaveBeenCalledWith('rum-cwv-', '1234');
    expect(clearCacheEntriesByPrefix).toHaveBeenCalledWith('rum-cwv-', '5678');
    expect(clearSitemapSyncState).toHaveBeenCalledWith('site1');
  });

  it('clears sitemap sync state when the Search Console identity changes but the domain stays the same', () => {
    const previous = makeSite({
      scUrl: 'https://example.com/',
      ga4PropertyId: '1234',
    });
    const next = makeSite({
      scUrl: 'sc-domain:example.com',
      ga4PropertyId: '1234',
    });

    invalidateManagedSiteCache(previous, next);

    expect(clearSitemapSyncState).toHaveBeenCalledWith('site1');
  });

  it('does not clear sitemap sync state for non-sitemap identity changes', () => {
    const previous = makeSite({ name: 'Old Name', ga4PropertyId: '1234' });
    const next = makeSite({ name: 'New Name', ga4PropertyId: '5678' });

    invalidateManagedSiteCache(previous, next);

    expect(clearSitemapSyncState).not.toHaveBeenCalled();
  });

  it('clears sitemap sync state when deleting a managed site', () => {
    const previous = makeSite({ ga4PropertyId: '1234' });

    invalidateManagedSiteCache(previous, null);

    expect(clearSitemapSyncState).toHaveBeenCalledWith('site1');
  });

  it('does not clear duplicate identities twice', () => {
    const previous = makeSite({ ga4PropertyId: '1234' });
    const next = makeSite({ ga4PropertyId: '1234' });

    invalidateManagedSiteCache(previous, next);

    expect(clearCacheEntry).toHaveBeenCalledWith('audit', 'site1');
    expect(clearCacheEntry).toHaveBeenCalledWith('sitemap-submissions', 'sc-domain:example.com');
    expect(clearCacheEntriesByPrefix).toHaveBeenCalledWith('ga4-', '1234');
    expect(clearCacheEntriesByPrefix).toHaveBeenCalledWith('rum-cwv-', '1234');
    expect(clearCacheEntry).toHaveBeenCalledTimes(2);
    expect(clearCacheEntriesByPrefix).toHaveBeenCalledTimes(6);
    expect(clearSitemapSyncState).not.toHaveBeenCalled();
  });
});
