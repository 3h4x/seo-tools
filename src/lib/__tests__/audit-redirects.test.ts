import { beforeEach, describe, expect, it, vi } from 'vitest';

const { safeFetchMock } = vi.hoisted(() => ({
  safeFetchMock: vi.fn(),
}));

vi.mock('../audit-fetch', () => ({
  GOOGLEBOT_UA: 'Googlebot-Test',
  safeFetch: safeFetchMock,
}));

import { checkRedirectChain } from '../audit-redirects';
import type { FetchResult } from '../audit-types';

function makeFetchResult(overrides: Partial<FetchResult> = {}): FetchResult {
  return {
    ok: true,
    status: 200,
    text: '',
    headers: new Headers(),
    ttfbMs: 25,
    ...overrides,
  };
}

describe('checkRedirectChain', () => {
  beforeEach(() => {
    safeFetchMock.mockReset();
  });

  it('passes pages that do not redirect', async () => {
    safeFetchMock.mockResolvedValueOnce(makeFetchResult());

    const result = await checkRedirectChain('https://example.com/', '/');

    expect(result.status).toBe('pass');
    expect(result.message).toBe('No redirects');
    expect(result.hopCount).toBe(0);
    expect(result.finalUrl).toBe('https://example.com/');
    expect(safeFetchMock).toHaveBeenCalledWith('https://example.com/', {
      ua: 'Googlebot-Test',
      redirect: 'manual',
    });
  });

  it('passes a single permanent redirect', async () => {
    safeFetchMock
      .mockResolvedValueOnce(makeFetchResult({
        ok: false,
        status: 301,
        headers: new Headers({ location: '/final' }),
      }))
      .mockResolvedValueOnce(makeFetchResult());

    const result = await checkRedirectChain('https://example.com/start', '/start');

    expect(result.status).toBe('pass');
    expect(result.message).toBe('1 permanent redirect hop');
    expect(result.hopCount).toBe(1);
    expect(result.finalUrl).toBe('https://example.com/final');
    expect(result.details).toBe('https://example.com/start (301) -> https://example.com/final');
  });

  it('fails when any redirect hop is temporary', async () => {
    safeFetchMock
      .mockResolvedValueOnce(makeFetchResult({
        ok: false,
        status: 302,
        headers: new Headers({ location: 'https://example.com/final' }),
      }))
      .mockResolvedValueOnce(makeFetchResult());

    const result = await checkRedirectChain('https://example.com/start', '/start');

    expect(result.status).toBe('fail');
    expect(result.message).toBe('1 hop with temporary redirect');
    expect(result.hasTemporaryRedirect).toBe(true);
  });

  it('fails when a redirect response has no Location header', async () => {
    safeFetchMock.mockResolvedValueOnce(makeFetchResult({ ok: false, status: 301 }));

    const result = await checkRedirectChain('https://example.com/start', '/start');

    expect(result.status).toBe('fail');
    expect(result.message).toBe('Redirect missing Location header (301)');
    expect(result.hopCount).toBe(0);
  });

  it('fails when a redirect loop is detected', async () => {
    safeFetchMock
      .mockResolvedValueOnce(makeFetchResult({
        ok: false,
        status: 301,
        headers: new Headers({ location: '/two' }),
      }))
      .mockResolvedValueOnce(makeFetchResult({
        ok: false,
        status: 301,
        headers: new Headers({ location: '/start' }),
      }));

    const result = await checkRedirectChain('https://example.com/start', '/start');

    expect(result.status).toBe('fail');
    expect(result.message).toBe('Redirect loop detected');
    expect(result.loopDetected).toBe(true);
    expect(result.hopCount).toBe(2);
  });
});
