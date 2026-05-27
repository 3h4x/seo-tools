import { describe, expect, it, vi } from 'vitest';
import { loadOrFallback, loadOrFlag, loadSyncOrFallback, loadSyncOrFlag } from '../page-helpers';

describe('page helpers', () => {
  it('returns async fallback and logs when a promise rejects', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    try {
      await expect(loadOrFallback('Async read', Promise.reject(new Error('boom')), 'fallback')).resolves.toBe('fallback');
      expect(consoleError).toHaveBeenCalledWith('[Async read]', expect.any(Error));
    } finally {
      consoleError.mockRestore();
    }
  });

  it('loadOrFlag returns failed:true with fallback when the promise rejects', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    try {
      const failed = await loadOrFlag('Flagged read', Promise.reject(new Error('boom')), 'fallback');
      expect(failed).toEqual({ value: 'fallback', failed: true });
      expect(consoleError).toHaveBeenCalledWith('[Flagged read]', expect.any(Error));

      const ok = await loadOrFlag('Flagged read', Promise.resolve('actual'), 'fallback');
      expect(ok).toEqual({ value: 'actual', failed: false });
    } finally {
      consoleError.mockRestore();
    }
  });

  it('returns sync fallback and logs when a read throws', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    try {
      expect(loadSyncOrFallback('Sync read', () => {
        throw new Error('boom');
      }, 'fallback')).toBe('fallback');
      expect(consoleError).toHaveBeenCalledWith('[Sync read]', expect.any(Error));
    } finally {
      consoleError.mockRestore();
    }
  });

  it('loadSyncOrFlag returns failed:true with fallback when the read throws', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    try {
      const failed = loadSyncOrFlag('Flagged sync read', () => {
        throw new Error('boom');
      }, 'fallback');
      expect(failed).toEqual({ value: 'fallback', failed: true });
      expect(consoleError).toHaveBeenCalledWith('[Flagged sync read]', expect.any(Error));

      const ok = loadSyncOrFlag('Flagged sync read', () => 'actual', 'fallback');
      expect(ok).toEqual({ value: 'actual', failed: false });
    } finally {
      consoleError.mockRestore();
    }
  });
});
