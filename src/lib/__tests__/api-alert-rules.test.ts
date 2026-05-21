import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/db', () => ({
  dbDeleteAlertRule: vi.fn(),
  dbGetAlertRules: vi.fn(),
  dbGetSites: vi.fn(),
  dbUpsertAlertRule: vi.fn(),
}));

import { dbDeleteAlertRule, dbGetAlertRules, dbGetSites, dbUpsertAlertRule } from '@/lib/db';
import { DELETE, GET, POST } from '../../../app/api/alerts/rules/route';

function postReq(body: object): Request {
  return new Request('http://localhost/api/alerts/rules', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function rawPostReq(body: string): Request {
  return new Request('http://localhost/api/alerts/rules', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(dbGetSites).mockReturnValue([
    { id: 'site-a', name: 'Site A', domain: 'a.example.com', testPages: ['/'] },
  ]);
});

describe('GET /api/alerts/rules', () => {
  it('returns saved rules', async () => {
    vi.mocked(dbGetAlertRules).mockReturnValue([
      { id: 1, siteId: 'site-a', metric: 'sc_clicks', thresholdPct: 25, channels: ['email'], createdAt: '', updatedAt: '' },
    ]);

    const res = await GET();

    expect(await res.json()).toEqual({
      rules: [
        { id: 1, siteId: 'site-a', metric: 'sc_clicks', thresholdPct: 25, channels: ['email'], createdAt: '', updatedAt: '' },
      ],
    });
  });

  it('returns a JSON 500 when rules cannot be loaded', async () => {
    vi.mocked(dbGetAlertRules).mockImplementation(() => {
      throw new Error('rules table unavailable');
    });
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    const res = await GET();

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'failed_to_load_alert_rules' });
    expect(consoleError).toHaveBeenCalledWith('[GET /api/alerts/rules]', expect.any(Error));
    consoleError.mockRestore();
  });
});

describe('POST /api/alerts/rules', () => {
  it('returns 400 for malformed JSON without touching storage', async () => {
    const res = await POST(rawPostReq('{'));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ ok: false, error: 'Invalid JSON body' });
    expect(dbGetSites).not.toHaveBeenCalled();
    expect(dbUpsertAlertRule).not.toHaveBeenCalled();
  });

  it('returns 400 for non-object JSON without touching storage', async () => {
    const res = await POST(rawPostReq('null'));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ ok: false, error: 'Request body must be an object' });
    expect(dbGetSites).not.toHaveBeenCalled();
    expect(dbUpsertAlertRule).not.toHaveBeenCalled();
  });

  it('validates and saves a rule', async () => {
    vi.mocked(dbUpsertAlertRule).mockReturnValue({
      id: 1,
      siteId: 'site-a',
      metric: 'sc_clicks',
      thresholdPct: 25,
      channels: ['email', 'webhook'],
      createdAt: '',
      updatedAt: '',
    });

    const res = await POST(postReq({
      siteId: 'site-a',
      metric: 'sc_clicks',
      thresholdPct: 25,
      channels: ['email', 'webhook', 'email'],
    }));

    expect(res.status).toBe(200);
    expect(dbUpsertAlertRule).toHaveBeenCalledWith({
      id: undefined,
      siteId: 'site-a',
      metric: 'sc_clicks',
      thresholdPct: 25,
      channels: ['email', 'webhook'],
    });
  });

  it('rejects invalid metrics', async () => {
    const res = await POST(postReq({
      siteId: 'site-a',
      metric: 'users',
      thresholdPct: 25,
      channels: ['email'],
    }));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      ok: false,
      error: 'metric must be one of sc_clicks, ga4_sessions',
    });
    expect(dbUpsertAlertRule).not.toHaveBeenCalled();
  });

  it('rejects audit score rules because CLI snapshots do not collect audit snapshots', async () => {
    const res = await POST(postReq({
      siteId: 'site-a',
      metric: 'audit_score',
      thresholdPct: 25,
      channels: ['email'],
    }));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      ok: false,
      error: 'metric must be one of sc_clicks, ga4_sessions',
    });
    expect(dbUpsertAlertRule).not.toHaveBeenCalled();
  });

  it('returns a JSON 500 when persistence fails after validation passes', async () => {
    vi.mocked(dbUpsertAlertRule).mockImplementation(() => {
      throw new Error('storage failure');
    });
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    const res = await POST(postReq({
      siteId: 'site-a',
      metric: 'sc_clicks',
      thresholdPct: 25,
      channels: ['email'],
    }));

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({
      ok: false,
      error: 'failed_to_save_alert_rule',
    });
    expect(consoleError).toHaveBeenCalledWith('[POST /api/alerts/rules]', expect.any(Error));
    consoleError.mockRestore();
  });
});

describe('DELETE /api/alerts/rules', () => {
  it('deletes the selected rule', async () => {
    const req = new NextRequest('http://localhost/api/alerts/rules?id=7', { method: 'DELETE' });

    const res = await DELETE(req);

    expect(res.status).toBe(200);
    expect(dbDeleteAlertRule).toHaveBeenCalledWith(7);
  });

  it('returns a JSON 500 when the selected rule cannot be deleted', async () => {
    vi.mocked(dbDeleteAlertRule).mockImplementation(() => {
      throw new Error('delete failed');
    });
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const req = new NextRequest('http://localhost/api/alerts/rules?id=7', { method: 'DELETE' });

    const res = await DELETE(req);

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ ok: false, error: 'delete_failed' });
    expect(consoleError).toHaveBeenCalledWith('[DELETE /api/alerts/rules]', expect.any(Error));
    consoleError.mockRestore();
  });
});
