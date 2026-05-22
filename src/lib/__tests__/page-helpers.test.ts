import { describe, expect, it, vi } from 'vitest';
import { loadOrFallback, loadSyncOrFallback } from '../page-helpers';

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
});
