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

vi.mock('@/lib/opportunities', async () => {
  const actual = await vi.importActual<typeof import('../opportunities')>('../opportunities');
  return {
    ...actual,
    cachedGetKeywordOpportunities: mockCachedGetKeywordOpportunities,
  };
});

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
});
