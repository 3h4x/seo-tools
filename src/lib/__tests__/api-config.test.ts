import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../db', () => ({
  getConfig: vi.fn(),
  setConfig: vi.fn(),
  deleteConfig: vi.fn(),
  clearCache: vi.fn(),
}));

vi.mock('../ga4', () => ({
  clearGa4DiscoveryCache: vi.fn(),
}));

vi.mock('google-auth-library', () => ({
  GoogleAuth: vi.fn(),
}));

vi.mock('@googleapis/searchconsole', () => ({
  searchconsole_v1: {
    Searchconsole: vi.fn(),
  },
}));

import { getConfig, setConfig, deleteConfig, clearCache } from '../db';
import { clearGa4DiscoveryCache } from '../ga4';
import { GoogleAuth } from 'google-auth-library';
import { searchconsole_v1 } from '@googleapis/searchconsole';
import { GET, POST, DELETE } from '../../../app/api/config/route';

const VALID_KEY = JSON.stringify({
  type: 'service_account',
  client_email: 'sa@project.iam.gserviceaccount.com',
  private_key: '-----BEGIN RSA PRIVATE KEY-----\\nFAKEKEY\\n-----END RSA PRIVATE KEY-----',
});

function postReq(body: object): Request {
  return new Request('http://localhost/api/config', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function malformedPostReq(): Request {
  return new Request('http://localhost/api/config', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{"key":',
  });
}

function mockScList(impl: () => Promise<unknown>) {
  vi.mocked(searchconsole_v1.Searchconsole).mockImplementation(function () {
    return { sites: { list: impl } };
  } as never);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getConfig).mockReturnValue(null);
  mockScList(() => Promise.resolve({}));
});

describe('GET /api/config', () => {
  it('returns source=none when no key is configured', async () => {
    vi.mocked(getConfig).mockReturnValue(null);
    delete process.env.GOOGLE_SA_KEY_JSON;
    const res = await GET();
    const body = await res.json();
    expect(body).toEqual({ source: 'none' });
  });

  it('returns source=db when key is in the database', async () => {
    vi.mocked(getConfig).mockReturnValue(VALID_KEY);
    const res = await GET();
    const body = await res.json();
    expect(body).toEqual({ source: 'db' });
  });

  it('returns source=env when key is only in env', async () => {
    vi.mocked(getConfig).mockReturnValue(null);
    process.env.GOOGLE_SA_KEY_JSON = VALID_KEY;
    const res = await GET();
    const body = await res.json();
    expect(body).toEqual({ source: 'env' });
    delete process.env.GOOGLE_SA_KEY_JSON;
  });

  it('prefers db over env when both are set', async () => {
    vi.mocked(getConfig).mockReturnValue(VALID_KEY);
    process.env.GOOGLE_SA_KEY_JSON = VALID_KEY;
    const res = await GET();
    const body = await res.json();
    expect(body).toEqual({ source: 'db' });
    delete process.env.GOOGLE_SA_KEY_JSON;
  });
});

describe('POST /api/config', () => {
  it('returns 400 when the request body is malformed JSON', async () => {
    const res = await POST(malformedPostReq());

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ ok: false, error: 'Invalid JSON body' });
    expect(setConfig).not.toHaveBeenCalled();
    expect(clearCache).not.toHaveBeenCalled();
    expect(clearGa4DiscoveryCache).not.toHaveBeenCalled();
  });

  it('returns 400 when key is not valid JSON', async () => {
    const res = await POST(postReq({ key: 'not-json', testOnly: true }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error).toContain('Invalid JSON');
  });

  it('returns 400 when key is missing required fields', async () => {
    const incomplete = JSON.stringify({ type: 'service_account' });
    const res = await POST(postReq({ key: incomplete, testOnly: true }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error).toContain('private_key');
  });

  it('returns 400 when SC sites.list() call throws (bad credentials)', async () => {
    mockScList(() => Promise.reject(new Error('UNAUTHENTICATED')));
    const res = await POST(postReq({ key: VALID_KEY, testOnly: true }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error).toContain('UNAUTHENTICATED');
  });

  it('returns 200 and does not save when testOnly=true', async () => {
    const res = await POST(postReq({ key: VALID_KEY, testOnly: true }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(setConfig).not.toHaveBeenCalled();
    expect(clearCache).not.toHaveBeenCalled();
    expect(clearGa4DiscoveryCache).not.toHaveBeenCalled();
  });

  it('saves key and clears cache when testOnly=false', async () => {
    const res = await POST(postReq({ key: VALID_KEY, testOnly: false }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(setConfig).toHaveBeenCalledWith('google_sa_key', VALID_KEY);
    expect(clearCache).toHaveBeenCalledTimes(1);
    expect(clearGa4DiscoveryCache).toHaveBeenCalledTimes(1);
  });

  it('saves key when testOnly is omitted', async () => {
    const res = await POST(postReq({ key: VALID_KEY }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(setConfig).toHaveBeenCalledWith('google_sa_key', VALID_KEY);
    expect(clearCache).toHaveBeenCalledTimes(1);
    expect(clearGa4DiscoveryCache).toHaveBeenCalledTimes(1);
  });

  it('normalizes escaped newlines in private_key before validation', async () => {
    const keyWithEscaped = JSON.stringify({
      type: 'service_account',
      client_email: 'sa@project.iam.gserviceaccount.com',
      private_key: '-----BEGIN RSA PRIVATE KEY-----\\nMIIEo\\n-----END RSA PRIVATE KEY-----',
    });
    const capturedCredentials: Record<string, unknown>[] = [];
    vi.mocked(GoogleAuth).mockImplementation(function (opts: { credentials: Record<string, unknown> }) {
      capturedCredentials.push(opts.credentials);
      return {} as never;
    } as never);

    await POST(postReq({ key: keyWithEscaped, testOnly: true }));

    expect(capturedCredentials[0].private_key).not.toContain('\\n');
    expect(capturedCredentials[0].private_key).toContain('\n');
  });
});

describe('DELETE /api/config', () => {
  it('removes key and clears cache', async () => {
    const res = await DELETE();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true });
    expect(deleteConfig).toHaveBeenCalledWith('google_sa_key');
    expect(clearCache).toHaveBeenCalledTimes(1);
    expect(clearGa4DiscoveryCache).toHaveBeenCalledTimes(1);
  });
});
