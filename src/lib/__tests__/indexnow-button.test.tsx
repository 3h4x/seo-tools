import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import * as React from 'react';
import { IndexNowButton, readIndexNowResponse } from '../../../app/components/indexnow-button';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('IndexNowButton helpers', () => {
  it('surfaces API errors with details', async () => {
    await expect(readIndexNowResponse(jsonResponse({
      error: 'Key file unreachable (404)',
      details: 'Expected https://a.test/indexnow-key.txt to return the configured key.',
    }, 400))).resolves.toEqual({
      ok: false,
      error: 'Key file unreachable (404): Expected https://a.test/indexnow-key.txt to return the configured key.',
    });
  });

  it('falls back to status when a failed response has no JSON error payload', async () => {
    await expect(readIndexNowResponse(new Response('not json', { status: 502 }))).resolves.toEqual({
      ok: false,
      error: 'IndexNow request failed (502)',
    });
  });

  it('formats truncated successful submissions', async () => {
    await expect(readIndexNowResponse(jsonResponse({
      ok: true,
      submittedCount: 10_000,
      totalUrls: 12_345,
      truncated: true,
    }))).resolves.toEqual({
      ok: true,
      message: 'IndexNow ping submitted (submitted first 10,000 of 12,345 sitemap URLs)',
    });
  });
});

describe('IndexNowButton', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders failed ping feedback as an alert', () => {
    vi.spyOn(React, 'useState')
      .mockImplementationOnce(() => [false, vi.fn()])
      .mockImplementationOnce(() => [{ tone: 'error', message: 'IndexNow rejected the submission (422)' }, vi.fn()]);

    const html = renderToStaticMarkup(<IndexNowButton siteId="site-a" configured />);

    expect(html).toContain('role="alert"');
    expect(html).toContain('IndexNow rejected the submission (422)');
  });
});
