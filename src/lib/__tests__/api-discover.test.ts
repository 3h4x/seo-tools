import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../google-auth', () => ({
  getAuth: vi.fn(),
}));
vi.mock('../db', () => ({
  dbGetSites: vi.fn(),
}));
vi.mock('../ga4', () => ({
  cachedGetDiscoveredGa4Properties: vi.fn(),
}));
vi.mock('@googleapis/searchconsole', () => ({
  searchconsole_v1: {
    Searchconsole: vi.fn(),
  },
}));

import { getAuth } from '../google-auth';
import { dbGetSites } from '../db';
import { cachedGetDiscoveredGa4Properties } from '../ga4';
import { searchconsole_v1 } from '@googleapis/searchconsole';
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
  vi.mocked(cachedGetDiscoveredGa4Properties).mockResolvedValue(
    properties.map(({ displayName, property }) => ({
      displayName,
      propertyId: property.replace(/^properties\//, ''),
    })) as never,
  );
}

describe('GET /api/sites/discover', () => {
  it('returns 400 when getAuth throws (no SA key configured)', async () => {
    vi.mocked(getAuth).mockImplementation(() => { throw new Error('No key'); });

    const res = await GET(getReq());
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('No SA key configured');
  });

  it('returns a JSON 500 when loading existing sites throws', async () => {
    vi.mocked(dbGetSites).mockImplementation(() => {
      throw new Error('sites table unavailable');
    });
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    const res = await GET(getReq());

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'failed_to_load_existing_sites' });
    expect(consoleError).toHaveBeenCalledWith(
      '[GET /api/sites/discover] load sites',
      expect.any(Error),
    );
    consoleError.mockRestore();
  });

  it('returns 500 with a sanitized error when SC API call fails', async () => {
    vi.mocked(searchconsole_v1.Searchconsole).mockImplementation(function () {
      return { sites: { list: vi.fn().mockRejectedValue(new Error('Quota exceeded for project foo@bar.iam.gserviceaccount.com')) } };
    } as never);
    mockGa4([]);
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    const res = await GET(getReq());
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toEqual({ error: 'search_console_api_failed' });
    expect(JSON.stringify(body)).not.toContain('Quota exceeded');
    expect(JSON.stringify(body)).not.toContain('iam.gserviceaccount.com');
    expect(consoleError).toHaveBeenCalledWith(
      '[GET /api/sites/discover] SC API error',
      expect.any(Error),
    );
    consoleError.mockRestore();
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

  it('matches GA4 property when the display name starts with the domain and a GA4 descriptor', async () => {
    mockSc(['mysite.com']);
    mockGa4([{ displayName: 'mysite.com - GA4', property: 'properties/123456' }]);

    const res = await GET(getReq());
    const body = await res.json();
    expect(body[0].ga4PropertyId).toBe('properties/123456');
    expect(body[0].ga4DisplayName).toBe('mysite.com - GA4');
    expect(body[0].discoverySource).toBe('sc+ga4');
  });

  it('still auto-assigns a GA4 property for an approved www host variant', async () => {
    mockSc(['www.mysite.com']);
    mockGa4([{ displayName: 'mysite.com', property: 'properties/123456' }]);

    const res = await GET(getReq());
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0].ga4PropertyId).toBe('properties/123456');
    expect(body[0].ga4DisplayName).toBe('mysite.com');
    expect(body[0].discoverySource).toBe('sc+ga4');
  });

  it('does not create a duplicate GA4-only candidate for the reverse www host variant', async () => {
    mockSc(['mysite.com']);
    mockGa4([{ displayName: 'www.mysite.com', property: 'properties/123456' }]);

    const res = await GET(getReq());
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0]).toMatchObject({
      domain: 'mysite.com',
      ga4PropertyId: 'properties/123456',
      ga4DisplayName: 'www.mysite.com',
      discoverySource: 'sc+ga4',
    });
  });

  it('does not propose a GA4-only candidate for an existing site www host variant', async () => {
    vi.mocked(dbGetSites).mockReturnValue([
      { id: 'mysite-com', name: 'My Site', domain: 'mysite.com', testPages: ['/'], ga4PropertyId: 'properties/999' },
    ] as never);
    mockSc([]);
    mockGa4([{ displayName: 'www.mysite.com', property: 'properties/123456' }]);

    const res = await GET(getReq());
    const body = await res.json();
    expect(body).toEqual([]);
  });

  it('includes GA4-only properties as discovery candidates when the display name is an exact domain', async () => {
    mockSc([]);
    mockGa4([{ displayName: 'analytics-only.example.com', property: 'properties/555' }]);

    const res = await GET(getReq());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0]).toMatchObject({
      id: 'analytics-only-example-com',
      name: 'analytics-only.example.com',
      domain: 'analytics-only.example.com',
      searchConsole: false,
      ga4PropertyId: 'properties/555',
      ga4DisplayName: 'analytics-only.example.com',
      discoverySource: 'ga4',
    });
  });

  it('keeps a single SC-derived candidate when GA4 has the same exact-domain property name', async () => {
    mockSc(['example.com']);
    mockGa4([{ displayName: 'example.com', property: 'properties/555' }]);

    const res = await GET(getReq());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0]).toMatchObject({
      id: 'example-com',
      name: 'example.com',
      domain: 'example.com',
      searchConsole: true,
      ga4PropertyId: 'properties/555',
      ga4DisplayName: 'example.com',
      discoverySource: 'sc+ga4',
    });
  });

  it('keeps distinct candidates when different domains slugify to the same id', async () => {
    mockSc(['a.b-c.com', 'a-b.c.com']);
    mockGa4([]);

    const res = await GET(getReq());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(2);
    expect(body).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'a-b-c-com',
        domain: 'a.b-c.com',
        searchConsole: true,
      }),
      expect.objectContaining({
        id: 'a-b-c-com-2',
        domain: 'a-b.c.com',
        searchConsole: true,
      }),
    ]));
  });

  it('assigns a unique id when an SC-discovered candidate collides with an existing site id', async () => {
    vi.mocked(dbGetSites).mockReturnValue([
      { id: 'analytics-only-example-com', name: 'Existing', domain: 'existing.com', testPages: [] },
    ] as never);
    mockSc(['analytics-only.example.com']);
    mockGa4([]);

    const res = await GET(getReq());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0]).toMatchObject({
      id: 'analytics-only-example-com-2',
      domain: 'analytics-only.example.com',
      searchConsole: true,
      discoverySource: 'sc',
    });
  });

  it('assigns a unique id when a GA4-only candidate collides with an existing site id', async () => {
    vi.mocked(dbGetSites).mockReturnValue([
      { id: 'analytics-only-example-com', name: 'Existing', domain: 'existing.com', testPages: [] },
    ] as never);
    mockSc([]);
    mockGa4([{ displayName: 'analytics-only.example.com', property: 'properties/555' }]);

    const res = await GET(getReq());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0]).toMatchObject({
      id: 'analytics-only-example-com-2',
      domain: 'analytics-only.example.com',
      searchConsole: false,
      ga4PropertyId: 'properties/555',
      discoverySource: 'ga4',
    });
  });

  it('does not create GA4-only candidates from descriptive display names', async () => {
    mockSc([]);
    mockGa4([{ displayName: 'analytics-only.example.com GA4', property: 'properties/555' }]);

    const res = await GET(getReq());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual([]);
  });

  it('excludes GA4-only properties when an existing site already owns the URL-prefix SC identity', async () => {
    vi.mocked(dbGetSites).mockReturnValue([
      { id: 'existing', name: 'Existing', domain: 'other.example.com', scUrl: 'https://analytics-only.example.com/', testPages: [] },
    ] as never);
    mockSc([]);
    mockGa4([{ displayName: 'analytics-only.example.com', property: 'properties/555' }]);

    const res = await GET(getReq());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual([]);
  });

  it('excludes GA4-only properties when an existing site already owns the sc-domain identity', async () => {
    vi.mocked(dbGetSites).mockReturnValue([
      { id: 'existing', name: 'Existing', domain: 'other.example.com', scUrl: 'sc-domain:analytics-only.example.com', testPages: [] },
    ] as never);
    mockSc([]);
    mockGa4([{ displayName: 'analytics-only.example.com', property: 'properties/555' }]);

    const res = await GET(getReq());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual([]);
  });

  it('does not fan out one GA4 property into multiple GA4-only site candidates', async () => {
    mockSc([]);
    mockGa4([{ displayName: 'alpha.example.com / beta.example.com', property: 'properties/555' }]);

    const res = await GET(getReq());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual([]);
  });

  it('does not create a GA4-only candidate when multiple exact-domain properties match the same domain', async () => {
    mockSc([]);
    mockGa4([
      { displayName: 'analytics-only.example.com', property: 'properties/555' },
      { displayName: 'analytics-only.example.com', property: 'properties/777' },
    ]);

    const res = await GET(getReq());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual([]);
  });

  it('matches GA4 property when SC returns a URL-prefix property', async () => {
    vi.mocked(searchconsole_v1.Searchconsole).mockImplementation(function () {
      return {
        sites: {
          list: vi.fn().mockResolvedValue({
            data: {
              siteEntry: [{ siteUrl: 'https://blog.example.com/' }],
            },
          }),
        },
      };
    } as never);
    mockGa4([{ displayName: 'blog.example.com web', property: 'properties/654321' }]);

    const res = await GET(getReq());
    const body = await res.json();
    expect(body[0].domain).toBe('blog.example.com');
    expect(body[0].scUrl).toBe('https://blog.example.com/');
    expect(body[0].ga4PropertyId).toBe('properties/654321');
  });

  it('dedupes domain and URL-prefix properties for the same hostname', async () => {
    vi.mocked(searchconsole_v1.Searchconsole).mockImplementation(function () {
      return {
        sites: {
          list: vi.fn().mockResolvedValue({
            data: {
              siteEntry: [
                { siteUrl: 'https://example.com/' },
                { siteUrl: 'sc-domain:example.com' },
              ],
            },
          }),
        },
      };
    } as never);
    mockGa4([{ displayName: 'example.com GA4', property: 'properties/123' }]);

    const res = await GET(getReq());
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0]).toMatchObject({
      id: 'example-com',
      domain: 'example.com',
      ga4PropertyId: 'properties/123',
    });
    expect(body[0].scUrl).toBeUndefined();
  });

  it('excludes URL-prefix properties when the normalized hostname already exists', async () => {
    vi.mocked(dbGetSites).mockReturnValue([
      { id: 'blog-example-com', name: 'Blog', domain: 'blog.example.com', testPages: [] },
    ] as never);
    vi.mocked(searchconsole_v1.Searchconsole).mockImplementation(function () {
      return {
        sites: {
          list: vi.fn().mockResolvedValue({
            data: {
              siteEntry: [{ siteUrl: 'https://blog.example.com/' }],
            },
          }),
        },
      };
    } as never);
    mockGa4([]);

    const res = await GET(getReq());
    const body = await res.json();
    expect(body).toEqual([]);
  });

  it('excludes URL-prefix properties when the SC URL already exists', async () => {
    vi.mocked(dbGetSites).mockReturnValue([
      { id: 'blog', name: 'Blog', domain: 'other.example.com', scUrl: 'https://blog.example.com/', testPages: [] },
    ] as never);
    vi.mocked(searchconsole_v1.Searchconsole).mockImplementation(function () {
      return {
        sites: {
          list: vi.fn().mockResolvedValue({
            data: {
              siteEntry: [{ siteUrl: 'https://blog.example.com/' }],
            },
          }),
        },
      };
    } as never);
    mockGa4([]);

    const res = await GET(getReq());
    const body = await res.json();
    expect(body).toEqual([]);
  });

  it('excludes a hostname when any deduped SC identity already exists', async () => {
    vi.mocked(dbGetSites).mockReturnValue([
      { id: 'blog', name: 'Blog', domain: 'other.example.com', scUrl: 'https://blog.example.com/', testPages: [] },
    ] as never);
    vi.mocked(searchconsole_v1.Searchconsole).mockImplementation(function () {
      return {
        sites: {
          list: vi.fn().mockResolvedValue({
            data: {
              siteEntry: [
                { siteUrl: 'https://blog.example.com/' },
                { siteUrl: 'sc-domain:blog.example.com' },
              ],
            },
          }),
        },
      };
    } as never);
    mockGa4([]);

    const res = await GET(getReq());
    const body = await res.json();
    expect(body).toEqual([]);
  });

  it('excludes URL-prefix properties when a legacy URL domain already exists', async () => {
    vi.mocked(dbGetSites).mockReturnValue([
      { id: 'blog', name: 'Blog', domain: 'https://blog.example.com/', testPages: [] },
    ] as never);
    vi.mocked(searchconsole_v1.Searchconsole).mockImplementation(function () {
      return {
        sites: {
          list: vi.fn().mockResolvedValue({
            data: {
              siteEntry: [{ siteUrl: 'https://blog.example.com/' }],
            },
          }),
        },
      };
    } as never);
    mockGa4([]);

    const res = await GET(getReq());
    const body = await res.json();
    expect(body).toEqual([]);
  });

  it('excludes a hostname when a legacy URL domain matches any deduped SC identity', async () => {
    vi.mocked(dbGetSites).mockReturnValue([
      { id: 'blog', name: 'Blog', domain: 'https://blog.example.com/', testPages: [] },
    ] as never);
    vi.mocked(searchconsole_v1.Searchconsole).mockImplementation(function () {
      return {
        sites: {
          list: vi.fn().mockResolvedValue({
            data: {
              siteEntry: [
                { siteUrl: 'https://blog.example.com/' },
                { siteUrl: 'sc-domain:blog.example.com' },
              ],
            },
          }),
        },
      };
    } as never);
    mockGa4([]);

    const res = await GET(getReq());
    const body = await res.json();
    expect(body).toEqual([]);
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
    vi.mocked(cachedGetDiscoveredGa4Properties).mockRejectedValue(new Error('Admin API failed') as never);
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    const res = await GET(getReq());
    expect(res.status).toBe(200);
    expect(res.headers.get('x-seo-tools-discovery-warning')).toBe('ga4_admin_api_failed');
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0].ga4PropertyId).toBeUndefined();
    expect(consoleError).toHaveBeenCalledWith(
      '[GET /api/sites/discover] GA4 Admin API error',
      expect.any(Error),
    );
    consoleError.mockRestore();
  });

  it('warns when GA4 discovery resolves null after an admin API failure', async () => {
    mockSc(['mysite.com']);
    vi.mocked(cachedGetDiscoveredGa4Properties).mockResolvedValue(null as never);

    const res = await GET(getReq());
    expect(res.status).toBe(200);
    expect(res.headers.get('x-seo-tools-discovery-warning')).toBe('ga4_admin_api_failed');
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0].ga4PropertyId).toBeUndefined();
  });

  it('warns on ga4debug when GA4 discovery resolves null', async () => {
    mockSc([]);
    vi.mocked(cachedGetDiscoveredGa4Properties).mockResolvedValue(null as never);

    const res = await GET(getReq('http://localhost/api/sites/discover?ga4debug'));
    expect(res.status).toBe(200);
    expect(res.headers.get('x-seo-tools-discovery-warning')).toBe('ga4_admin_api_failed');
    expect(await res.json()).toEqual({});
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

  it('filters blank SC site URLs from the proposed site list', async () => {
    vi.mocked(searchconsole_v1.Searchconsole).mockImplementation(function () {
      return {
        sites: {
          list: vi.fn().mockResolvedValue({
            data: {
              siteEntry: [{ siteUrl: '' }, { siteUrl: 'sc-domain:valid-site.com' }],
            },
          }),
        },
      };
    } as never);
    mockGa4([]);

    const res = await GET(getReq());
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0].domain).toBe('valid-site.com');
  });

  it('ignores GA4 properties without a parsed property id', async () => {
    mockSc(['mysite.com']);
    mockGa4([
      { displayName: 'mysite.com', property: 'properties/' },
      { displayName: 'mysite.com analytics', property: 'properties/321' },
    ]);

    const res = await GET(getReq('http://localhost/api/sites/discover?ga4debug'));
    const body = await res.json();
    expect(body).not.toHaveProperty('mysite.com');
    expect(body).toHaveProperty('mysite.com analytics', '321');
  });

  it('backfills existing site missing GA4 when a match is found', async () => {
    vi.mocked(dbGetSites).mockReturnValue([
      { id: 'mysite-com', name: 'My Site', domain: 'mysite.com', testPages: ['/'], ga4PropertyId: undefined },
    ] as never);
    mockSc([]); // already in DB, won't appear in proposed
    mockGa4([{ displayName: 'mysite.com - GA4', property: 'properties/111' }]);

    const res = await GET(getReq());
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0]).toMatchObject({
      id: 'mysite-com',
      domain: 'mysite.com',
      ga4PropertyId: 'properties/111',
      isUpdate: true,
    });
  });

  it('backfills existing site as SC plus GA4 when Search Console differs only by www', async () => {
    vi.mocked(dbGetSites).mockReturnValue([
      { id: 'mysite-com', name: 'My Site', domain: 'mysite.com', testPages: ['/'], ga4PropertyId: undefined },
    ] as never);
    mockSc(['www.mysite.com']);
    mockGa4([{ displayName: 'www.mysite.com', property: 'properties/111' }]);

    const res = await GET(getReq());
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0]).toMatchObject({
      id: 'mysite-com',
      domain: 'mysite.com',
      ga4PropertyId: 'properties/111',
      discoverySource: 'sc+ga4',
      isUpdate: true,
    });
  });

  it('backfills an existing GA4-only site when Search Console access appears later', async () => {
    vi.mocked(dbGetSites).mockReturnValue([
      {
        id: 'mysite-com',
        name: 'My Site',
        domain: 'mysite.com',
        testPages: ['/'],
        ga4PropertyId: 'properties/999',
        searchConsole: false,
      },
    ] as never);
    mockSc(['mysite.com']);
    mockGa4([]);

    const res = await GET(getReq());
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0]).toMatchObject({
      id: 'mysite-com',
      domain: 'mysite.com',
      ga4PropertyId: 'properties/999',
      searchConsole: true,
      discoverySource: 'sc+ga4',
      isUpdate: true,
    });
    expect(body[0].scUrl).toBeUndefined();
  });

  it('keeps the discovered SC domain override when enabling a variant property', async () => {
    vi.mocked(dbGetSites).mockReturnValue([
      {
        id: 'mysite-com',
        name: 'My Site',
        domain: 'mysite.com',
        testPages: ['/'],
        ga4PropertyId: 'properties/999',
        searchConsole: false,
      },
    ] as never);
    mockSc(['www.mysite.com']);
    mockGa4([]);

    const res = await GET(getReq());
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0]).toMatchObject({
      id: 'mysite-com',
      domain: 'mysite.com',
      scUrl: 'sc-domain:www.mysite.com',
      searchConsole: true,
      discoverySource: 'sc+ga4',
      isUpdate: true,
    });
  });

  it('backfills both Search Console and GA4 on one existing update', async () => {
    vi.mocked(dbGetSites).mockReturnValue([
      {
        id: 'mysite-com',
        name: 'My Site',
        domain: 'mysite.com',
        testPages: ['/'],
        searchConsole: false,
      },
    ] as never);
    mockSc(['mysite.com']);
    mockGa4([{ displayName: 'mysite.com', property: 'properties/111' }]);

    const res = await GET(getReq());
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0]).toMatchObject({
      id: 'mysite-com',
      domain: 'mysite.com',
      ga4PropertyId: 'properties/111',
      ga4DisplayName: 'mysite.com',
      searchConsole: true,
      discoverySource: 'sc+ga4',
      isUpdate: true,
    });
  });

  it('does not auto-assign GA4 to an SC-discovered candidate when multiple exact-domain properties match', async () => {
    mockSc(['mysite.com']);
    mockGa4([
      { displayName: 'mysite.com', property: 'properties/111' },
      { displayName: 'mysite.com', property: 'properties/222' },
    ]);

    const res = await GET(getReq());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0]).toMatchObject({
      id: 'mysite-com',
      domain: 'mysite.com',
      searchConsole: true,
      discoverySource: 'sc',
    });
    expect(body[0].ga4PropertyId).toBeUndefined();
    expect(body[0].ga4DisplayName).toBeUndefined();
  });

  it('does not backfill an existing site when multiple exact-domain GA4 properties match', async () => {
    vi.mocked(dbGetSites).mockReturnValue([
      { id: 'mysite-com', name: 'My Site', domain: 'mysite.com', testPages: ['/'], ga4PropertyId: undefined },
    ] as never);
    mockSc([]);
    mockGa4([
      { displayName: 'mysite.com', property: 'properties/111' },
      { displayName: 'mysite.com', property: 'properties/222' },
    ]);

    const res = await GET(getReq());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual([]);
  });

  it('does not backfill existing site that already has a GA4 property ID', async () => {
    vi.mocked(dbGetSites).mockReturnValue([
      { id: 'mysite-com', name: 'My Site', domain: 'mysite.com', testPages: ['/'], ga4PropertyId: '999' },
    ] as never);
    mockSc([]);
    mockGa4([{ displayName: 'mysite.com GA4', property: 'properties/111' }]);

    const res = await GET(getReq());
    const body = await res.json();
    expect(body).toEqual([]);
  });

  it('does not backfill existing site when no GA4 match found', async () => {
    vi.mocked(dbGetSites).mockReturnValue([
      { id: 'mysite-com', name: 'My Site', domain: 'mysite.com', testPages: ['/'], ga4PropertyId: undefined },
    ] as never);
    mockSc([]);
    mockGa4([{ displayName: 'unrelated project', property: 'properties/777' }]);

    const res = await GET(getReq());
    const body = await res.json();
    expect(body).toEqual([]);
  });

  it('returns both new and backfill sites when both match', async () => {
    vi.mocked(dbGetSites).mockReturnValue([
      { id: 'existing-com', name: 'Existing', domain: 'existing.com', testPages: ['/'], ga4PropertyId: undefined },
    ] as never);
    mockSc(['newsite.com']); // new site not in DB
    mockGa4([
      { displayName: 'existing.com GA4', property: 'properties/100' },
      { displayName: 'newsite.com GA4', property: 'properties/200' },
    ]);

    const res = await GET(getReq());
    const body = await res.json();
    expect(body).toHaveLength(2);
    const backfill = body.find((s: { id: string }) => s.id === 'existing-com');
    const proposed = body.find((s: { id: string }) => s.id === 'newsite-com');
    expect(backfill).toMatchObject({ isUpdate: true, ga4PropertyId: 'properties/100' });
    expect(proposed).toMatchObject({ ga4PropertyId: 'properties/200' });
    expect(proposed?.isUpdate).toBeUndefined();
  });
});
