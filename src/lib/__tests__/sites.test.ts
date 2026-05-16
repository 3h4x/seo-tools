import { describe, it, expect, vi } from 'vitest';

vi.mock('../db', () => ({ dbGetSites: vi.fn() }));

import { dbGetSites } from '../db';
import { createUniqueSiteId, isReservedSiteId, isValidSiteId } from '../site-domain';
import {
  getSCUrl,
  getManagedSite,
  getManagedSites,
  getSearchConsoleUrlIdentities,
  getSiteSearchConsoleIdentities,
  normalizeSearchConsoleIdentity,
  validateAndNormalizeSiteInput,
} from '../sites';
import type { Site } from '../sites';

function makeSite(overrides: Partial<Site> = {}): Site {
  return {
    id: 'test',
    name: 'Test',
    domain: 'example.com',
    testPages: [],
    ...overrides,
  };
}

describe('getSCUrl', () => {
  it('returns scUrl override when present', () => {
    const site = makeSite({ scUrl: 'sc-domain:example.com', domain: 'example.com' });
    expect(getSCUrl(site)).toBe('sc-domain:example.com');
  });

  it('prefixes domain with sc-domain: when scUrl is not set', () => {
    const site = makeSite({ domain: 'example.com' });
    expect(getSCUrl(site)).toBe('sc-domain:example.com');
  });

  it('uses sc-domain: prefixed scUrl for domain properties', () => {
    const site = makeSite({ scUrl: 'sc-domain:bonker.wtf', domain: 'bonker.wtf' });
    expect(getSCUrl(site)).toBe('sc-domain:bonker.wtf');
  });

  it('uses URL-prefix scUrl for URL-prefix properties', () => {
    const site = makeSite({ scUrl: 'https://3h4x.github.io/', domain: '3h4x.github.io' });
    expect(getSCUrl(site)).toBe('https://3h4x.github.io/');
  });
});

describe('Search Console identity helpers', () => {
  it('normalizes identity strings for stable comparisons', () => {
    expect(normalizeSearchConsoleIdentity(' HTTPS://Example.com/ ')).toBe('https://example.com');
  });

  it('expands URL-prefix identities to include the hostname', () => {
    expect(getSearchConsoleUrlIdentities('https://blog.example.com/')).toEqual([
      'https://blog.example.com',
      'blog.example.com',
    ]);
  });

  it('includes both hostname and SC override identities for a managed site', () => {
    expect(getSiteSearchConsoleIdentities(makeSite({
      domain: 'other.example.com',
      scUrl: 'https://blog.example.com/',
    }))).toEqual([
      'other.example.com',
      'https://blog.example.com',
      'blog.example.com',
    ]);
  });
});

describe('managed site lookups', () => {
  it('returns all managed sites from the database helper', async () => {
    vi.mocked(dbGetSites).mockReturnValue([
      makeSite(),
      makeSite({ id: 'other', domain: 'other.test' }),
    ] as never);

    await expect(getManagedSites()).resolves.toEqual([
      makeSite(),
      makeSite({ id: 'other', domain: 'other.test' }),
    ]);
  });

  it('returns a managed site by id', async () => {
    vi.mocked(dbGetSites).mockReturnValue([
      makeSite(),
      makeSite({ id: 'other', domain: 'other.test' }),
    ] as never);

    await expect(getManagedSite('other')).resolves.toEqual(
      makeSite({ id: 'other', domain: 'other.test' }),
    );
  });

  it('returns null when the managed site id does not exist', async () => {
    vi.mocked(dbGetSites).mockReturnValue([makeSite()] as never);

    await expect(getManagedSite('missing')).resolves.toBeNull();
  });
});

describe('isValidSiteId', () => {
  it('accepts IDs that are safe to use as one route segment', () => {
    expect(isValidSiteId('site-1')).toBe(true);
    expect(isValidSiteId('site_1')).toBe(true);
    expect(isValidSiteId('site.one')).toBe(true);
  });

  it('rejects IDs that could escape a route segment', () => {
    expect(isValidSiteId('//evil.example')).toBe(false);
    expect(isValidSiteId('site/one')).toBe(false);
    expect(isValidSiteId(' site ')).toBe(false);
  });
});

describe('isReservedSiteId', () => {
  it('reserves top-level app route segments that would shadow site detail pages', () => {
    expect(isReservedSiteId('actions')).toBe(true);
    expect(isReservedSiteId('audit')).toBe(true);
    expect(isReservedSiteId('opportunities')).toBe(true);
    expect(isReservedSiteId('performance')).toBe(true);
    expect(isReservedSiteId('site-1')).toBe(false);
  });
});

describe('createUniqueSiteId', () => {
  it('skips reserved top-level route segments when allocating ids', () => {
    expect(createUniqueSiteId('actions', [])).toBe('actions-2');
    expect(createUniqueSiteId('audit', ['audit-2'])).toBe('audit-3');
    expect(createUniqueSiteId('opportunities', [])).toBe('opportunities-2');
  });

  it('skips existing ids when allocating ids', () => {
    expect(createUniqueSiteId('site-1', ['site-1', 'site-1-2'])).toBe('site-1-3');
  });
});

describe('validateAndNormalizeSiteInput', () => {
  it('returns normalized site for a minimal valid payload', () => {
    const result = validateAndNormalizeSiteInput(
      { id: 'my-site', name: 'My Site', domain: 'mysite.com' },
      [],
    );
    expect(result.errors).toBeNull();
    expect(result.normalized?.site).toMatchObject({ id: 'my-site', name: 'My Site', domain: 'mysite.com', testPages: [] });
  });

  it('normalizes URL domain and sets scUrl automatically', () => {
    const result = validateAndNormalizeSiteInput(
      { id: 's', name: 'S', domain: 'https://EXAMPLE.COM/path' },
      [],
    );
    expect(result.errors).toBeNull();
    expect(result.normalized?.site.domain).toBe('example.com');
    expect(result.normalized?.site.scUrl).toBe('https://EXAMPLE.COM/path');
  });

  it('trims whitespace from id, name, domain', () => {
    const result = validateAndNormalizeSiteInput(
      { id: '  mysite  ', name: '  My Site  ', domain: '  mysite.com  ' },
      [],
    );
    expect(result.errors).toBeNull();
    expect(result.normalized?.site.id).toBe('mysite');
    expect(result.normalized?.site.name).toBe('My Site');
    expect(result.normalized?.site.domain).toBe('mysite.com');
  });

  it('strips sortOrder from the site record', () => {
    const result = validateAndNormalizeSiteInput(
      { id: 's', name: 'S', domain: 'site.com', sortOrder: 5 },
      [],
    );
    expect(result.errors).toBeNull();
    expect((result.normalized!.site as unknown as Record<string, unknown>).sortOrder).toBeUndefined();
  });

  it('returns field error for missing id', () => {
    const result = validateAndNormalizeSiteInput({ name: 'S', domain: 'site.com' }, []);
    expect(result.errors?.id).toBeTruthy();
    expect(result.normalized).toBeNull();
  });

  it('returns field error for invalid id', () => {
    const result = validateAndNormalizeSiteInput({ id: '//bad', name: 'S', domain: 'site.com' }, []);
    expect(result.errors?.id).toBeTruthy();
  });

  it('returns field error for reserved app route ids', () => {
    const result = validateAndNormalizeSiteInput({ id: 'opportunities', name: 'S', domain: 'site.com' }, []);
    expect(result.errors?.id).toMatch(/reserved/i);
  });

  it('returns field error for missing name', () => {
    const result = validateAndNormalizeSiteInput({ id: 's', domain: 'site.com' }, []);
    expect(result.errors?.name).toBeTruthy();
  });

  it('returns field error for invalid domain', () => {
    const result = validateAndNormalizeSiteInput({ id: 's', name: 'S', domain: 'bad..domain' }, []);
    expect(result.errors?.domain).toBeTruthy();
  });

  it('returns field error when domain is already used by another site', () => {
    const existing = makeSite({ id: 'other', domain: 'taken.com' });
    const result = validateAndNormalizeSiteInput(
      { id: 'new-site', name: 'New', domain: 'taken.com' },
      [existing],
    );
    expect(result.errors?.domain).toMatch(/other/);
  });

  it('allows update of a site with its own existing domain', () => {
    const existing = makeSite({ id: 'mysite', domain: 'mysite.com' });
    const result = validateAndNormalizeSiteInput(
      { id: 'mysite', originalId: 'mysite', name: 'Updated', domain: 'mysite.com' },
      [existing],
    );
    expect(result.errors).toBeNull();
  });

  it('returns field error for invalid scUrl', () => {
    const result = validateAndNormalizeSiteInput(
      { id: 's', name: 'S', domain: 'site.com', scUrl: 'not-a-url' },
      [],
    );
    expect(result.errors?.scUrl).toBeTruthy();
  });

  it('accepts sc-domain: scUrl', () => {
    const result = validateAndNormalizeSiteInput(
      { id: 's', name: 'S', domain: 'site.com', scUrl: 'sc-domain:site.com' },
      [],
    );
    expect(result.errors).toBeNull();
    expect(result.normalized?.site.scUrl).toBe('sc-domain:site.com');
  });

  it('returns field error for ga4PropertyId not matching properties/NNNNNN', () => {
    const result = validateAndNormalizeSiteInput(
      { id: 's', name: 'S', domain: 'site.com', ga4PropertyId: '123456' },
      [],
    );
    expect(result.errors?.ga4PropertyId).toBeTruthy();
  });

  it('accepts an IndexNow key using provider-supported characters', () => {
    const result = validateAndNormalizeSiteInput(
      { id: 's', name: 'S', domain: 'site.com', indexNowKey: 'indexnow-key-123' },
      [],
    );
    expect(result.errors).toBeNull();
    expect(result.normalized?.site.indexNowKey).toBe('indexnow-key-123');
  });

  it('returns field error for IndexNow keys with dots or underscores', () => {
    const dotted = validateAndNormalizeSiteInput(
      { id: 's', name: 'S', domain: 'site.com', indexNowKey: 'index.now.key' },
      [],
    );
    expect(dotted.errors?.indexNowKey).toMatch(/letters, numbers, or hyphens/i);

    const underscored = validateAndNormalizeSiteInput(
      { id: 's', name: 'S', domain: 'site.com', indexNowKey: 'index_now_key' },
      [],
    );
    expect(underscored.errors?.indexNowKey).toMatch(/letters, numbers, or hyphens/i);
  });

  it('returns field error when Search Console identity is already used by another site', () => {
    const existing = makeSite({
      id: 'existing',
      domain: 'other.example.com',
      scUrl: 'https://blog.example.com/',
    });
    const result = validateAndNormalizeSiteInput(
      { id: 'new-site', name: 'New Site', domain: 'blog.example.com' },
      [existing],
    );
    expect(result.errors?.scUrl).toMatch(/existing/);
  });

  it('allows update when the Search Console identity belongs to the same site', () => {
    const existing = makeSite({
      id: 'existing',
      domain: 'blog.example.com',
      scUrl: 'https://blog.example.com/',
    });
    const result = validateAndNormalizeSiteInput(
      { id: 'existing', originalId: 'existing', name: 'Existing', domain: 'blog.example.com' },
      [existing],
    );
    expect(result.errors).toBeNull();
  });

  it('returns field error when id is already used by another site and originalId is missing', () => {
    const existing = makeSite({ id: 'existing', domain: 'existing.com' });
    const result = validateAndNormalizeSiteInput(
      { id: 'existing', name: 'New Site', domain: 'newsite.com' },
      [existing],
    );
    expect(result.errors?.id).toMatch(/existing/);
  });

  it('returns field error when originalId does not match the submitted id', () => {
    const existing = makeSite({ id: 'existing', domain: 'existing.com' });
    const result = validateAndNormalizeSiteInput(
      { id: 'new-id', originalId: 'existing', name: 'Existing', domain: 'existing.com' },
      [existing],
    );
    expect(result.errors?.id).toMatch(/changing site id/i);
  });

  it('accepts a valid ga4PropertyId', () => {
    const result = validateAndNormalizeSiteInput(
      { id: 's', name: 'S', domain: 'site.com', ga4PropertyId: 'properties/123456' },
      [],
    );
    expect(result.errors).toBeNull();
    expect(result.normalized?.site.ga4PropertyId).toBe('properties/123456');
  });

  it('returns field error when a testPage does not start with /', () => {
    const result = validateAndNormalizeSiteInput(
      { id: 's', name: 'S', domain: 'site.com', testPages: ['/ok', 'bad'] },
      [],
    );
    expect(result.errors?.testPages).toBeTruthy();
  });

  it('accepts valid testPages', () => {
    const result = validateAndNormalizeSiteInput(
      { id: 's', name: 'S', domain: 'site.com', testPages: ['/', '/about'] },
      [],
    );
    expect(result.errors).toBeNull();
    expect(result.normalized?.site.testPages).toEqual(['/', '/about']);
  });

  it('normalizes skipChecks to stable ids before storage', () => {
    const result = validateAndNormalizeSiteInput(
      { id: 's', name: 'S', domain: 'site.com', skipChecks: ['OG Image', 'Internal Links', 'og:image'] },
      [],
    );
    expect(result.errors).toBeNull();
    expect(result.normalized?.site.skipChecks).toEqual(['ogImage', 'internalLinks', 'ogImageMeta']);
  });

  it('preserves existing identifier-style skipChecks when a site is re-saved', () => {
    const result = validateAndNormalizeSiteInput(
      { id: 's', name: 'S', domain: 'site.com', skipChecks: ['ogImage', 'internalLinks'] },
      [],
    );
    expect(result.errors).toBeNull();
    expect(result.normalized?.site.skipChecks).toEqual(['ogImage', 'internalLinks']);
  });
});
