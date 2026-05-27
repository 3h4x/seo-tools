import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const { mockDbReorderSites } = vi.hoisted(() => ({
  mockDbReorderSites: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  dbReorderSites: mockDbReorderSites,
}));

import { PUT } from '../../../app/api/sites/order/route';

function putReq(body: object | string): NextRequest {
  const init: RequestInit = {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  };
  return new NextRequest('http://localhost/api/sites/order', init);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('PUT /api/sites/order', () => {
  it('returns 400 when the JSON body is malformed', async () => {
    const res = await PUT(putReq('{'));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ ok: false, error: 'Invalid JSON body' });
    expect(mockDbReorderSites).not.toHaveBeenCalled();
  });

  it('returns 400 when orderedIds is missing', async () => {
    const res = await PUT(putReq({}));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      ok: false,
      error: 'orderedIds must be an array of site ids',
    });
    expect(mockDbReorderSites).not.toHaveBeenCalled();
  });

  it('returns 400 when orderedIds is not an array', async () => {
    const res = await PUT(putReq({ orderedIds: 'site-a' }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      ok: false,
      error: 'orderedIds must be an array of site ids',
    });
    expect(mockDbReorderSites).not.toHaveBeenCalled();
  });

  it('returns 400 when orderedIds contains non-string entries', async () => {
    const res = await PUT(putReq({ orderedIds: ['site-a', 42] }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      ok: false,
      error: 'orderedIds must be an array of site ids',
    });
    expect(mockDbReorderSites).not.toHaveBeenCalled();
  });

  it('returns 400 when orderedIds contains whitespace-only strings', async () => {
    const res = await PUT(putReq({ orderedIds: ['site-a', '   '] }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      ok: false,
      error: 'orderedIds must be an array of site ids',
    });
    expect(mockDbReorderSites).not.toHaveBeenCalled();
  });

  it('surfaces validation errors raised by dbReorderSites as 400 with the original message', async () => {
    mockDbReorderSites.mockImplementation(() => {
      throw new Error('unknown site id: site-x');
    });

    const res = await PUT(putReq({ orderedIds: ['site-x'] }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      ok: false,
      error: 'unknown site id: site-x',
    });
    expect(mockDbReorderSites).toHaveBeenCalledWith(['site-x']);
  });

  it('surfaces orderedIds-prefixed validation errors as 400', async () => {
    mockDbReorderSites.mockImplementation(() => {
      throw new Error('orderedIds must include every existing site');
    });

    const res = await PUT(putReq({ orderedIds: ['site-a'] }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      ok: false,
      error: 'orderedIds must include every existing site',
    });
  });

  it('returns 500 when dbReorderSites throws a non-validation error', async () => {
    mockDbReorderSites.mockImplementation(() => {
      throw new Error('database is locked');
    });
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    const res = await PUT(putReq({ orderedIds: ['site-a', 'site-b'] }));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({
      ok: false,
      error: 'failed_to_reorder_sites',
    });
    expect(consoleError).toHaveBeenCalledWith('[PUT /api/sites/order]', expect.any(Error));
    consoleError.mockRestore();
  });

  it('returns 500 when dbReorderSites throws a non-Error value', async () => {
    mockDbReorderSites.mockImplementation(() => {
      throw 'something went wrong';
    });
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    const res = await PUT(putReq({ orderedIds: ['site-a'] }));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({
      ok: false,
      error: 'failed_to_reorder_sites',
    });
    consoleError.mockRestore();
  });

  it('trims whitespace from ids and forwards the trimmed list to dbReorderSites', async () => {
    mockDbReorderSites.mockReturnValue(undefined);

    const res = await PUT(putReq({ orderedIds: [' site-a ', 'site-b'] }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(mockDbReorderSites).toHaveBeenCalledWith(['site-a', 'site-b']);
  });

  it('surfaces dbReorderSites rejection of empty orderedIds as 400', async () => {
    mockDbReorderSites.mockImplementation(() => {
      throw new Error('orderedIds must include every configured site exactly once');
    });

    const res = await PUT(putReq({ orderedIds: [] }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      ok: false,
      error: 'orderedIds must include every configured site exactly once',
    });
    expect(mockDbReorderSites).toHaveBeenCalledWith([]);
  });

  it('surfaces dbReorderSites rejection of duplicate ids as 400', async () => {
    mockDbReorderSites.mockImplementation(() => {
      throw new Error('orderedIds must not contain duplicates');
    });

    const res = await PUT(putReq({ orderedIds: ['site-a', 'site-a'] }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      ok: false,
      error: 'orderedIds must not contain duplicates',
    });
    expect(mockDbReorderSites).toHaveBeenCalledWith(['site-a', 'site-a']);
  });

  it('returns 200 with ok:true on success', async () => {
    mockDbReorderSites.mockReturnValue(undefined);

    const res = await PUT(putReq({ orderedIds: ['site-a', 'site-b', 'site-c'] }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(mockDbReorderSites).toHaveBeenCalledTimes(1);
  });
});
