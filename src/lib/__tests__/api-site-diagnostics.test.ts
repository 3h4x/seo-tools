import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockGetSiteDiagnostics,
} = vi.hoisted(() => ({
  mockGetSiteDiagnostics: vi.fn(),
}));

vi.mock('../site-diagnostics', () => ({
  getSiteDiagnostics: mockGetSiteDiagnostics,
}));

import { GET } from '../../../app/api/config/site-diagnostics/route';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GET /api/config/site-diagnostics', () => {
  it('returns diagnostics with a no-store cache header', async () => {
    mockGetSiteDiagnostics.mockResolvedValue([
      {
        siteId: 'site-a',
        searchConsole: { status: 'ok', message: 'Accessible' },
        ga4: { status: 'missing-config', message: 'No GA4 property ID' },
      },
    ]);

    const res = await GET();

    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(await res.json()).toEqual({
      diagnostics: [
        {
          siteId: 'site-a',
          searchConsole: { status: 'ok', message: 'Accessible' },
          ga4: { status: 'missing-config', message: 'No GA4 property ID' },
        },
      ],
    });
  });

  it('returns 500 when diagnostics loading fails', async () => {
    mockGetSiteDiagnostics.mockRejectedValue(new Error('boom'));

    const res = await GET();

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'failed_to_load_site_diagnostics' });
  });
});
