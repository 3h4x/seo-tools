import { describe, expect, it } from 'vitest';
import { getSiteScUrlOverride, isReservedSiteId, isValidSiteDomain, normalizeSiteDomain, slugifySiteDomain } from '../site-domain';

describe('site-domain helpers', () => {
  it('normalizes bare domains', () => {
    expect(normalizeSiteDomain(' Example.COM ')).toBe('example.com');
  });

  it('normalizes http and https site URLs to hostnames', () => {
    expect(normalizeSiteDomain('https://Example.COM/path?x=1')).toBe('example.com');
    expect(normalizeSiteDomain('HTTPS://Example.COM/path?x=1')).toBe('example.com');
    expect(normalizeSiteDomain('http://blog.example.com/')).toBe('blog.example.com');
  });

  it('rejects malformed or unsupported domain inputs', () => {
    expect(normalizeSiteDomain('bad..example.com')).toBeNull();
    expect(normalizeSiteDomain('https://localhost/path')).toBeNull();
    expect(normalizeSiteDomain('ftp://example.com')).toBeNull();
    expect(normalizeSiteDomain('exa mple.com')).toBeNull();
  });

  it('reports validity through the same normalizer', () => {
    expect(isValidSiteDomain('https://example.com/path')).toBe(true);
    expect(isValidSiteDomain('localhost')).toBe(false);
  });

  it('preserves URL-prefix domain input as the inferred SC URL', () => {
    expect(getSiteScUrlOverride(' https://Blog.Example.COM/path?x=1 ')).toBe('https://Blog.Example.COM/path?x=1');
    expect(getSiteScUrlOverride('blog.example.com')).toBeUndefined();
  });

  it('prefers an explicit SC URL over inferred URL-prefix domain input', () => {
    expect(getSiteScUrlOverride('https://blog.example.com/', ' sc-domain:example.com ')).toBe('sc-domain:example.com');
  });

  it('slugifies normalized domains for generated ids', () => {
    expect(slugifySiteDomain('blog.example.com')).toBe('blog-example-com');
  });

  it('treats alerts as a reserved app route', () => {
    expect(isReservedSiteId('alerts')).toBe(true);
  });
});
