import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('../sites', () => ({
  getManagedSite: vi.fn(),
  getSCUrl: vi.fn(),
}));

vi.mock('../search-console', () => ({
  cachedGetTopPagesWithQueries: vi.fn(),
}));

vi.mock('../constants', () => ({
  VALID_DAYS: [7, 28, 90],
}));

import { getManagedSite, getSCUrl } from '../sites';
import { cachedGetTopPagesWithQueries } from '../search-console';
import { GET } from '../../../app/api/[site]/page-queries/route';

function getReq(url = 'http://localhost/api/borged-io/page-queries'): NextRequest {
  return new NextRequest(url);
}

const fakeSite = { id: 'borged-io', name: 'Borged', domain: 'borged.io', searchConsole: true };
const fakeData = [
  {
    page: 'https://borged.io/posts/hello',
    clicks: 42,
    impressions: 800,
    ctr: 0.0525,
    position: 4.2,
    queries: [
      { query: 'hello world', clicks: 10, impressions: 200, ctr: 0.05, position: 4.2 },
    ],
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getSCUrl).mockReturnValue('sc-domain:borged.io');
});

describe('GET /api/[site]/page-queries', () => {
  it('returns page query data for a known site', async () => {
    vi.mocked(getManagedSite).mockResolvedValueOnce(fakeSite as any);
    vi.mocked(cachedGetTopPagesWithQueries).mockResolvedValueOnce(fakeData);

    const res = await GET(getReq(), { params: Promise.resolve({ site: 'borged-io' }) });

    expect(res.status).toBe(200);
    expect(vi.mocked(cachedGetTopPagesWithQueries)).toHaveBeenCalledWith('sc-domain:borged.io', 7);
    expect(await res.json()).toEqual({ data: fakeData });
  });

  it('respects the days query param', async () => {
    vi.mocked(getManagedSite).mockResolvedValueOnce(fakeSite as any);
    vi.mocked(cachedGetTopPagesWithQueries).mockResolvedValueOnce(fakeData);

    const res = await GET(getReq('http://localhost/api/borged-io/page-queries?days=28'), {
      params: Promise.resolve({ site: 'borged-io' }),
    });

    expect(res.status).toBe(200);
    expect(vi.mocked(cachedGetTopPagesWithQueries)).toHaveBeenCalledWith('sc-domain:borged.io', 28);
  });

  it('falls back to 7 days for an invalid days param', async () => {
    vi.mocked(getManagedSite).mockResolvedValueOnce(fakeSite as any);
    vi.mocked(cachedGetTopPagesWithQueries).mockResolvedValueOnce([]);

    await GET(getReq('http://localhost/api/borged-io/page-queries?days=999'), {
      params: Promise.resolve({ site: 'borged-io' }),
    });

    expect(vi.mocked(cachedGetTopPagesWithQueries)).toHaveBeenCalledWith('sc-domain:borged.io', 7);
  });

  it('returns 404 when the site does not exist', async () => {
    vi.mocked(getManagedSite).mockResolvedValueOnce(null);

    const res = await GET(getReq(), { params: Promise.resolve({ site: 'missing' }) });

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'Site not found' });
  });

  it('returns empty data when site has no Search Console config', async () => {
    vi.mocked(getManagedSite).mockResolvedValueOnce({ ...fakeSite, searchConsole: false } as any);

    const res = await GET(getReq(), { params: Promise.resolve({ site: 'borged-io' }) });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ data: [] });
    expect(vi.mocked(cachedGetTopPagesWithQueries)).not.toHaveBeenCalled();
  });

  it('returns empty array when lib returns null', async () => {
    vi.mocked(getManagedSite).mockResolvedValueOnce(fakeSite as any);
    vi.mocked(cachedGetTopPagesWithQueries).mockResolvedValueOnce(null);

    const res = await GET(getReq(), { params: Promise.resolve({ site: 'borged-io' }) });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ data: [] });
  });

  it('returns 500 when the lib throws', async () => {
    vi.mocked(getManagedSite).mockResolvedValueOnce(fakeSite as any);
    vi.mocked(cachedGetTopPagesWithQueries).mockRejectedValueOnce(new Error('SC unavailable'));

    const res = await GET(getReq(), { params: Promise.resolve({ site: 'borged-io' }) });

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'failed_to_fetch_page_queries' });
  });
});
