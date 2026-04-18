import { describe, it, expect, vi } from 'vitest';

vi.mock('../google-auth', () => ({ getAuth: vi.fn() }));
vi.mock('../db', () => ({ getDb: vi.fn() }));
vi.mock('@googleapis/searchconsole', () => ({ searchconsole_v1: { Searchconsole: vi.fn() } }));

import { parseSitemap, hashContent } from '../sitemap-sync';

describe('parseSitemap', () => {
  it('counts <url> elements in a standard sitemap', () => {
    const xml = `<?xml version="1.0"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://example.com/</loc></url>
  <url><loc>https://example.com/about</loc></url>
  <url><loc>https://example.com/contact</loc></url>
</urlset>`;
    const { urlCount, isIndex } = parseSitemap(xml);
    expect(urlCount).toBe(3);
    expect(isIndex).toBe(false);
  });

  it('counts <sitemap> elements in a sitemap index', () => {
    const xml = `<?xml version="1.0"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap><loc>https://example.com/sitemap-posts.xml</loc></sitemap>
  <sitemap><loc>https://example.com/sitemap-pages.xml</loc></sitemap>
</sitemapindex>`;
    const { urlCount, isIndex } = parseSitemap(xml);
    expect(urlCount).toBe(2);
    expect(isIndex).toBe(true);
  });

  it('extracts the latest lastmod date', () => {
    const xml = `<urlset>
  <url><lastmod>2024-01-01</lastmod></url>
  <url><lastmod>2024-03-15</lastmod></url>
  <url><lastmod>2024-02-10</lastmod></url>
</urlset>`;
    const { latestLastmod } = parseSitemap(xml);
    expect(latestLastmod).toBe('2024-03-15');
  });

  it('returns null latestLastmod when no lastmod tags', () => {
    const xml = `<urlset><url><loc>https://example.com/</loc></url></urlset>`;
    const { latestLastmod } = parseSitemap(xml);
    expect(latestLastmod).toBeNull();
  });

  it('returns 0 url count for empty sitemap', () => {
    const xml = `<urlset></urlset>`;
    const { urlCount } = parseSitemap(xml);
    expect(urlCount).toBe(0);
  });

  it('handles lastmod with datetime values', () => {
    const xml = `<urlset>
  <url><lastmod>2024-01-01T00:00:00+00:00</lastmod></url>
  <url><lastmod>2024-06-15T12:00:00+00:00</lastmod></url>
</urlset>`;
    const { latestLastmod } = parseSitemap(xml);
    expect(latestLastmod).toBe('2024-06-15T12:00:00+00:00');
  });
});

describe('hashContent', () => {
  it('returns a 16-character hex string', () => {
    const hash = hashContent('<urlset><url><loc>https://example.com/</loc></url></urlset>');
    expect(hash).toMatch(/^[0-9a-f]{16}$/);
  });

  it('returns the same hash for identical content', () => {
    const xml = '<urlset><url><loc>https://example.com/</loc></url></urlset>';
    expect(hashContent(xml)).toBe(hashContent(xml));
  });

  it('returns different hashes for different content', () => {
    const a = hashContent('<urlset><url><loc>https://example.com/a</loc></url></urlset>');
    const b = hashContent('<urlset><url><loc>https://example.com/b</loc></url></urlset>');
    expect(a).not.toBe(b);
  });

  it('normalizes whitespace before hashing — multiple spaces treated the same as one', () => {
    const singleSpace = '<urlset> <url> </url> </urlset>';
    const multiSpace = '<urlset>   <url>   </url>   </urlset>';
    const mixedNewlines = '<urlset>\n  <url>\n  </url>\n</urlset>';
    expect(hashContent(singleSpace)).toBe(hashContent(multiSpace));
    expect(hashContent(singleSpace)).toBe(hashContent(mixedNewlines));
  });
});
