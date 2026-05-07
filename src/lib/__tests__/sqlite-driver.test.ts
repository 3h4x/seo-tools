import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.doUnmock('node:module');
  vi.doUnmock('node:sqlite');
});

describe('openDatabase', () => {
  it('falls back to node:sqlite when better-sqlite3 cannot be loaded', async () => {
    const exec = vi.fn();
    const prepare = vi.fn(() => ({ get: vi.fn(), all: vi.fn(), run: vi.fn() }));
    const close = vi.fn();
    const requireMock = vi.fn(() => {
      throw new Error('native module unavailable');
    });
    const DatabaseSync = vi.fn(function DatabaseSync(this: { exec: typeof exec; prepare: typeof prepare; close: typeof close }, filename: string) {
      expect(filename).toBe(':memory:');
      this.exec = exec;
      this.prepare = prepare;
      this.close = close;
    });

    vi.doMock('node:module', () => ({
      createRequire: () => requireMock,
    }));
    vi.doMock('node:sqlite', () => ({
      DatabaseSync,
    }));

    const { openDatabase } = await import('../sqlite-driver.js');

    const db = openDatabase(':memory:');
    db.pragma('journal_mode = WAL');
    db.close?.();

    expect(requireMock).toHaveBeenCalledWith('better-sqlite3');
    expect(DatabaseSync).toHaveBeenCalledWith(':memory:');
    expect(exec).toHaveBeenCalledWith('PRAGMA journal_mode = WAL');
    expect(close).toHaveBeenCalled();
  });
});
