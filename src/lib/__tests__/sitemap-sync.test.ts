import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../google-auth', () => ({ getAuth: vi.fn() }));
vi.mock('../db', () => ({ getDb: vi.fn() }));
vi.mock('@googleapis/searchconsole', () => ({ searchconsole_v1: { Searchconsole: vi.fn() } }));

import { getAuth } from '../google-auth';
import { getDb } from '../db';
import { searchconsole_v1 } from '@googleapis/searchconsole';
import { parseSitemap, hashContent, runSitemapSync } from '../sitemap-sync';

const SAMPLE_XML = `<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://example.com/</loc><lastmod>2024-01-01</lastmod></url></urlset>`;

function makeDb(
  rows: { id: string; domain: string; sc_url: string | null; search_console?: number }[] = [],
  prevState?: Record<string, unknown>,
) {
  const stmtGet = { get: vi.fn().mockReturnValue(prevState ?? undefined) };
  const stmtAll = {
    all: vi.fn().mockImplementation(() => rows.filter((row) => row.search_console !== 0)),
  };
  const stmtRun = { run: vi.fn() };
  const prepare = vi.fn().mockImplementation((sql: string) => {
    if (sql.includes('SELECT id')) return stmtAll;
    if (sql.includes('SELECT *')) return stmtGet;
    return stmtRun;
  });
  return { exec: vi.fn(), prepare, _stmtRun: stmtRun, _stmtGet: stmtGet };
}

function mockFetch(ok: boolean, body = SAMPLE_XML) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok,
    status: ok ? 200 : 404,
    text: () => Promise.resolve(body),
  }));
}

function mockSc(submitImpl: () => Promise<unknown> = () => Promise.resolve({})) {
  vi.mocked(searchconsole_v1.Searchconsole).mockImplementation(function () {
    return { sitemaps: { submit: vi.fn().mockImplementation(submitImpl) } };
  } as never);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getAuth).mockReturnValue({} as never);
  mockSc();
});

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

describe('runSitemapSync', () => {
  it('completes without error when there are no sites', async () => {
    vi.mocked(getDb).mockReturnValue(makeDb([]) as never);
    await expect(runSitemapSync()).resolves.toBeUndefined();
  });

  it('skips site and counts error when sitemap fetch fails', async () => {
    const db = makeDb([{ id: 'site1', domain: 'example.com', sc_url: null }]);
    vi.mocked(getDb).mockReturnValue(db as never);
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));

    await runSitemapSync();

    expect(db._stmtRun.run).not.toHaveBeenCalled();
  });

  it('does not fetch or submit sitemaps for Search Console-disabled sites', async () => {
    const db = makeDb([
      { id: 'disabled', domain: 'disabled.example', sc_url: null, search_console: 0 },
    ]);
    vi.mocked(getDb).mockReturnValue(db as never);
    mockFetch(true);

    await runSitemapSync();

    expect(db.prepare).toHaveBeenCalledWith(
      'SELECT id, domain, sc_url FROM sites WHERE COALESCE(search_console, 1) = 1 ORDER BY sort_order ASC',
    );
    expect(fetch).not.toHaveBeenCalled();
    expect(db._stmtRun.run).not.toHaveBeenCalled();
  });

  it('skips site and counts error when fetch returns non-OK status', async () => {
    const db = makeDb([{ id: 'site1', domain: 'example.com', sc_url: null }]);
    vi.mocked(getDb).mockReturnValue(db as never);
    mockFetch(false);

    await runSitemapSync();

    expect(db._stmtRun.run).not.toHaveBeenCalled();
  });

  it('updates state without submitting when content is unchanged', async () => {
    const hash = hashContent(SAMPLE_XML);
    const prevState = { content_hash: hash, last_submitted_at: null, submit_count: 2 };
    const db = makeDb([{ id: 'site1', domain: 'example.com', sc_url: null }], prevState);
    vi.mocked(getDb).mockReturnValue(db as never);
    mockFetch(true);

    const submit = vi.fn();
    vi.mocked(searchconsole_v1.Searchconsole).mockImplementation(function () {
      return { sitemaps: { submit } };
    } as never);

    await runSitemapSync();

    expect(submit).not.toHaveBeenCalled();
    expect(db._stmtRun.run).toHaveBeenCalledOnce();
  });

  it('updates state without submitting when throttled (< 24h since last submit)', async () => {
    const prevState = {
      content_hash: 'old-hash',
      last_submitted_at: Date.now() - 1000,
      submit_count: 1,
    };
    const db = makeDb([{ id: 'site1', domain: 'example.com', sc_url: null }], prevState);
    vi.mocked(getDb).mockReturnValue(db as never);
    mockFetch(true);

    const submit = vi.fn();
    vi.mocked(searchconsole_v1.Searchconsole).mockImplementation(function () {
      return { sitemaps: { submit } };
    } as never);

    await runSitemapSync();

    expect(submit).not.toHaveBeenCalled();
    expect(db._stmtRun.run).toHaveBeenCalledOnce();
  });

  it('submits sitemap when content changed and throttle window has passed', async () => {
    const prevState = {
      content_hash: 'old-hash',
      last_submitted_at: Date.now() - 25 * 60 * 60 * 1000,
      submit_count: 3,
    };
    const db = makeDb([{ id: 'site1', domain: 'example.com', sc_url: 'sc-domain:example.com' }], prevState);
    vi.mocked(getDb).mockReturnValue(db as never);
    mockFetch(true);

    const submit = vi.fn().mockResolvedValue({});
    vi.mocked(searchconsole_v1.Searchconsole).mockImplementation(function () {
      return { sitemaps: { submit } };
    } as never);

    await runSitemapSync();

    expect(submit).toHaveBeenCalledWith({
      siteUrl: 'sc-domain:example.com',
      feedpath: 'https://example.com/sitemap.xml',
    });
    const callArgs = db._stmtRun.run.mock.calls[0][0] as Record<string, unknown>;
    expect(callArgs.submit_count).toBe(4);
  });

  it('submits when no previous state exists (first time)', async () => {
    const db = makeDb([{ id: 'site1', domain: 'example.com', sc_url: null }], undefined);
    vi.mocked(getDb).mockReturnValue(db as never);
    mockFetch(true);

    const submit = vi.fn().mockResolvedValue({});
    vi.mocked(searchconsole_v1.Searchconsole).mockImplementation(function () {
      return { sitemaps: { submit } };
    } as never);

    await runSitemapSync();

    expect(submit).toHaveBeenCalledOnce();
  });

  it('treats a cleared sitemap state as a forced resubmit after site identity changes', async () => {
    const db = makeDb([{ id: 'site1', domain: 'new-example.com', sc_url: 'sc-domain:new-example.com' }], undefined);
    vi.mocked(getDb).mockReturnValue(db as never);
    mockFetch(true, SAMPLE_XML);

    const submit = vi.fn().mockResolvedValue({});
    vi.mocked(searchconsole_v1.Searchconsole).mockImplementation(function () {
      return { sitemaps: { submit } };
    } as never);

    await runSitemapSync();

    expect(submit).toHaveBeenCalledWith({
      siteUrl: 'sc-domain:new-example.com',
      feedpath: 'https://new-example.com/sitemap.xml',
    });
    const callArgs = db._stmtRun.run.mock.calls[0][0] as Record<string, unknown>;
    expect(callArgs.content_hash).toBe(hashContent(SAMPLE_XML));
    expect(callArgs.submit_count).toBe(1);
    expect(typeof callArgs.last_submitted_at).toBe('number');
  });

  it('records error and saves state without submitting when SC submit throws', async () => {
    const prevState = {
      content_hash: 'old-hash',
      last_submitted_at: Date.now() - 25 * 60 * 60 * 1000,
      submit_count: 0,
    };
    const db = makeDb([{ id: 'site1', domain: 'example.com', sc_url: null }], prevState);
    vi.mocked(getDb).mockReturnValue(db as never);
    mockFetch(true);

    vi.mocked(searchconsole_v1.Searchconsole).mockImplementation(function () {
      return { sitemaps: { submit: vi.fn().mockRejectedValue(new Error('Quota exceeded')) } };
    } as never);

    await runSitemapSync();

    expect(db._stmtRun.run).toHaveBeenCalledOnce();
    const callArgs = db._stmtRun.run.mock.calls[0][0] as Record<string, unknown>;
    expect(callArgs.submit_count).toBe(0);
  });

  it('constructs sitemapUrl with https:// prefix for bare domain', async () => {
    const db = makeDb([{ id: 'site1', domain: 'mysite.io', sc_url: null }], undefined);
    vi.mocked(getDb).mockReturnValue(db as never);
    mockFetch(true);

    const submit = vi.fn().mockResolvedValue({});
    vi.mocked(searchconsole_v1.Searchconsole).mockImplementation(function () {
      return { sitemaps: { submit } };
    } as never);

    await runSitemapSync();

    expect(fetch).toHaveBeenCalledWith(
      'https://mysite.io/sitemap.xml',
      expect.any(Object),
    );
  });

  it('uses sc_url from db when provided', async () => {
    const db = makeDb([{ id: 'site1', domain: 'mysite.io', sc_url: 'https://mysite.io/' }], undefined);
    vi.mocked(getDb).mockReturnValue(db as never);
    mockFetch(true);

    const submit = vi.fn().mockResolvedValue({});
    vi.mocked(searchconsole_v1.Searchconsole).mockImplementation(function () {
      return { sitemaps: { submit } };
    } as never);

    await runSitemapSync();

    expect(submit).toHaveBeenCalledWith(
      expect.objectContaining({ siteUrl: 'https://mysite.io/' }),
    );
  });
});
