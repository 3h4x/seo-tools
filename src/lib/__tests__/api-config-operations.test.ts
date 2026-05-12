import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockGetOperationalStatuses,
} = vi.hoisted(() => ({
  mockGetOperationalStatuses: vi.fn(),
}));

vi.mock('../db', () => ({
  getOperationalStatuses: mockGetOperationalStatuses,
}));

import { GET } from '../../../app/api/config/operations/route';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GET /api/config/operations', () => {
  it('returns the operational statuses from the DB helper', async () => {
    mockGetOperationalStatuses.mockResolvedValue([
      {
        key: 'sc-daily',
        label: 'Daily Search Console',
        state: 'fresh',
        timestamp: 123,
        reason: 'ok',
        details: 'Collector writes are current',
      },
      {
        key: 'ga4-daily',
        label: 'Daily GA4',
        state: 'fresh',
        timestamp: 456,
        reason: 'Collected 1 site through 2026-05-11',
        details: 'GA4 discovery unavailable; excluding sites without saved GA4 property IDs: site-a',
      },
    ]);

    const res = await GET();

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      statuses: [
        {
          key: 'sc-daily',
          label: 'Daily Search Console',
          state: 'fresh',
          timestamp: 123,
          reason: 'ok',
          details: 'Collector writes are current',
        },
        {
          key: 'ga4-daily',
          label: 'Daily GA4',
          state: 'fresh',
          timestamp: 456,
          reason: 'Collected 1 site through 2026-05-11',
          details: 'GA4 discovery unavailable; excluding sites without saved GA4 property IDs: site-a',
        },
      ],
    });
  });

  it('returns 500 when the helper throws', async () => {
    mockGetOperationalStatuses.mockRejectedValue(new Error('boom'));

    const res = await GET();

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'failed_to_load_operational_status' });
  });
});
