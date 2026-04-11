import { describe, it, expect, vi, beforeAll } from 'vitest';

// Mock Google API dependencies so importing audit.ts doesn't require credentials
vi.mock('../google-auth', () => ({
  getAuth: () => ({}),
}));
vi.mock('@googleapis/searchconsole', () => ({
  searchconsole_v1: {
    Searchconsole: class {
      sitemaps = { list: vi.fn() };
      searchanalytics = { query: vi.fn() };
    },
  },
}));
vi.mock('../db', () => ({
  getCached: vi.fn().mockReturnValue(null),
  setCache: vi.fn(),
  CACHE_TTL_WEEK: 604800000,
}));

import {
  extractMeta,
  makeCheck,
  parseMetaTags,
  checkImageSeo,
  checkInternalLinks,
  type FetchResult,
} from '../audit';

function makeFetchResult(overrides: Partial<FetchResult> = {}): FetchResult {
  return {
    ok: true,
    status: 200,
    text: '',
    headers: new Headers(),
    ttfbMs: 50,
    ...overrides,
  };
}

describe('extractMeta', () => {
  it('extracts og:title from property attribute', () => {
    const html = `<meta property="og:title" content="My Title">`;
    expect(extractMeta(html, 'og:title')).toBe('My Title');
  });

  it('extracts description from name attribute', () => {
    const html = `<meta name="description" content="Page description here">`;
    expect(extractMeta(html, 'description', 'name')).toBe('Page description here');
  });

  it('returns null when meta tag is absent', () => {
    expect(extractMeta('<html><body></body></html>', 'og:title')).toBeNull();
  });

  it('handles attributes in any order', () => {
    const html = `<meta content="My Value" property="og:title">`;
    expect(extractMeta(html, 'og:title')).toBe('My Value');
  });

  it('is case-insensitive', () => {
    const html = `<META PROPERTY="OG:TITLE" CONTENT="Case Test">`;
    expect(extractMeta(html, 'OG:TITLE')).toBe('Case Test');
  });

  it('returns empty string when content is empty', () => {
    const html = `<meta property="og:image" content="">`;
    expect(extractMeta(html, 'og:image')).toBe('');
  });
});

describe('makeCheck', () => {
  it('returns fail when value is null', () => {
    const result = makeCheck('og:title', null);
    expect(result.status).toBe('fail');
    expect(result.label).toBe('og:title');
    expect(result.message).toBe('Not found');
  });

  it('returns fail when value is empty string', () => {
    const result = makeCheck('og:title', '');
    expect(result.status).toBe('fail');
  });

  it('returns pass for a normal value', () => {
    const result = makeCheck('title', 'My Page Title');
    expect(result.status).toBe('pass');
    expect(result.message).toBe('My Page Title');
  });

  it('returns warn when value is shorter than minLen', () => {
    const result = makeCheck('description', 'hi', 10);
    expect(result.status).toBe('warn');
    expect(result.message).toContain('too short');
  });

  it('truncates messages longer than 80 characters', () => {
    const longValue = 'A'.repeat(85);
    const result = makeCheck('title', longValue);
    expect(result.status).toBe('pass');
    expect(result.message).toHaveLength(80); // 77 chars + '...'
    expect(result.message.endsWith('...')).toBe(true);
  });

  it('does not truncate messages of exactly 80 characters', () => {
    const value = 'B'.repeat(80);
    const result = makeCheck('title', value);
    expect(result.message).toBe(value);
  });
});

describe('parseMetaTags', () => {
  const fullHtml = `
    <html>
    <head>
      <title>Example — Token Factory</title>
      <meta name="description" content="Launch your token on Example today.">
      <meta property="og:title" content="Example OG Title">
      <meta property="og:image" content="https://example.com/og.png">
      <meta property="og:description" content="OG description text here.">
      <meta name="twitter:card" content="summary_large_image">
      <link rel="canonical" href="https://example.com/">
      <script type="application/ld+json">{"@type":"Product","name":"Example"}</script>
    </head>
    </html>
  `;

  it('parses all meta tags from a full HTML page', () => {
    const res = makeFetchResult({ text: fullHtml });
    const result = parseMetaTags(res, '/');
    expect(result.page).toBe('/');
    expect(result.title.status).toBe('pass');
    expect(result.description.status).toBe('pass');
    expect(result.ogTitle.status).toBe('pass');
    expect(result.ogImage.status).toBe('pass');
    expect(result.ogDescription.status).toBe('pass');
    expect(result.twitterCard.status).toBe('pass');
    expect(result.canonical.status).toBe('pass');
    expect(result.jsonLd.status).toBe('pass');
  });

  it('detects generic title "React App"', () => {
    const html = `<html><head><title>React App</title></head></html>`;
    const res = makeFetchResult({ text: html });
    const result = parseMetaTags(res, '/');
    expect(result.title.status).toBe('warn');
    expect(result.title.message).toContain('Generic title');
  });

  it('returns error status for all checks when fetch failed', () => {
    const res = makeFetchResult({ ok: false, status: 404, text: '', error: 'Not Found' });
    const result = parseMetaTags(res, '/');
    expect(result.title.status).toBe('error');
    expect(result.description.status).toBe('error');
    expect(result.ogTitle.status).toBe('error');
  });

  it('fails when title is missing', () => {
    const res = makeFetchResult({ text: '<html><body></body></html>' });
    const result = parseMetaTags(res, '/');
    expect(result.title.status).toBe('fail');
  });

  it('fails JSON-LD when not present', () => {
    const html = `<html><head><title>Test</title></head></html>`;
    const res = makeFetchResult({ text: html });
    const result = parseMetaTags(res, '/');
    expect(result.jsonLd.status).toBe('fail');
  });

  it('includes JSON-LD @type in message when found', () => {
    const res = makeFetchResult({ text: fullHtml });
    const result = parseMetaTags(res, '/');
    expect(result.jsonLd.message).toContain('Product');
  });

  it('extracts ogImageUrl for OG image check chaining', () => {
    const res = makeFetchResult({ text: fullHtml });
    const result = parseMetaTags(res, '/');
    expect(result.ogImageUrl).toBe('https://example.com/og.png');
  });
});

describe('checkImageSeo', () => {
  it('returns pass with no-images message when page has no img tags', () => {
    const result = checkImageSeo('<html><body><p>text</p></body></html>', '/');
    expect(result.status).toBe('pass');
    expect(result.totalImages).toBe(0);
    expect(result.message).toBe('No images found');
  });

  it('passes when all images have alt text', () => {
    const html = `
      <img src="/a.png" alt="First image">
      <img src="/b.png" alt="Second image">
    `;
    const result = checkImageSeo(html, '/');
    expect(result.status).toBe('pass');
    expect(result.totalImages).toBe(2);
    expect(result.withAlt).toBe(2);
    expect(result.withoutAlt).toBe(0);
  });

  it('warns when ≥50% but <100% images have alt text', () => {
    const html = `
      <img src="/a.png" alt="Has alt">
      <img src="/b.png">
    `;
    const result = checkImageSeo(html, '/');
    expect(result.status).toBe('warn');
    expect(result.withAlt).toBe(1);
    expect(result.withoutAlt).toBe(1);
  });

  it('fails when <50% of images have alt text', () => {
    const html = `
      <img src="/a.png">
      <img src="/b.png">
      <img src="/c.png" alt="Only one">
    `;
    const result = checkImageSeo(html, '/');
    expect(result.status).toBe('fail');
  });

  it('counts lazy-loaded images correctly', () => {
    const html = `
      <img src="/a.png" alt="Lazy" loading="lazy">
      <img src="/b.png" alt="Eager">
    `;
    const result = checkImageSeo(html, '/');
    expect(result.withLazyLoading).toBe(1);
  });

  it('treats empty alt attribute as missing alt', () => {
    const html = `<img src="/a.png" alt="">`;
    const result = checkImageSeo(html, '/');
    expect(result.withAlt).toBe(0);
    expect(result.withoutAlt).toBe(1);
  });

  it('includes image details in results', () => {
    const html = `<img src="/logo.png" alt="Logo" loading="lazy">`;
    const result = checkImageSeo(html, '/about');
    expect(result.page).toBe('/about');
    expect(result.images[0]).toMatchObject({ src: '/logo.png', hasAlt: true, altText: 'Logo', isLazy: true });
  });
});

describe('checkInternalLinks', () => {
  const domain = 'example.com';

  it('passes with 3 or more internal links', () => {
    const html = `
      <a href="/page1">Page 1</a>
      <a href="/page2">Page 2</a>
      <a href="/page3">Page 3</a>
    `;
    const result = checkInternalLinks(html, domain, '/');
    expect(result.status).toBe('pass');
    expect(result.internalLinks).toBe(3);
  });

  it('warns with 1 or 2 internal links', () => {
    const html = `<a href="/page1">Page 1</a>`;
    const result = checkInternalLinks(html, domain, '/');
    expect(result.status).toBe('warn');
    expect(result.internalLinks).toBe(1);
  });

  it('fails with no internal links', () => {
    const html = `<a href="https://external.com">External</a>`;
    const result = checkInternalLinks(html, domain, '/');
    expect(result.status).toBe('fail');
    expect(result.internalLinks).toBe(0);
    expect(result.externalLinks).toBe(1);
  });

  it('counts absolute internal links containing the domain', () => {
    const html = `
      <a href="https://example.com/page1">Page 1</a>
      <a href="https://example.com/page2">Page 2</a>
      <a href="https://example.com/page3">Page 3</a>
    `;
    const result = checkInternalLinks(html, domain, '/');
    expect(result.status).toBe('pass');
    expect(result.internalLinks).toBe(3);
  });

  it('ignores mailto and javascript links', () => {
    const html = `
      <a href="mailto:hi@example.com">Email</a>
      <a href="javascript:void(0)">Click</a>
    `;
    const result = checkInternalLinks(html, domain, '/');
    expect(result.internalLinks).toBe(0);
    expect(result.externalLinks).toBe(0);
  });

  it('ignores fragment-only links', () => {
    const html = `<a href="#">Top</a>`;
    const result = checkInternalLinks(html, domain, '/');
    expect(result.internalLinks).toBe(0);
  });

  it('sets page and label on result', () => {
    const result = checkInternalLinks('<a href="/a">A</a><a href="/b">B</a><a href="/c">C</a>', domain, '/test');
    expect(result.page).toBe('/test');
    expect(result.label).toBe('Internal Links');
  });
});
