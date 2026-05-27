import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../db', () => ({
  clearCache: vi.fn(),
  deleteConfig: vi.fn(),
  getConfig: vi.fn(),
  setConfig: vi.fn(),
}));

import { clearCache, deleteConfig, getConfig, setConfig } from '../db';
import { createConfigRouteHandlers } from '../config-route';

function postReq(body: object | string): Request {
  return new Request('http://localhost/api/config/test', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

describe('createConfigRouteHandlers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.TEST_CONFIG_ENV;
    vi.mocked(getConfig).mockReturnValue(null);
  });

  it('returns env as the source when the DB is empty and envKey is set', async () => {
    process.env.TEST_CONFIG_ENV = 'from-env';
    const { GET } = createConfigRouteHandlers({
      configKey: 'test_key',
      envKey: 'TEST_CONFIG_ENV',
      validateAndNormalize: async (raw) => raw.trim(),
    });

    const res = GET();

    expect(await res.json()).toEqual({ source: 'env' });
  });

  it('returns none as the source when envKey is omitted', async () => {
    process.env.TEST_CONFIG_ENV = 'from-env';
    const { GET } = createConfigRouteHandlers({
      configKey: 'test_key',
      validateAndNormalize: async (raw) => raw.trim(),
    });

    const res = GET();

    expect(await res.json()).toEqual({ source: 'none' });
  });

  it('returns a validation error from the provided normalizer', async () => {
    const { POST } = createConfigRouteHandlers({
      configKey: 'test_key',
      validateAndNormalize: async () => {
        throw new Error('bad key');
      },
    });

    const res = await POST(postReq({ key: 'x' }));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ ok: false, error: 'bad key' });
    expect(setConfig).not.toHaveBeenCalled();
    expect(clearCache).not.toHaveBeenCalled();
  });

  it('saves the normalized key, clears cache, and runs afterMutate', async () => {
    const afterMutate = vi.fn();
    const { POST } = createConfigRouteHandlers({
      configKey: 'test_key',
      clearCachePrefix: 'test-prefix',
      afterMutate,
      validateAndNormalize: async (raw) => raw.trim().toUpperCase(),
    });

    const res = await POST(postReq({ key: ' value ' }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(setConfig).toHaveBeenCalledWith('test_key', 'VALUE');
    expect(clearCache).toHaveBeenCalledWith('test-prefix');
    expect(afterMutate).toHaveBeenCalledTimes(1);
  });

  it('returns 500 when afterMutate throws during POST', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const afterMutate = vi.fn(() => {
      throw new Error('cache refresh failed');
    });
    const { POST } = createConfigRouteHandlers({
      configKey: 'test_key',
      afterMutate,
      validateAndNormalize: async (raw) => raw,
    });

    const res = await POST(postReq({ key: 'value' }));

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ ok: false, error: 'failed_to_save_config' });
    expect(setConfig).toHaveBeenCalledWith('test_key', 'value');
    expect(clearCache).toHaveBeenCalledWith(undefined);
    expect(afterMutate).toHaveBeenCalledTimes(1);
    expect(consoleError).toHaveBeenCalledWith('[POST config:test_key]', expect.any(Error));
    consoleError.mockRestore();
  });

  it('does not persist or mutate cache for testOnly requests', async () => {
    const afterMutate = vi.fn();
    const { POST } = createConfigRouteHandlers({
      configKey: 'test_key',
      clearCachePrefix: 'test-prefix',
      afterMutate,
      validateAndNormalize: async (raw) => raw.trim(),
    });

    const res = await POST(postReq({ key: ' value ', testOnly: true }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(setConfig).not.toHaveBeenCalled();
    expect(clearCache).not.toHaveBeenCalled();
    expect(afterMutate).not.toHaveBeenCalled();
  });

  it('deletes the key, clears cache, and runs afterMutate', async () => {
    const afterMutate = vi.fn();
    const { DELETE } = createConfigRouteHandlers({
      configKey: 'test_key',
      clearCachePrefix: 'test-prefix',
      afterMutate,
      validateAndNormalize: async (raw) => raw,
    });

    const res = DELETE();

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(deleteConfig).toHaveBeenCalledWith('test_key');
    expect(clearCache).toHaveBeenCalledWith('test-prefix');
    expect(afterMutate).toHaveBeenCalledTimes(1);
  });

  it('returns 500 when afterMutate throws during DELETE', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const afterMutate = vi.fn(() => {
      throw new Error('cache refresh failed');
    });
    const { DELETE } = createConfigRouteHandlers({
      configKey: 'test_key',
      afterMutate,
      validateAndNormalize: async (raw) => raw,
    });

    const res = DELETE();

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ ok: false, error: 'failed_to_delete_config' });
    expect(deleteConfig).toHaveBeenCalledWith('test_key');
    expect(clearCache).toHaveBeenCalledWith(undefined);
    expect(afterMutate).toHaveBeenCalledTimes(1);
    expect(consoleError).toHaveBeenCalledWith('[DELETE config:test_key]', expect.any(Error));
    consoleError.mockRestore();
  });
});
