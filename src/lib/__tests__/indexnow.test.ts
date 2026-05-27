import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  checkIndexNowKey,
  collectSiteIndexNowUrls,
  getIndexNowKeyLocation,
  submitIndexNowForSite,
} from '../indexnow.js';

type FetchResponse = {
  ok: boolean;
  status: number;
  text: () => Promise<string>;
};

function makeResponse(body: string, init: { ok?: boolean; status?: number } = {}): FetchResponse {
  const status = init.status ?? 200;
  return {
    ok: init.ok ?? (status >= 200 && status < 300),
    status,
    text: async () => body,
  };
}

const baseSite = {
  id: 'site-a',
  domain: 'example.com',
  indexNowKey: 'abc123',
};

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('getIndexNowKeyLocation', () => {
  it('builds https URL when domain has no protocol', () => {
    expect(getIndexNowKeyLocation(baseSite)).toBe('https://example.com/abc123.txt');
  });

  it('preserves http protocol when domain already includes scheme', () => {
    expect(getIndexNowKeyLocation({ ...baseSite, domain: 'http://example.com' }))
      .toBe('http://example.com/abc123.txt');
  });

  it('strips trailing slash from domain origin', () => {
    expect(getIndexNowKeyLocation({ ...baseSite, domain: 'https://example.com/' }))
      .toBe('https://example.com/abc123.txt');
  });
});

describe('checkIndexNowKey', () => {
  it('returns warn when no key is configured', async () => {
    const result = await checkIndexNowKey({ ...baseSite, indexNowKey: '' });
    expect(result.status).toBe('warn');
    expect(result.message).toBe('No IndexNow key configured');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns fail when key file is unreachable', async () => {
    fetchMock.mockResolvedValueOnce(makeResponse('not found', { ok: false, status: 404 }));
    const result = await checkIndexNowKey(baseSite);
    expect(result.status).toBe('fail');
    expect(result.message).toBe('Key file unreachable (404)');
    expect(result.details).toContain('https://example.com/abc123.txt');
  });

  it('returns fail when key file contents do not match', async () => {
    fetchMock.mockResolvedValueOnce(makeResponse('different-key'));
    const result = await checkIndexNowKey(baseSite);
    expect(result.status).toBe('fail');
    expect(result.message).toBe('Key file contents do not match configured key');
  });

  it('returns pass when key matches (with surrounding whitespace tolerated)', async () => {
    fetchMock.mockResolvedValueOnce(makeResponse('  abc123\n'));
    const result = await checkIndexNowKey(baseSite);
    expect(result.status).toBe('pass');
    expect(result.details).toBe('https://example.com/abc123.txt');
  });

  it('returns error when fetch throws', async () => {
    fetchMock.mockRejectedValueOnce(new Error('network down'));
    const result = await checkIndexNowKey(baseSite);
    expect(result.status).toBe('error');
    expect(result.message).toBe('Key file verification failed');
    expect(result.details).toBe('network down');
  });
});

describe('collectSiteIndexNowUrls', () => {
  it('uses sitemap from robots.txt Sitemap directive', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url === 'https://example.com/robots.txt') {
        return makeResponse('User-agent: *\nSitemap: https://example.com/custom-sitemap.xml\n');
      }
      if (url === 'https://example.com/custom-sitemap.xml') {
        return makeResponse('<urlset><url><loc>https://example.com/a</loc></url></urlset>');
      }
      throw new Error(`unexpected ${url}`);
    });

    const result = await collectSiteIndexNowUrls(baseSite);
    expect(result.sitemapUrl).toBe('https://example.com/custom-sitemap.xml');
    expect(result.urls).toEqual(['https://example.com/a']);
    expect(result.totalUrls).toBe(1);
    expect(result.truncated).toBe(false);
  });

  it('falls back to /sitemap.xml when robots.txt fetch throws', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url === 'https://example.com/robots.txt') {
        throw new Error('refused');
      }
      if (url === 'https://example.com/sitemap.xml') {
        return makeResponse('<urlset><url><loc>https://example.com/a</loc></url></urlset>');
      }
      throw new Error(`unexpected ${url}`);
    });

    const result = await collectSiteIndexNowUrls(baseSite);
    expect(result.sitemapUrl).toBe('https://example.com/sitemap.xml');
    expect(result.urls).toEqual(['https://example.com/a']);
  });

  it('falls back to /sitemap.xml when robots.txt has no Sitemap directive', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url === 'https://example.com/robots.txt') {
        return makeResponse('User-agent: *\nDisallow:\n');
      }
      if (url === 'https://example.com/sitemap.xml') {
        return makeResponse('<urlset><url><loc>https://example.com/x</loc></url></urlset>');
      }
      throw new Error(`unexpected ${url}`);
    });

    const result = await collectSiteIndexNowUrls(baseSite);
    expect(result.sitemapUrl).toBe('https://example.com/sitemap.xml');
    expect(result.urls).toEqual(['https://example.com/x']);
  });

  it('follows sitemap index entries and dedupes URLs', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url === 'https://example.com/robots.txt') {
        return makeResponse('Sitemap: https://example.com/sitemap-index.xml');
      }
      if (url === 'https://example.com/sitemap-index.xml') {
        return makeResponse(
          '<sitemapindex>' +
            '<sitemap><loc>https://example.com/s1.xml</loc></sitemap>' +
            '<sitemap><loc>https://example.com/s2.xml</loc></sitemap>' +
          '</sitemapindex>',
        );
      }
      if (url === 'https://example.com/s1.xml') {
        return makeResponse('<urlset><url><loc>https://example.com/a</loc></url><url><loc>https://example.com/b</loc></url></urlset>');
      }
      if (url === 'https://example.com/s2.xml') {
        return makeResponse('<urlset><url><loc>https://example.com/b</loc></url><url><loc>https://example.com/c</loc></url></urlset>');
      }
      throw new Error(`unexpected ${url}`);
    });

    const result = await collectSiteIndexNowUrls(baseSite);
    expect(result.urls.sort()).toEqual(['https://example.com/a', 'https://example.com/b', 'https://example.com/c']);
    expect(result.totalUrls).toBe(3);
    expect(result.truncated).toBe(false);
  });

  it('throws when sitemap fetch fails', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url === 'https://example.com/robots.txt') return makeResponse('', { ok: false, status: 404 });
      if (url === 'https://example.com/sitemap.xml') return makeResponse('', { ok: false, status: 500 });
      throw new Error(`unexpected ${url}`);
    });

    await expect(collectSiteIndexNowUrls(baseSite)).rejects.toThrow('Sitemap fetch failed (500)');
  });

  it('does not revisit a sitemap URL already seen (cycle protection)', async () => {
    let s1Calls = 0;
    fetchMock.mockImplementation(async (url: string) => {
      if (url === 'https://example.com/robots.txt') {
        return makeResponse('Sitemap: https://example.com/index.xml');
      }
      if (url === 'https://example.com/index.xml') {
        return makeResponse(
          '<sitemapindex>' +
            '<sitemap><loc>https://example.com/s1.xml</loc></sitemap>' +
            '<sitemap><loc>https://example.com/s1.xml</loc></sitemap>' +
          '</sitemapindex>',
        );
      }
      if (url === 'https://example.com/s1.xml') {
        s1Calls++;
        return makeResponse('<urlset><url><loc>https://example.com/a</loc></url></urlset>');
      }
      throw new Error(`unexpected ${url}`);
    });

    const result = await collectSiteIndexNowUrls(baseSite);
    expect(s1Calls).toBe(1);
    expect(result.urls).toEqual(['https://example.com/a']);
  });
});

describe('submitIndexNowForSite', () => {
  it('throws when site has no IndexNow key', async () => {
    await expect(submitIndexNowForSite({ ...baseSite, indexNowKey: '' }))
      .rejects.toThrow('No IndexNow key configured for this site');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('throws when sitemap has no URLs', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url === 'https://example.com/robots.txt') return makeResponse('Sitemap: https://example.com/empty.xml');
      if (url === 'https://example.com/empty.xml') return makeResponse('<urlset></urlset>');
      throw new Error(`unexpected ${url}`);
    });

    await expect(submitIndexNowForSite(baseSite))
      .rejects.toThrow('No URLs found in sitemap https://example.com/empty.xml');
  });

  it('POSTs collected URLs to IndexNow and returns submission summary', async () => {
    fetchMock.mockImplementation(async (url: string, init?: { method?: string; body?: string }) => {
      if (url === 'https://example.com/robots.txt') return makeResponse('Sitemap: https://example.com/sitemap.xml');
      if (url === 'https://example.com/sitemap.xml') {
        return makeResponse('<urlset><url><loc>https://example.com/a</loc></url><url><loc>https://example.com/b</loc></url></urlset>');
      }
      if (url === 'https://api.indexnow.org/indexnow') {
        expect(init?.method).toBe('POST');
        const payload = JSON.parse(init!.body!);
        expect(payload).toEqual({
          host: 'example.com',
          key: 'abc123',
          keyLocation: 'https://example.com/abc123.txt',
          urlList: ['https://example.com/a', 'https://example.com/b'],
        });
        return makeResponse('', { ok: true, status: 200 });
      }
      throw new Error(`unexpected ${url}`);
    });

    const result = await submitIndexNowForSite(baseSite);
    expect(result).toEqual({
      sitemapUrl: 'https://example.com/sitemap.xml',
      submittedCount: 2,
      totalUrls: 2,
      truncated: false,
      keyLocation: 'https://example.com/abc123.txt',
    });
  });

  it('includes server-provided error body in thrown message when IndexNow rejects', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url === 'https://example.com/robots.txt') return makeResponse('Sitemap: https://example.com/sitemap.xml');
      if (url === 'https://example.com/sitemap.xml') {
        return makeResponse('<urlset><url><loc>https://example.com/a</loc></url></urlset>');
      }
      if (url === 'https://api.indexnow.org/indexnow') {
        return makeResponse('  host mismatch  ', { ok: false, status: 422 });
      }
      throw new Error(`unexpected ${url}`);
    });

    await expect(submitIndexNowForSite(baseSite))
      .rejects.toThrow('IndexNow rejected the submission (422): host mismatch');
  });

  it('omits empty server body from the rejection message', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url === 'https://example.com/robots.txt') return makeResponse('Sitemap: https://example.com/sitemap.xml');
      if (url === 'https://example.com/sitemap.xml') {
        return makeResponse('<urlset><url><loc>https://example.com/a</loc></url></urlset>');
      }
      if (url === 'https://api.indexnow.org/indexnow') {
        return makeResponse('', { ok: false, status: 503 });
      }
      throw new Error(`unexpected ${url}`);
    });

    await expect(submitIndexNowForSite(baseSite))
      .rejects.toThrow(/^IndexNow rejected the submission \(503\)$/);
  });
});
