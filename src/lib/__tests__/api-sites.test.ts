import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../db', () => ({
  dbGetSites: vi.fn(),
  dbUpsertSite: vi.fn(),
  dbDeleteSite: vi.fn(),
}));

import { dbGetSites, dbUpsertSite, dbDeleteSite } from '../db';
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
    expect(dbUpsertSite).toHaveBeenCalledWith(site, undefined);
  });

  it('passes sortOrder to dbUpsertSite when provided', async () => {
    const body = { id: 'site1', name: 'Site 1', domain: 'site1.com', sortOrder: 3 };
    await POST(postReq(body));
    expect(dbUpsertSite).toHaveBeenCalledWith(
      { id: 'site1', name: 'Site 1', domain: 'site1.com' },
      3,
    );
  });

  it('returns 400 when id is missing', async () => {
    const res = await POST(postReq({ name: 'Site', domain: 'site.com' }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.ok).toBe(false);
    expect(dbUpsertSite).not.toHaveBeenCalled();
  });

  it('returns 400 when name is missing', async () => {
    const res = await POST(postReq({ id: 'site1', domain: 'site.com' }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.ok).toBe(false);
  });

  it('returns 400 when domain is missing', async () => {
    const res = await POST(postReq({ id: 'site1', name: 'Site 1' }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.ok).toBe(false);
  });
});

describe('DELETE /api/sites', () => {
  it('deletes site by id and returns { ok: true }', async () => {
    const res = await DELETE(deleteReq('site1'));
    const data = await res.json();
    expect(data).toEqual({ ok: true });
    expect(dbDeleteSite).toHaveBeenCalledWith('site1');
  });

  it('returns 400 when id query param is missing', async () => {
    const req = new NextRequest('http://localhost/api/sites', { method: 'DELETE' });
    const res = await DELETE(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.ok).toBe(false);
    expect(dbDeleteSite).not.toHaveBeenCalled();
  });
});
