import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../db', () => ({
  getConfig: vi.fn(),
  setConfig: vi.fn(),
  deleteConfig: vi.fn(),
  clearCache: vi.fn(),
}));

import { getConfig, setConfig, deleteConfig, clearCache } from '../db';
import { GET, POST, DELETE } from '../../../app/api/config/pagespeed/route';

const mockFetch = vi.fn();
global.fetch = mockFetch as unknown as typeof fetch;

function postReq(body: object): Request {
  return new Request('http://localhost/api/config/pagespeed', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getConfig).mockReturnValue(null);
  delete process.env.PAGESPEED_API_KEY;
});

describe('GET /api/config/pagespeed', () => {
  it('returns source=none when nothing set', async () => {
    const res = await GET();
    expect(await res.json()).toEqual({ source: 'none' });
  });

  it('returns source=db when key in DB', async () => {
    vi.mocked(getConfig).mockReturnValue('abc');
    const res = await GET();
    expect(await res.json()).toEqual({ source: 'db' });
  });

  it('returns source=env when only env is set', async () => {
    process.env.PAGESPEED_API_KEY = 'envkey';
    const res = await GET();
    expect(await res.json()).toEqual({ source: 'env' });
  });
});

describe('POST /api/config/pagespeed', () => {
  it('rejects empty key', async () => {
    const res = await POST(postReq({ key: '   ' }));
    expect(res.status).toBe(400);
  });

  it('returns 400 on 401/403 from PSI', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false, status: 403,
      json: () => Promise.resolve({ error: { message: 'API key invalid' } }),
    } as Response);
    const res = await POST(postReq({ key: 'bad', testOnly: true }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('API key invalid');
    expect(setConfig).not.toHaveBeenCalled();
  });

  it('does not save when testOnly=true', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve({}) } as Response);
    const res = await POST(postReq({ key: 'good', testOnly: true }));
    expect(res.status).toBe(200);
    expect(setConfig).not.toHaveBeenCalled();
  });

  it('saves and clears psi cache when valid', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve({}) } as Response);
    const res = await POST(postReq({ key: 'good' }));
    expect(res.status).toBe(200);
    expect(setConfig).toHaveBeenCalledWith('pagespeed_api_key', 'good');
    expect(clearCache).toHaveBeenCalledWith('psi-');
  });

  it('accepts a 429 from PSI as valid (key works, just rate-limited)', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 429, json: () => Promise.resolve({}) } as Response);
    const res = await POST(postReq({ key: 'good' }));
    expect(res.status).toBe(200);
    expect(setConfig).toHaveBeenCalled();
  });
});

describe('DELETE /api/config/pagespeed', () => {
  it('removes key and clears psi cache', async () => {
    const res = await DELETE();
    expect(res.status).toBe(200);
    expect(deleteConfig).toHaveBeenCalledWith('pagespeed_api_key');
    expect(clearCache).toHaveBeenCalledWith('psi-');
  });
});
