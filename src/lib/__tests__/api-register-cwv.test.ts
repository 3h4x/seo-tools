import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../sites', () => ({
  getManagedSite: vi.fn(),
}));

vi.mock('../ga4', () => ({
  registerCwvCustomDefinitions: vi.fn(),
}));

import { getManagedSite } from '../sites';
import { registerCwvCustomDefinitions } from '../ga4';
import { POST } from '../../../app/api/[site]/register-cwv/route';

const fakeSite = { id: 'bonker-wtf', name: 'bonker.wtf', domain: 'bonker.wtf', ga4PropertyId: 'properties/12345', testPages: [] };

beforeEach(() => {
  vi.clearAllMocks();
});

describe('POST /api/[site]/register-cwv', () => {
  it('registers CWV definitions for a known site with a GA4 property', async () => {
    vi.mocked(getManagedSite).mockResolvedValueOnce(fakeSite as any);
    vi.mocked(registerCwvCustomDefinitions).mockResolvedValueOnce({ created: ['metric_name'], alreadyExists: ['metric_rating', 'metric_value'] });

    const res = await POST(new Request('http://localhost/api/bonker-wtf/register-cwv', { method: 'POST' }), { params: Promise.resolve({ site: 'bonker-wtf' }) });

    expect(res.status).toBe(200);
    expect(registerCwvCustomDefinitions).toHaveBeenCalledWith('properties/12345');
    expect(await res.json()).toEqual({ ok: true, created: ['metric_name'], alreadyExists: ['metric_rating', 'metric_value'] });
  });

  it('returns 404 for an unknown site', async () => {
    vi.mocked(getManagedSite).mockResolvedValueOnce(null);

    const res = await POST(new Request('http://localhost/api/unknown/register-cwv', { method: 'POST' }), { params: Promise.resolve({ site: 'unknown' }) });

    expect(res.status).toBe(404);
    expect(registerCwvCustomDefinitions).not.toHaveBeenCalled();
  });

  it('returns 400 when the site has no GA4 property configured', async () => {
    vi.mocked(getManagedSite).mockResolvedValueOnce({ ...fakeSite, ga4PropertyId: undefined } as any);

    const res = await POST(new Request('http://localhost/api/bonker-wtf/register-cwv', { method: 'POST' }), { params: Promise.resolve({ site: 'bonker-wtf' }) });

    expect(res.status).toBe(400);
    expect(registerCwvCustomDefinitions).not.toHaveBeenCalled();
  });

  it('returns 500 when the admin API call throws', async () => {
    vi.mocked(getManagedSite).mockResolvedValueOnce(fakeSite as any);
    vi.mocked(registerCwvCustomDefinitions).mockRejectedValueOnce(new Error('Admin API failure'));

    const res = await POST(new Request('http://localhost/api/bonker-wtf/register-cwv', { method: 'POST' }), { params: Promise.resolve({ site: 'bonker-wtf' }) });

    expect(res.status).toBe(500);
  });
});
