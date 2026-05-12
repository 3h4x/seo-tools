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
  it('returns operational statuses from SQLite without calling live APIs', async () => {
    mockGetOperationalStatuses.mockReturnValue([
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
        details: 'Collector writes are current',
      },
    ]);

    const res = GET();

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
          details: 'Collector writes are current',
        },
      ],
    });
  });

  it('returns ga4-daily as never when no GA4 property IDs are configured', async () => {
    mockGetOperationalStatuses.mockReturnValue([
      {
        key: 'ga4-daily',
        label: 'Daily GA4',
        state: 'never',
        timestamp: null,
        reason: 'No GA4 property IDs configured',
      },
    ]);

    const res = GET();

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      statuses: [
        {
          key: 'ga4-daily',
          label: 'Daily GA4',
          state: 'never',
          timestamp: null,
          reason: 'No GA4 property IDs configured',
        },
      ],
    });
  });

  it('returns 500 when the helper throws', async () => {
    mockGetOperationalStatuses.mockImplementation(() => { throw new Error('boom'); });

    const res = GET();

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'failed_to_load_operational_status' });
  });
});
