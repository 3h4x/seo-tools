import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const {
  mockGetManagedSites,
  mockGetSCUrl,
  mockCachedGetKeywordOpportunities,
} = vi.hoisted(() => ({
  mockGetManagedSites: vi.fn(),
  mockGetSCUrl: vi.fn(),
  mockCachedGetKeywordOpportunities: vi.fn(),
}));

vi.mock('@/lib/sites', () => ({
  getManagedSites: mockGetManagedSites,
  getSCUrl: mockGetSCUrl,
}));

vi.mock('next/server', () => ({
  NextRequest: class NextRequest extends Request {
    nextUrl: URL;

    constructor(input: string | URL | Request, init?: RequestInit) {
      super(input, init);
      this.nextUrl = new URL(this.url);
    }
  },
  NextResponse: {
    json: (body: unknown, init?: ResponseInit) =>
      new Response(JSON.stringify(body), {
        status: init?.status ?? 200,
        headers: { 'content-type': 'application/json' },
      }),
  },
}));

vi.mock('@/lib/opportunities', () => ({
  OPPORTUNITIES_DEFAULT_DAYS: 28,
  OPPORTUNITIES_VALID_DAYS: [7, 28, 90],
  cachedGetKeywordOpportunities: mockCachedGetKeywordOpportunities,
}));

import { GET } from '../../../app/api/opportunities/route';

beforeEach(() => {
  vi.clearAllMocks();
  mockGetManagedSites.mockResolvedValue([
    { id: 'site-a', name: 'Site A', domain: 'a.test', searchConsole: true, testPages: ['/'] },
    { id: 'site-b', name: 'Site B', domain: 'b.test', searchConsole: false, testPages: ['/'] },
  ]);
  mockGetSCUrl.mockImplementation((site: { domain: string }) => `sc-domain:${site.domain}`);
  mockCachedGetKeywordOpportunities.mockResolvedValue([]);
});

function req(days: string): NextRequest {
  return new NextRequest(`http://localhost/api/opportunities?days=${days}`);
}

describe('GET /api/opportunities', () => {
  it('falls back to the selectable 28-day default for invalid days', async () => {
    const res = await GET(req('365'));

    expect(res.status).toBe(200);
    expect(mockCachedGetKeywordOpportunities).toHaveBeenCalledWith('sc-domain:a.test', 'site-a', 28);
    expect(mockCachedGetKeywordOpportunities).toHaveBeenCalledTimes(1);
  });

  it('accepts supported opportunities ranges', async () => {
    await GET(req('90'));

    expect(mockCachedGetKeywordOpportunities).toHaveBeenCalledWith('sc-domain:a.test', 'site-a', 90);
  });

  it('returns an empty opportunity list for a site when its provider call fails', async () => {
    mockGetManagedSites.mockResolvedValue([
      { id: 'site-a', name: 'Site A', domain: 'a.test', searchConsole: true, testPages: ['/'] },
      { id: 'site-b', name: 'Site B', domain: 'b.test', searchConsole: true, testPages: ['/'] },
    ]);
    mockCachedGetKeywordOpportunities
      .mockResolvedValueOnce([{ query: 'ok' }])
      .mockRejectedValueOnce(new Error('Search Console timeout'));

    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    const res = await GET(req('28'));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([
      {
        siteId: 'site-a',
        domain: 'a.test',
        opportunities: [{ query: 'ok' }],
      },
      {
        siteId: 'site-b',
        domain: 'b.test',
        opportunities: [],
      },
    ]);
    expect(consoleError).toHaveBeenCalledWith(
      '[GET /api/opportunities]',
      'site-b',
      expect.any(Error),
    );
  });

  it('returns a JSON 500 when the managed sites list cannot be loaded', async () => {
    mockGetManagedSites.mockRejectedValueOnce(new Error('sites table unavailable'));
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    const res = await GET(req('28'));

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'failed_to_load_sites' });
    expect(consoleError).toHaveBeenCalledWith('[GET /api/opportunities] load sites', expect.any(Error));
    expect(mockCachedGetKeywordOpportunities).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });
});
