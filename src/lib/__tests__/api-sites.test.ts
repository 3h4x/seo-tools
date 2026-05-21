import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../db', () => ({
  dbGetSites: vi.fn(),
  dbUpsertSite: vi.fn(),
  dbReorderSites: vi.fn(),
  dbDeleteSite: vi.fn(),
}));

vi.mock('../site-cache', () => ({
  invalidateManagedSiteCache: vi.fn(),
}));

vi.mock('../ga4', () => ({
  clearGa4DiscoveryCache: vi.fn(),
}));

// site-domain is used by sites.ts; do not mock it so validation logic runs for real
import { dbGetSites, dbUpsertSite, dbReorderSites, dbDeleteSite } from '../db';
import { clearGa4DiscoveryCache } from '../ga4';
import { invalidateManagedSiteCache } from '../site-cache';
import { GET, POST, DELETE } from '../../../app/api/sites/route';
import { PUT as PUT_ORDER } from '../../../app/api/sites/order/route';
import { NextRequest } from 'next/server';

function postReq(body: object): NextRequest {
  return new NextRequest('http://localhost/api/sites', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function malformedPostReq(): NextRequest {
  return new NextRequest('http://localhost/api/sites', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{"id":',
  });
}

function rawPostReq(body: string): NextRequest {
  return new NextRequest('http://localhost/api/sites', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body,
  });
}

function deleteReq(id: string): NextRequest {
  return new NextRequest(`http://localhost/api/sites?id=${id}`, { method: 'DELETE' });
}

function putOrderReq(body: object): NextRequest {
  return new NextRequest('http://localhost/api/sites/order', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function malformedPutOrderReq(): NextRequest {
  return new NextRequest('http://localhost/api/sites/order', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: '{"orderedIds":',
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(dbGetSites).mockReturnValue([] as never);
});

describe('GET /api/sites', () => {
  it('returns sites list from db', async () => {
    const sites = [{ id: 'site1', name: 'Site 1', domain: 'site1.com', testPages: [] }];
    vi.mocked(dbGetSites).mockReturnValue(sites as never);

    const res = await GET();
    const data = await res.json();
    expect(data).toEqual(sites);
    expect(dbGetSites).toHaveBeenCalledTimes(1);
  });

  it('returns empty array when no sites', async () => {
    vi.mocked(dbGetSites).mockReturnValue([] as never);
    const res = await GET();
    const data = await res.json();
    expect(data).toEqual([]);
  });

  it('returns a JSON 500 when sites cannot be loaded', async () => {
    vi.mocked(dbGetSites).mockImplementationOnce(() => {
      throw new Error('sites table unavailable');
    });
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    const res = await GET();
    const data = await res.json();

    expect(res.status).toBe(500);
    expect(data).toEqual({ error: 'failed_to_load_sites' });
    expect(consoleError).toHaveBeenCalledWith('[GET /api/sites]', expect.any(Error));
    consoleError.mockRestore();
  });
});

describe('POST /api/sites', () => {
  it('returns 400 for malformed JSON without touching storage', async () => {
    const res = await POST(malformedPostReq());
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data).toEqual({ ok: false, error: 'Invalid JSON body' });
    expect(dbGetSites).not.toHaveBeenCalled();
    expect(dbUpsertSite).not.toHaveBeenCalled();
    expect(invalidateManagedSiteCache).not.toHaveBeenCalled();
    expect(clearGa4DiscoveryCache).not.toHaveBeenCalled();
  });

  it('returns 400 for non-object JSON without touching storage', async () => {
    const res = await POST(rawPostReq('null'));
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data).toEqual({ ok: false, error: 'Request body must be an object' });
    expect(dbGetSites).not.toHaveBeenCalled();
    expect(dbUpsertSite).not.toHaveBeenCalled();
    expect(invalidateManagedSiteCache).not.toHaveBeenCalled();
    expect(clearGa4DiscoveryCache).not.toHaveBeenCalled();
  });

  it('returns a JSON 500 when existing sites cannot be loaded before save', async () => {
    vi.mocked(dbGetSites).mockImplementationOnce(() => {
      throw new Error('sites table unavailable');
    });
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    const res = await POST(postReq({ id: 'site1', name: 'Site 1', domain: 'site1.com' }));
    const data = await res.json();

    expect(res.status).toBe(500);
    expect(data).toEqual({ ok: false, error: 'failed_to_load_sites' });
    expect(dbUpsertSite).not.toHaveBeenCalled();
    expect(invalidateManagedSiteCache).not.toHaveBeenCalled();
    expect(clearGa4DiscoveryCache).not.toHaveBeenCalled();
    expect(consoleError).toHaveBeenCalledWith('[POST /api/sites] load', expect.any(Error));
    consoleError.mockRestore();
  });

  it('upserts a valid site and returns { ok: true }', async () => {
    const site = { id: 'site1', name: 'Site 1', domain: 'site1.com' };
    const res = await POST(postReq(site));
    const data = await res.json();
    expect(data).toEqual({ ok: true });
    expect(dbUpsertSite).toHaveBeenCalledWith({ ...site, testPages: [] });
    expect(invalidateManagedSiteCache).toHaveBeenCalledWith(null, { ...site, testPages: [] });
    expect(clearGa4DiscoveryCache).toHaveBeenCalledTimes(1);
  });

  it('returns a JSON 500 when a valid site cannot be saved', async () => {
    vi.mocked(dbUpsertSite).mockImplementationOnce(() => {
      throw new Error('site save failed');
    });
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    const res = await POST(postReq({ id: 'site1', name: 'Site 1', domain: 'site1.com' }));
    const data = await res.json();

    expect(res.status).toBe(500);
    expect(data).toEqual({ ok: false, error: 'failed_to_save_site' });
    expect(invalidateManagedSiteCache).not.toHaveBeenCalled();
    expect(clearGa4DiscoveryCache).not.toHaveBeenCalled();
    expect(consoleError).toHaveBeenCalledWith('[POST /api/sites]', expect.any(Error));
    consoleError.mockRestore();
  });

  it('normalizes URL domains before saving', async () => {
    const site = { id: 'site1', name: 'Site 1', domain: 'https://Example.COM/path?x=1' };
    const res = await POST(postReq(site));
    const data = await res.json();
    expect(data).toEqual({ ok: true });
    expect(dbUpsertSite).toHaveBeenCalledWith(
      { id: 'site1', name: 'Site 1', domain: 'example.com', scUrl: 'https://Example.COM/path?x=1', testPages: [] },
    );
  });

  it('preserves explicit SC URL when normalizing a URL domain', async () => {
    const site = {
      id: 'site1',
      name: 'Site 1',
      domain: 'https://Example.COM/path?x=1',
      scUrl: 'sc-domain:example.com',
    };
    const res = await POST(postReq(site));
    const data = await res.json();
    expect(data).toEqual({ ok: true });
    expect(dbUpsertSite).toHaveBeenCalledWith(
      { id: 'site1', name: 'Site 1', domain: 'example.com', scUrl: 'sc-domain:example.com', testPages: [] },
    );
  });

  it('ignores sortOrder on the full site upsert endpoint', async () => {
    const body = { id: 'site1', name: 'Site 1', domain: 'site1.com', sortOrder: 3 };
    await POST(postReq(body));
    expect(dbUpsertSite).toHaveBeenCalledWith(
      { id: 'site1', name: 'Site 1', domain: 'site1.com', testPages: [] },
    );
  });

  it('invalidates cache with both old and new identities when updating a site', async () => {
    const existingSite = {
      id: 'site1',
      name: 'Site 1',
      domain: 'old.example.com',
      scUrl: 'sc-domain:old.example.com',
      ga4PropertyId: '1234',
      testPages: ['/'],
      skipChecks: ['ogImage'],
    };
    const updatedSite = {
      id: 'site1',
      name: 'Site 1',
      domain: 'new.example.com',
      scUrl: 'sc-domain:new.example.com',
      ga4PropertyId: 'properties/5678',
      testPages: ['/landing'],
      skipChecks: ['internalLinks'],
    };
    vi.mocked(dbGetSites).mockReturnValue([existingSite] as never);

    const res = await POST(postReq({ ...updatedSite, originalId: 'site1' }));

    expect(res.status).toBe(200);
    expect(dbUpsertSite).toHaveBeenCalledWith(updatedSite);
    expect(invalidateManagedSiteCache).toHaveBeenCalledWith(existingSite, updatedSite);
    expect(clearGa4DiscoveryCache).toHaveBeenCalledTimes(1);
  });

  it('returns 400 for URL values without a valid hostname', async () => {
    const res = await POST(postReq({ id: 'site1', name: 'Site 1', domain: 'https://localhost/path' }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.ok).toBe(false);
    expect(data.errors.domain).toBeTruthy();
    expect(typeof data.error).toBe('string');
    expect(data.error).toContain(data.errors.domain);
    expect(dbUpsertSite).not.toHaveBeenCalled();
    expect(invalidateManagedSiteCache).not.toHaveBeenCalled();
    expect(clearGa4DiscoveryCache).not.toHaveBeenCalled();
  });

  it('returns 400 for malformed bare domains', async () => {
    const res = await POST(postReq({ id: 'site1', name: 'Site 1', domain: 'bad..example.com' }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.ok).toBe(false);
    expect(data.errors.domain).toBeTruthy();
    expect(dbUpsertSite).not.toHaveBeenCalled();
    expect(invalidateManagedSiteCache).not.toHaveBeenCalled();
    expect(clearGa4DiscoveryCache).not.toHaveBeenCalled();
  });

  it('returns 400 when id is missing', async () => {
    const res = await POST(postReq({ name: 'Site', domain: 'site.com' }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.ok).toBe(false);
    expect(data.errors.id).toBeTruthy();
    expect(dbUpsertSite).not.toHaveBeenCalled();
    expect(invalidateManagedSiteCache).not.toHaveBeenCalled();
    expect(clearGa4DiscoveryCache).not.toHaveBeenCalled();
  });

  it('returns 400 when id is not a safe route segment', async () => {
    const res = await POST(postReq({ id: '//evil.example', name: 'Site', domain: 'site.com' }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.ok).toBe(false);
    expect(data.errors.id).toBeTruthy();
    expect(dbUpsertSite).not.toHaveBeenCalled();
    expect(invalidateManagedSiteCache).not.toHaveBeenCalled();
  });

  it('returns 400 when id is reserved by a top-level app route', async () => {
    const res = await POST(postReq({ id: 'opportunities', name: 'Site', domain: 'site.com' }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.ok).toBe(false);
    expect(data.errors.id).toMatch(/reserved/i);
    expect(dbUpsertSite).not.toHaveBeenCalled();
    expect(invalidateManagedSiteCache).not.toHaveBeenCalled();
    expect(clearGa4DiscoveryCache).not.toHaveBeenCalled();
  });

  it('returns 400 when name is missing', async () => {
    const res = await POST(postReq({ id: 'site1', domain: 'site.com' }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.ok).toBe(false);
    expect(data.errors.name).toBeTruthy();
    expect(invalidateManagedSiteCache).not.toHaveBeenCalled();
    expect(clearGa4DiscoveryCache).not.toHaveBeenCalled();
  });

  it('returns 400 when domain is missing', async () => {
    const res = await POST(postReq({ id: 'site1', name: 'Site 1' }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.ok).toBe(false);
    expect(data.errors.domain).toBeTruthy();
    expect(invalidateManagedSiteCache).not.toHaveBeenCalled();
    expect(clearGa4DiscoveryCache).not.toHaveBeenCalled();
  });

  it('returns 400 when domain is a duplicate of an existing site with a different id', async () => {
    vi.mocked(dbGetSites).mockReturnValue([
      { id: 'other', name: 'Other', domain: 'site1.com', testPages: [] },
    ] as never);
    const res = await POST(postReq({ id: 'site1', name: 'Site 1', domain: 'site1.com' }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.ok).toBe(false);
    expect(data.errors.domain).toMatch(/other/);
    expect(dbUpsertSite).not.toHaveBeenCalled();
    expect(clearGa4DiscoveryCache).not.toHaveBeenCalled();
  });

  it('allows saving a site whose domain matches its own existing record (update)', async () => {
    vi.mocked(dbGetSites).mockReturnValue([
      { id: 'site1', name: 'Site 1', domain: 'site1.com', testPages: [] },
    ] as never);
    const res = await POST(postReq({ id: 'site1', originalId: 'site1', name: 'Site 1 Updated', domain: 'site1.com' }));
    expect(res.status).toBe(200);
    expect(dbUpsertSite).toHaveBeenCalled();
  });

  it('returns 400 for invalid scUrl format', async () => {
    const res = await POST(postReq({ id: 'site1', name: 'Site 1', domain: 'site1.com', scUrl: 'not-a-valid-url' }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.ok).toBe(false);
    expect(data.errors.scUrl).toBeTruthy();
    expect(dbUpsertSite).not.toHaveBeenCalled();
    expect(clearGa4DiscoveryCache).not.toHaveBeenCalled();
  });

  it('returns 400 when Search Console identity duplicates another site via scUrl', async () => {
    vi.mocked(dbGetSites).mockReturnValue([
      { id: 'existing', name: 'Existing', domain: 'other.example.com', scUrl: 'https://blog.example.com/', testPages: [] },
    ] as never);
    const res = await POST(postReq({ id: 'site1', name: 'Site 1', domain: 'blog.example.com' }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.ok).toBe(false);
    expect(data.errors.scUrl).toMatch(/existing/);
    expect(dbUpsertSite).not.toHaveBeenCalled();
    expect(clearGa4DiscoveryCache).not.toHaveBeenCalled();
  });

  it('allows saving a site when the Search Console identity belongs to its own record', async () => {
    vi.mocked(dbGetSites).mockReturnValue([
      { id: 'site1', name: 'Site 1', domain: 'other.example.com', scUrl: 'https://blog.example.com/', testPages: [] },
    ] as never);
    const res = await POST(postReq({ id: 'site1', originalId: 'site1', name: 'Site 1', domain: 'blog.example.com' }));
    expect(res.status).toBe(200);
    expect(dbUpsertSite).toHaveBeenCalledWith({
      id: 'site1',
      name: 'Site 1',
      domain: 'blog.example.com',
      testPages: [],
    });
  });

  it('returns 400 when a new save reuses an existing site id', async () => {
    vi.mocked(dbGetSites).mockReturnValue([
      { id: 'site1', name: 'Existing', domain: 'existing.com', testPages: [] },
    ] as never);
    const res = await POST(postReq({ id: 'site1', name: 'New Site', domain: 'newsite.com' }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.ok).toBe(false);
    expect(data.errors.id).toMatch(/site1/);
    expect(dbUpsertSite).not.toHaveBeenCalled();
    expect(clearGa4DiscoveryCache).not.toHaveBeenCalled();
  });

  it('accepts a scUrl with sc-domain: prefix', async () => {
    const res = await POST(postReq({ id: 'site1', name: 'Site 1', domain: 'site1.com', scUrl: 'sc-domain:site1.com' }));
    expect(res.status).toBe(200);
    expect(dbUpsertSite).toHaveBeenCalled();
  });

  it('returns 400 for ga4PropertyId not in properties/NNNNNN format', async () => {
    const res = await POST(postReq({ id: 'site1', name: 'Site 1', domain: 'site1.com', ga4PropertyId: '123456' }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.ok).toBe(false);
    expect(data.errors.ga4PropertyId).toBeTruthy();
    expect(dbUpsertSite).not.toHaveBeenCalled();
    expect(clearGa4DiscoveryCache).not.toHaveBeenCalled();
  });

  it('accepts a valid ga4PropertyId', async () => {
    const res = await POST(postReq({ id: 'site1', name: 'Site 1', domain: 'site1.com', ga4PropertyId: 'properties/123456' }));
    expect(res.status).toBe(200);
    expect(dbUpsertSite).toHaveBeenCalled();
  });

  it('accepts a valid IndexNow key', async () => {
    const res = await POST(postReq({
      id: 'site1',
      name: 'Site 1',
      domain: 'site1.com',
      indexNowKey: 'indexnow-key-123',
    }));
    expect(res.status).toBe(200);
    expect(dbUpsertSite).toHaveBeenCalledWith({
      id: 'site1',
      name: 'Site 1',
      domain: 'site1.com',
      indexNowKey: 'indexnow-key-123',
      testPages: [],
    });
  });

  it('returns 400 for IndexNow keys with unsupported characters', async () => {
    const res = await POST(postReq({
      id: 'site1',
      name: 'Site 1',
      domain: 'site1.com',
      indexNowKey: 'index_now.key',
    }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.ok).toBe(false);
    expect(data.errors.indexNowKey).toMatch(/letters, numbers, or hyphens/i);
    expect(dbUpsertSite).not.toHaveBeenCalled();
    expect(clearGa4DiscoveryCache).not.toHaveBeenCalled();
  });

  it('normalizes skipChecks to stable ids before upsert', async () => {
    const res = await POST(postReq({
      id: 'site1',
      name: 'Site 1',
      domain: 'site1.com',
      skipChecks: ['OG Image', 'Internal Links', 'og:image'],
    }));

    expect(res.status).toBe(200);
    expect(dbUpsertSite).toHaveBeenCalledWith({
      id: 'site1',
      name: 'Site 1',
      domain: 'site1.com',
      testPages: [],
      skipChecks: ['ogImage', 'internalLinks', 'ogImageMeta'],
    });
  });

  it('returns 400 when a testPage entry does not start with /', async () => {
    const res = await POST(postReq({ id: 'site1', name: 'Site 1', domain: 'site1.com', testPages: ['noslash'] }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.ok).toBe(false);
    expect(data.errors.testPages).toBeTruthy();
    expect(dbUpsertSite).not.toHaveBeenCalled();
    expect(clearGa4DiscoveryCache).not.toHaveBeenCalled();
  });

  it('accepts valid testPages entries', async () => {
    const res = await POST(postReq({ id: 'site1', name: 'Site 1', domain: 'site1.com', testPages: ['/', '/about'] }));
    expect(res.status).toBe(200);
    expect(dbUpsertSite).toHaveBeenCalled();
  });
});

describe('PUT /api/sites/order', () => {
  it('returns 400 for malformed JSON without reordering sites', async () => {
    const res = await PUT_ORDER(malformedPutOrderReq());
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data).toEqual({ ok: false, error: 'Invalid JSON body' });
    expect(dbReorderSites).not.toHaveBeenCalled();
  });

  it('persists a valid full site id order', async () => {
    const res = await PUT_ORDER(putOrderReq({ orderedIds: ['site-c', 'site-a', 'site-b'] }));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data).toEqual({ ok: true });
    expect(dbReorderSites).toHaveBeenCalledWith(['site-c', 'site-a', 'site-b']);
  });

  it('returns 400 when orderedIds is missing or malformed', async () => {
    const res = await PUT_ORDER(putOrderReq({ orderedIds: ['site-a', ''] }));
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.ok).toBe(false);
    expect(dbReorderSites).not.toHaveBeenCalled();
  });

  it('returns 400 when order validation fails in storage', async () => {
    vi.mocked(dbReorderSites).mockImplementation(() => {
      throw new Error('orderedIds must include every configured site exactly once');
    });

    const res = await PUT_ORDER(putOrderReq({ orderedIds: ['site-a'] }));
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data).toEqual({ ok: false, error: 'orderedIds must include every configured site exactly once' });
  });

  it('returns 400 when storage reports an unknown site id', async () => {
    vi.mocked(dbReorderSites).mockImplementation(() => {
      throw new Error('unknown site id: site-x');
    });

    const res = await PUT_ORDER(putOrderReq({ orderedIds: ['site-x'] }));
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data).toEqual({ ok: false, error: 'unknown site id: site-x' });
  });

  it('returns a JSON 500 when storage fails unexpectedly', async () => {
    vi.mocked(dbReorderSites).mockImplementation(() => {
      throw new Error('SQLITE_IOERR: disk I/O error');
    });
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    const res = await PUT_ORDER(putOrderReq({ orderedIds: ['site-a', 'site-b', 'site-c'] }));
    const data = await res.json();

    expect(res.status).toBe(500);
    expect(data).toEqual({ ok: false, error: 'failed_to_reorder_sites' });
    expect(consoleError).toHaveBeenCalledWith('[PUT /api/sites/order]', expect.any(Error));
    consoleError.mockRestore();
  });
});

describe('DELETE /api/sites', () => {
  it('deletes site by id and returns { ok: true }', async () => {
    const existingSite = { id: 'site1', name: 'Site 1', domain: 'site1.com', testPages: [] };
    vi.mocked(dbGetSites).mockReturnValue([existingSite] as never);

    const res = await DELETE(deleteReq('site1'));
    const data = await res.json();
    expect(data).toEqual({ ok: true });
    expect(dbDeleteSite).toHaveBeenCalledWith('site1');
    expect(invalidateManagedSiteCache).toHaveBeenCalledWith(existingSite, null);
    expect(clearGa4DiscoveryCache).toHaveBeenCalledTimes(1);
  });

  it('returns a JSON 500 when a site cannot be deleted', async () => {
    const existingSite = { id: 'site1', name: 'Site 1', domain: 'site1.com', testPages: [] };
    vi.mocked(dbGetSites).mockReturnValue([existingSite] as never);
    vi.mocked(dbDeleteSite).mockImplementationOnce(() => {
      throw new Error('delete failed');
    });
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    const res = await DELETE(deleteReq('site1'));
    const data = await res.json();

    expect(res.status).toBe(500);
    expect(data).toEqual({ ok: false, error: 'failed_to_delete_site' });
    expect(invalidateManagedSiteCache).not.toHaveBeenCalled();
    expect(clearGa4DiscoveryCache).not.toHaveBeenCalled();
    expect(consoleError).toHaveBeenCalledWith('[DELETE /api/sites]', expect.any(Error));
    consoleError.mockRestore();
  });

  it('returns 400 when id query param is missing', async () => {
    const req = new NextRequest('http://localhost/api/sites', { method: 'DELETE' });
    const res = await DELETE(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.ok).toBe(false);
    expect(dbDeleteSite).not.toHaveBeenCalled();
    expect(invalidateManagedSiteCache).not.toHaveBeenCalled();
    expect(clearGa4DiscoveryCache).not.toHaveBeenCalled();
  });

  it('returns 400 when id query param is empty', async () => {
    const res = await DELETE(deleteReq(''));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.ok).toBe(false);
    expect(dbDeleteSite).not.toHaveBeenCalled();
    expect(invalidateManagedSiteCache).not.toHaveBeenCalled();
    expect(clearGa4DiscoveryCache).not.toHaveBeenCalled();
  });
});
