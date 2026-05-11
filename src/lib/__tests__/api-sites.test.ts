import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../db', () => ({
  dbGetSites: vi.fn(),
  dbUpsertSite: vi.fn(),
  dbDeleteSite: vi.fn(),
}));

vi.mock('../site-cache', () => ({
  invalidateManagedSiteCache: vi.fn(),
}));

import { dbGetSites, dbUpsertSite, dbDeleteSite } from '../db';
import { invalidateManagedSiteCache } from '../site-cache';
import { GET, POST, DELETE } from '../../../app/api/sites/route';
import { NextRequest } from 'next/server';

function postReq(body: object): NextRequest {
  return new NextRequest('http://localhost/api/sites', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function deleteReq(id: string): NextRequest {
  return new NextRequest(`http://localhost/api/sites?id=${id}`, { method: 'DELETE' });
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
});

describe('POST /api/sites', () => {
  it('upserts a valid site and returns { ok: true }', async () => {
    const site = { id: 'site1', name: 'Site 1', domain: 'site1.com' };
    const res = await POST(postReq(site));
    const data = await res.json();
    expect(data).toEqual({ ok: true });
    expect(dbUpsertSite).toHaveBeenCalledWith({ ...site, testPages: [] }, undefined);
    expect(invalidateManagedSiteCache).toHaveBeenCalledWith(null, { ...site, testPages: [] });
  });

  it('normalizes URL domains before saving', async () => {
    const site = { id: 'site1', name: 'Site 1', domain: 'https://Example.COM/path?x=1' };
    const res = await POST(postReq(site));
    const data = await res.json();
    expect(data).toEqual({ ok: true });
    expect(dbUpsertSite).toHaveBeenCalledWith(
      { id: 'site1', name: 'Site 1', domain: 'example.com', scUrl: 'https://Example.COM/path?x=1', testPages: [] },
      undefined,
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
      undefined,
    );
  });

  it('passes sortOrder to dbUpsertSite when provided', async () => {
    const body = { id: 'site1', name: 'Site 1', domain: 'site1.com', sortOrder: 3 };
    await POST(postReq(body));
    expect(dbUpsertSite).toHaveBeenCalledWith(
      { id: 'site1', name: 'Site 1', domain: 'site1.com', testPages: [] },
      3,
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
      ga4PropertyId: '5678',
      testPages: ['/landing'],
      skipChecks: ['internalLinks'],
    };
    vi.mocked(dbGetSites).mockReturnValue([existingSite] as never);

    const res = await POST(postReq(updatedSite));

    expect(res.status).toBe(200);
    expect(dbUpsertSite).toHaveBeenCalledWith(updatedSite, undefined);
    expect(invalidateManagedSiteCache).toHaveBeenCalledWith(existingSite, updatedSite);
  });

  it('returns 400 for URL values without a valid hostname', async () => {
    const res = await POST(postReq({ id: 'site1', name: 'Site 1', domain: 'https://localhost/path' }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.ok).toBe(false);
    expect(dbUpsertSite).not.toHaveBeenCalled();
    expect(invalidateManagedSiteCache).not.toHaveBeenCalled();
  });

  it('returns 400 for malformed bare domains', async () => {
    const res = await POST(postReq({ id: 'site1', name: 'Site 1', domain: 'bad..example.com' }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.ok).toBe(false);
    expect(dbUpsertSite).not.toHaveBeenCalled();
    expect(invalidateManagedSiteCache).not.toHaveBeenCalled();
  });

  it('returns 400 when id is missing', async () => {
    const res = await POST(postReq({ name: 'Site', domain: 'site.com' }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.ok).toBe(false);
    expect(dbUpsertSite).not.toHaveBeenCalled();
    expect(invalidateManagedSiteCache).not.toHaveBeenCalled();
  });

  it('returns 400 when id is not a safe route segment', async () => {
    const res = await POST(postReq({ id: '//evil.example', name: 'Site', domain: 'site.com' }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.ok).toBe(false);
    expect(dbUpsertSite).not.toHaveBeenCalled();
    expect(invalidateManagedSiteCache).not.toHaveBeenCalled();
  });

  it('returns 400 when name is missing', async () => {
    const res = await POST(postReq({ id: 'site1', domain: 'site.com' }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.ok).toBe(false);
    expect(invalidateManagedSiteCache).not.toHaveBeenCalled();
  });

  it('returns 400 when domain is missing', async () => {
    const res = await POST(postReq({ id: 'site1', name: 'Site 1' }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.ok).toBe(false);
    expect(invalidateManagedSiteCache).not.toHaveBeenCalled();
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
  });

  it('returns 400 when id query param is missing', async () => {
    const req = new NextRequest('http://localhost/api/sites', { method: 'DELETE' });
    const res = await DELETE(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.ok).toBe(false);
    expect(dbDeleteSite).not.toHaveBeenCalled();
    expect(invalidateManagedSiteCache).not.toHaveBeenCalled();
  });

  it('returns 400 when id query param is empty', async () => {
    const res = await DELETE(deleteReq(''));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.ok).toBe(false);
    expect(dbDeleteSite).not.toHaveBeenCalled();
    expect(invalidateManagedSiteCache).not.toHaveBeenCalled();
  });
});
