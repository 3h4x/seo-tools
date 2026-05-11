import { describe, it, expect, vi } from 'vitest';

vi.mock('../db', () => ({ dbGetSites: vi.fn() }));

import { dbGetSites } from '../db';
import { isValidSiteId } from '../site-domain';
import { getSCUrl, getManagedSite, getManagedSites } from '../sites';
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
