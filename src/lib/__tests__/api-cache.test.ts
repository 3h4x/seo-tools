import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../db', () => ({
  clearCache: vi.fn(),
}));

import { clearCache } from '../db';
import { DELETE } from '../../../app/api/cache/route';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('DELETE /api/cache', () => {
  it('clears cache and returns { cleared: true }', async () => {
    const res = await DELETE();
    const data = await res.json();
    expect(data).toEqual({ cleared: true });
    expect(clearCache).toHaveBeenCalledTimes(1);
  });

  it('returns 200 status', async () => {
    const res = await DELETE();
    expect(res.status).toBe(200);
  });
});
