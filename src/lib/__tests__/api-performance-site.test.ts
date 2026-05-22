import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('../performance-site', () => ({
  getPerformanceSiteData: vi.fn(),
}));

import { getPerformanceSiteData } from '../performance-site';
import { GET } from '../../../app/api/performance/[site]/route';

function getReq(url = 'http://localhost/api/performance/borged-io'): NextRequest {
  return new NextRequest(url);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GET /api/performance/[site]', () => {
  it('returns site performance JSON', async () => {
    vi.mocked(getPerformanceSiteData).mockResolvedValueOnce({
      site: { id: 'borged-io', name: 'Borged', domain: 'borged.io' },
      days: 28,
      propertyId: 'prop-1',
      url: 'https://borged.io',
      source: 'rum',
      heroSource: 'RUM (GA4)',
      hasRum: true,
      propagating: false,
      eventCount: 42,
      needsKey: false,
      overall: {},
      byDevice: { mobile: {}, desktop: {}, tablet: {} },
      slowestPages: [],
      trend: [],
      psi: { mobile: null, desktop: null },
    });

    const res = await GET(getReq('http://localhost/api/performance/borged-io?days=28'), {
      params: Promise.resolve({ site: 'borged-io' }),
    });

    expect(res.status).toBe(200);
    expect(vi.mocked(getPerformanceSiteData)).toHaveBeenCalledWith('borged-io', 28);
    expect(await res.json()).toMatchObject({
      site: { id: 'borged-io' },
      days: 28,
      source: 'rum',
    });
  });

  it('normalizes invalid days before calling the data helper', async () => {
    vi.mocked(getPerformanceSiteData).mockResolvedValueOnce({
      site: { id: 'borged-io', name: 'Borged', domain: 'borged.io' },
      days: 7,
      propertyId: '',
      url: 'https://borged.io',
      source: 'none',
      heroSource: 'no data',
      hasRum: false,
      propagating: false,
      eventCount: 0,
      needsKey: false,
      overall: {},
      byDevice: null,
      slowestPages: [],
      trend: [],
      psi: { mobile: null, desktop: null },
    });

    const res = await GET(getReq('http://localhost/api/performance/borged-io?days=abc'), {
      params: Promise.resolve({ site: 'borged-io' }),
    });

    expect(res.status).toBe(200);
    expect(vi.mocked(getPerformanceSiteData)).toHaveBeenCalledWith('borged-io', 7);
  });

  it('returns 404 when the site does not exist', async () => {
    vi.mocked(getPerformanceSiteData).mockResolvedValueOnce(null);

    const res = await GET(getReq(), {
      params: Promise.resolve({ site: 'missing' }),
    });

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'Site not found' });
  });

  it('returns json 500 when the helper throws', async () => {
    vi.mocked(getPerformanceSiteData).mockRejectedValueOnce(new Error('db unavailable'));

    const res = await GET(getReq(), {
      params: Promise.resolve({ site: 'borged-io' }),
    });

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'failed_to_fetch_performance_site_data' });
  });
});
