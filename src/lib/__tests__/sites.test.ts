import { describe, it, expect, vi } from 'vitest';

vi.mock('../db', () => ({ dbGetSites: vi.fn() }));

import { dbGetSites } from '../db';
import { isValidSiteId } from '../site-domain';
import { getSCUrl, getManagedSite, getManagedSites, validateAndNormalizeSiteInput } from '../sites';
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
      { id: 'mysite', name: 'Updated', domain: 'mysite.com' },
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
});
