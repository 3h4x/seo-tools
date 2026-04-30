import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../google-auth', () => ({
  getAuth: vi.fn(),
}));
vi.mock('../db', () => ({
  dbGetSites: vi.fn(),
}));
vi.mock('@googleapis/searchconsole', () => ({
  searchconsole_v1: {
    Searchconsole: vi.fn(),
  },
}));
vi.mock('@google-analytics/admin', () => ({
  AnalyticsAdminServiceClient: vi.fn(),
}));

import { getAuth } from '../google-auth';
import { dbGetSites } from '../db';
import { searchconsole_v1 } from '@googleapis/searchconsole';
import { AnalyticsAdminServiceClient } from '@google-analytics/admin';
import { GET } from '../../../app/api/sites/discover/route';
import { NextRequest } from 'next/server';

function getReq(url = 'http://localhost/api/sites/discover'): NextRequest {
  return new NextRequest(url);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getAuth).mockReturnValue({} as never);
  vi.mocked(dbGetSites).mockReturnValue([] as never);
});

function mockSc(domains: string[]) {
  const list = vi.fn().mockResolvedValue({
    data: {
      siteEntry: domains.map(d => ({
        siteUrl: d.startsWith('sc-domain:') ? d : `sc-domain:${d}`,
      })),
    },
  });
  // Must use function keyword — arrow functions are not valid constructors
  vi.mocked(searchconsole_v1.Searchconsole).mockImplementation(function () {
    return { sites: { list } };
  } as never);
  return list;
}

function mockGa4(properties: Array<{ displayName: string; property: string }>) {
  vi.mocked(AnalyticsAdminServiceClient).mockImplementation(function () {
    return {
      listAccountSummaries: vi.fn().mockResolvedValue([
        [{ propertySummaries: properties }],
      ]),
    };
  } as never);
}

describe('GET /api/sites/discover', () => {
  it('returns 400 when getAuth throws (no SA key configured)', async () => {
    vi.mocked(getAuth).mockImplementation(() => { throw new Error('No key'); });

    const res = await GET(getReq());
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('No SA key configured');
  });

  it('returns 500 when SC API call fails', async () => {
    vi.mocked(searchconsole_v1.Searchconsole).mockImplementation(function () {
      return { sites: { list: vi.fn().mockRejectedValue(new Error('Quota exceeded')) } };
    } as never);
    mockGa4([]);

    const res = await GET(getReq());
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toContain('SC API error');
    expect(body.error).toContain('Quota exceeded');
  });

  it('returns proposed sites for SC domains not in DB', async () => {
    mockSc(['example.com', 'another.com']);
    mockGa4([]);

    const res = await GET(getReq());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(2);
    expect(body.map((s: { domain: string }) => s.domain)).toContain('example.com');
    expect(body.map((s: { domain: string }) => s.domain)).toContain('another.com');
  });

  it('excludes domains already in DB (case-insensitive)', async () => {
    vi.mocked(dbGetSites).mockReturnValue([
      { id: 'existing', name: 'Existing', domain: 'EXAMPLE.COM', testPages: [] },
    ] as never);
    mockSc(['example.com', 'new-site.com']);
    mockGa4([]);

    const res = await GET(getReq());
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0].domain).toBe('new-site.com');
  });

  it('strips sc-domain: prefix from returned SC sites', async () => {
    mockSc(['sc-domain:example.com']);
    mockGa4([]);

    const res = await GET(getReq());
    const body = await res.json();
    expect(body[0].domain).toBe('example.com');
    expect(body[0].domain).not.toContain('sc-domain:');
  });

  it('matches GA4 property by domain substring in display name', async () => {
    mockSc(['mysite.com']);
    mockGa4([{ displayName: 'mysite.com - GA4', property: 'properties/123456' }]);

    const res = await GET(getReq());
    const body = await res.json();
    expect(body[0].ga4PropertyId).toBe('123456');
  });

  it('leaves ga4PropertyId undefined when no GA4 match', async () => {
    mockSc(['mysite.com']);
    mockGa4([{ displayName: 'unrelated project', property: 'properties/999' }]);

    const res = await GET(getReq());
    const body = await res.json();
    expect(body[0].ga4PropertyId).toBeUndefined();
  });

  it('proceeds without GA4 when admin API throws', async () => {
    mockSc(['mysite.com']);
    vi.mocked(AnalyticsAdminServiceClient).mockImplementation(function () {
      return {
        listAccountSummaries: vi.fn().mockRejectedValue(new Error('Admin API failed')),
      };
    } as never);

    const res = await GET(getReq());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0].ga4PropertyId).toBeUndefined();
  });

  it('slugifies domain for id field', async () => {
    mockSc(['my.site.com']);
    mockGa4([]);

    const res = await GET(getReq());
    const body = await res.json();
    expect(body[0].id).toBe('my-site-com');
  });

  it('sets searchConsole: true on all proposed sites', async () => {
    mockSc(['example.com']);
    mockGa4([]);

    const res = await GET(getReq());
    const body = await res.json();
    expect(body[0].searchConsole).toBe(true);
  });

  it('returns raw GA4 property map when ga4debug param is present', async () => {
    mockSc([]);
    mockGa4([{ displayName: 'my project', property: 'properties/42' }]);

    const res = await GET(getReq('http://localhost/api/sites/discover?ga4debug'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('my project', '42');
  });

  it('returns empty array when SC has no sites', async () => {
    vi.mocked(searchconsole_v1.Searchconsole).mockImplementation(function () {
      return { sites: { list: vi.fn().mockResolvedValue({ data: { siteEntry: [] } }) } };
    } as never);
    mockGa4([]);

    const res = await GET(getReq());
    const body = await res.json();
    expect(body).toEqual([]);
  });

  it('handles SC siteEntry: null gracefully', async () => {
    vi.mocked(searchconsole_v1.Searchconsole).mockImplementation(function () {
      return { sites: { list: vi.fn().mockResolvedValue({ data: {} }) } };
    } as never);
    mockGa4([]);

    const res = await GET(getReq());
    const body = await res.json();
    expect(body).toEqual([]);
  });
});
