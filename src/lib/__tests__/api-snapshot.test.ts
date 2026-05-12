import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => {
  class FakeAlreadyRunningError extends Error {
    constructor() {
      super('snapshot_in_progress');
      this.name = 'SnapshotAlreadyRunningError';
    }
  }
  return {
    runSnapshot: vi.fn(),
    isRunning: false,
    FakeAlreadyRunningError,
  };
});
const FakeAlreadyRunningError = mocks.FakeAlreadyRunningError;

vi.mock('../snapshot', () => ({
  isSnapshotRunning: () => mocks.isRunning,
  runSnapshot: mocks.runSnapshot,
  SnapshotAlreadyRunningError: mocks.FakeAlreadyRunningError,
}));

import { POST } from '../../../app/api/snapshot/route';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.isRunning = false;
});

describe('POST /api/snapshot', () => {
  it('runs snapshot and returns result', async () => {
    const result = { date: '2026-05-12', sc: 10, keywords: 5, ga4: 2, errors: [] };
    mocks.runSnapshot.mockResolvedValue(result);

    const res = await POST();
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data).toEqual(result);
    expect(mocks.runSnapshot).toHaveBeenCalledTimes(1);
  });

  it('returns 409 when snapshot is already running', async () => {
    mocks.isRunning = true;

    const res = await POST();
    const data = await res.json();

    expect(res.status).toBe(409);
    expect(data).toEqual({ error: 'snapshot_in_progress' });
    expect(mocks.runSnapshot).not.toHaveBeenCalled();
  });

  it('returns 500 when snapshot throws', async () => {
    mocks.runSnapshot.mockRejectedValue(new Error('Auth failure'));

    const res = await POST();
    const data = await res.json();

    expect(res.status).toBe(500);
    expect(data).toEqual({ error: 'snapshot_failed' });
  });

  it('returns 409 when runSnapshot rejects with SnapshotAlreadyRunningError', async () => {
    mocks.runSnapshot.mockRejectedValue(new FakeAlreadyRunningError());

    const res = await POST();
    const data = await res.json();

    expect(res.status).toBe(409);
    expect(data).toEqual({ error: 'snapshot_in_progress' });
  });

  it('serializes concurrent POSTs — second resolves to 409 and runSnapshot is invoked once', async () => {
    let firstResolve: (v: unknown) => void = () => {};
    mocks.runSnapshot.mockImplementation(
      () =>
        new Promise((resolve) => {
          firstResolve = resolve;
          mocks.isRunning = true;
        }),
    );

    const p1 = POST();
    // Yield so p1 enters runSnapshot before p2's pre-check.
    await Promise.resolve();
    const p2 = POST();

    const res2 = await p2;
    const data2 = await res2.json();
    expect(res2.status).toBe(409);
    expect(data2).toEqual({ error: 'snapshot_in_progress' });

    mocks.isRunning = false;
    firstResolve({ date: '2026-05-12', sc: 0, keywords: 0, ga4: 0, errors: [] });
    const res1 = await p1;
    expect(res1.status).toBe(200);

    expect(mocks.runSnapshot).toHaveBeenCalledTimes(1);
  });

  it('includes partial errors in successful result', async () => {
    const result = { date: '2026-05-12', sc: 8, keywords: 4, ga4: 1, errors: ['SC pages site-1: 403'] };
    mocks.runSnapshot.mockResolvedValue(result);

    const res = await POST();
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.errors).toHaveLength(1);
    expect(data.sc).toBe(8);
  });
});
