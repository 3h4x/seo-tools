import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import * as React from 'react';
import { formatSnapshotError, readSnapshotResponse, SnapshotButton } from '../../../app/components/snapshot-button';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('SnapshotButton helpers', () => {
  it('maps snapshot API error codes to operator-facing messages', () => {
    expect(formatSnapshotError('snapshot_in_progress', 409)).toBe('Snapshot already running');
    expect(formatSnapshotError('snapshot_failed', 500)).toBe('Snapshot failed');
    expect(formatSnapshotError('Auth failure', 502)).toBe('Auth failure');
  });

  it('surfaces API error payloads from failed snapshot responses', async () => {
    await expect(readSnapshotResponse(jsonResponse({ error: 'snapshot_in_progress' }, 409))).resolves.toEqual({
      ok: false,
      error: 'Snapshot already running',
    });
  });

  it('accepts valid successful snapshot responses', async () => {
    const result = {
      date: '2026-05-21',
      sc: 12,
      keywords: 34,
      ga4: 2,
      ttfb: 567,
      errors: [],
    };

    await expect(readSnapshotResponse(jsonResponse(result))).resolves.toEqual({
      ok: true,
      result,
    });
  });

  it('falls back to status when a failed snapshot response has no error payload', async () => {
    await expect(readSnapshotResponse(new Response('not json', { status: 503 }))).resolves.toEqual({
      ok: false,
      error: 'Snapshot request failed (503)',
    });
  });

  it('rejects malformed successful snapshot responses', async () => {
    await expect(readSnapshotResponse(new Response('not json', { status: 200 }))).resolves.toEqual({
      ok: false,
      error: 'Snapshot response was invalid',
    });
  });
});

describe('SnapshotButton', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders an alert when the snapshot request fails', () => {
    vi.spyOn(React, 'useState')
      .mockImplementationOnce(() => ['error', vi.fn()])
      .mockImplementationOnce(() => [null, vi.fn()])
      .mockImplementationOnce(() => ['Snapshot failed', vi.fn()]);

    const html = renderToStaticMarkup(<SnapshotButton />);

    expect(html).toContain('role="alert"');
    expect(html).toContain('Snapshot failed');
  });
});
