import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../db', () => ({
  clearCache: vi.fn(),
}));

vi.mock('../ga4', () => ({
  clearGa4DiscoveryCache: vi.fn(),
}));

import { clearCache } from '../db';
import { clearGa4DiscoveryCache } from '../ga4';
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
    expect(clearGa4DiscoveryCache).toHaveBeenCalledTimes(1);
  });

  it('returns 200 status', async () => {
    const res = await DELETE();
    expect(res.status).toBe(200);
  });

  it('returns a JSON 500 when clearing caches throws', async () => {
    vi.mocked(clearCache).mockImplementation(() => {
      throw new Error('db locked');
    });
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    const res = await DELETE();

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ cleared: false, error: 'failed_to_clear_cache' });
    expect(consoleError).toHaveBeenCalledWith('[DELETE /api/cache]', expect.any(Error));
    consoleError.mockRestore();
  });
});
