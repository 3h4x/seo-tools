import { describe, it, expect, vi } from 'vitest';

vi.mock('../db', () => ({ dbGetSites: vi.fn() }));

import { getSCUrl } from '../sites';
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

  it('falls back to domain when scUrl is not set', () => {
    const site = makeSite({ domain: 'example.com' });
    expect(getSCUrl(site)).toBe('example.com');
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
