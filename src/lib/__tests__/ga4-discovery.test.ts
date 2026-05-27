import { describe, expect, it } from 'vitest';

import {
  buildUniqueExactGa4Matches,
  findMatchingGa4Property,
  getSafeDomainVariants,
  resolveSiteGa4PropertyId,
  type DiscoveredGa4Property,
} from '../ga4-discovery';

describe('getSafeDomainVariants', () => {
  it('returns both www and non-www variants for a bare domain', () => {
    const variants = getSafeDomainVariants('example.com');
    expect(variants).toEqual(new Set(['example.com', 'www.example.com']));
  });

  it('returns both variants for a www-prefixed domain', () => {
    const variants = getSafeDomainVariants('www.example.com');
    expect(variants).toEqual(new Set(['www.example.com', 'example.com']));
  });

  it('returns an empty set for an invalid domain', () => {
    expect(getSafeDomainVariants('not a domain')).toEqual(new Set());
    expect(getSafeDomainVariants('')).toEqual(new Set());
    expect(getSafeDomainVariants('localhost')).toEqual(new Set());
  });

  it('normalizes input casing', () => {
    const variants = getSafeDomainVariants('Example.COM');
    expect(variants).toEqual(new Set(['example.com', 'www.example.com']));
  });

  it('accepts a subdomain and adds www variant', () => {
    const variants = getSafeDomainVariants('blog.example.com');
    expect(variants).toEqual(new Set(['blog.example.com', 'www.blog.example.com']));
  });
});

describe('buildUniqueExactGa4Matches', () => {
  it('returns an empty map for an empty input', () => {
    expect(buildUniqueExactGa4Matches([])).toEqual(new Map());
  });

  it('maps a single exact-match display name to its property', () => {
    const props: DiscoveredGa4Property[] = [
      { displayName: 'example.com', propertyId: '123' },
    ];
    const result = buildUniqueExactGa4Matches(props);
    expect(result.get('example.com')).toEqual({ displayName: 'example.com', propertyId: '123' });
  });

  it('drops both entries when two properties share the same exact domain', () => {
    const props: DiscoveredGa4Property[] = [
      { displayName: 'example.com', propertyId: '111' },
      { displayName: 'example.com', propertyId: '222' },
    ];
    const result = buildUniqueExactGa4Matches(props);
    expect(result.size).toBe(0);
  });

  it('keeps unambiguous entries when only one domain is ambiguous', () => {
    const props: DiscoveredGa4Property[] = [
      { displayName: 'example.com', propertyId: '111' },
      { displayName: 'example.com', propertyId: '222' },
      { displayName: 'other.com', propertyId: '333' },
    ];
    const result = buildUniqueExactGa4Matches(props);
    expect(result.size).toBe(1);
    expect(result.get('other.com')).toEqual({ displayName: 'other.com', propertyId: '333' });
    expect(result.has('example.com')).toBe(false);
  });

  it('skips entries with empty displayName or propertyId', () => {
    const props: DiscoveredGa4Property[] = [
      { displayName: '', propertyId: '123' },
      { displayName: 'example.com', propertyId: '' },
      { displayName: 'valid.com', propertyId: '456' },
    ];
    const result = buildUniqueExactGa4Matches(props);
    expect(result.size).toBe(1);
    expect(result.get('valid.com')).toBeDefined();
  });

  it('does not include non-exact-domain display names in result', () => {
    const props: DiscoveredGa4Property[] = [
      { displayName: 'example.com GA4', propertyId: '123' },
    ];
    const result = buildUniqueExactGa4Matches(props);
    expect(result.has('example.com')).toBe(false);
  });
});

describe('findMatchingGa4Property', () => {
  it('returns undefined when no properties match the domain', () => {
    const props: DiscoveredGa4Property[] = [
      { displayName: 'other.com', propertyId: '999' },
    ];
    expect(findMatchingGa4Property('example.com', props)).toBeUndefined();
  });

  it('returns the single matching property by exact domain display name', () => {
    const props: DiscoveredGa4Property[] = [
      { displayName: 'example.com', propertyId: '123' },
    ];
    expect(findMatchingGa4Property('example.com', props)).toEqual({
      displayName: 'example.com',
      propertyId: '123',
    });
  });

  it('matches via www-variant when site uses bare domain and property uses www', () => {
    const props: DiscoveredGa4Property[] = [
      { displayName: 'www.example.com', propertyId: '123' },
    ];
    expect(findMatchingGa4Property('example.com', props)).toEqual({
      displayName: 'www.example.com',
      propertyId: '123',
    });
  });

  it('matches via non-www variant when site uses www domain', () => {
    const props: DiscoveredGa4Property[] = [
      { displayName: 'example.com', propertyId: '123' },
    ];
    expect(findMatchingGa4Property('www.example.com', props)).toEqual({
      displayName: 'example.com',
      propertyId: '123',
    });
  });

  it('returns undefined when multiple properties match (ambiguous)', () => {
    const props: DiscoveredGa4Property[] = [
      { displayName: 'example.com', propertyId: '111' },
      { displayName: 'www.example.com', propertyId: '222' },
    ];
    expect(findMatchingGa4Property('example.com', props)).toBeUndefined();
  });

  it('returns undefined for an invalid site domain', () => {
    const props: DiscoveredGa4Property[] = [
      { displayName: 'example.com', propertyId: '123' },
    ];
    expect(findMatchingGa4Property('not a domain', props)).toBeUndefined();
  });

  it('matches via leading-domain display names like "example.com GA4"', () => {
    const props: DiscoveredGa4Property[] = [
      { displayName: 'example.com GA4', propertyId: '123' },
    ];
    expect(findMatchingGa4Property('example.com', props)).toEqual({
      displayName: 'example.com GA4',
      propertyId: '123',
    });
  });

  it('does not match ambiguous descriptors like "example.com shop"', () => {
    const props: DiscoveredGa4Property[] = [
      { displayName: 'example.com shop', propertyId: '123' },
    ];
    expect(findMatchingGa4Property('example.com', props)).toBeUndefined();
  });
});

describe('resolveSiteGa4PropertyId', () => {
  const properties: DiscoveredGa4Property[] = [
    { displayName: 'discovered.com', propertyId: '456' },
  ];

  it('returns the normalized existing property ID when the site already has one', () => {
    expect(resolveSiteGa4PropertyId({ domain: 'example.com', ga4PropertyId: '123' }, properties)).toBe('properties/123');
  });

  it('returns the already-prefixed property ID unchanged', () => {
    expect(resolveSiteGa4PropertyId({ domain: 'example.com', ga4PropertyId: 'properties/123' }, properties)).toBe('properties/123');
  });

  it('falls back to discovered property when site has no existing ID', () => {
    expect(resolveSiteGa4PropertyId({ domain: 'discovered.com' }, properties)).toBe('properties/456');
  });

  it('returns undefined when no existing ID and no matching discovered property', () => {
    expect(resolveSiteGa4PropertyId({ domain: 'unknown.com' }, properties)).toBeUndefined();
  });

  it('falls back to discovery when ga4PropertyId is empty string', () => {
    expect(resolveSiteGa4PropertyId({ domain: 'discovered.com', ga4PropertyId: '' }, properties)).toBe('properties/456');
  });
});
