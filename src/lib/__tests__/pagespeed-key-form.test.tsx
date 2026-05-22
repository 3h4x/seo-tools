import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import * as React from 'react';
import PagespeedKeyForm, { readPagespeedConfigResponse } from '../../../app/components/pagespeed-key-form';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('PagespeedKeyForm helpers', () => {
  it('returns the configured source from a valid response', async () => {
    await expect(readPagespeedConfigResponse(jsonResponse({ source: 'db' }))).resolves.toBe('db');
  });

  it('surfaces API errors from failed responses', async () => {
    await expect(readPagespeedConfigResponse(jsonResponse({ error: 'PSI config unavailable' }, 500))).rejects.toThrow('PSI config unavailable');
  });

  it('maps config source load codes from failed responses', async () => {
    await expect(readPagespeedConfigResponse(jsonResponse({ error: 'failed_to_load_config_source' }, 500))).rejects.toThrow(
      'Could not load config source. Check server logs.',
    );
  });

  it('rejects malformed successful responses', async () => {
    await expect(readPagespeedConfigResponse(jsonResponse({ source: 'bad' }))).rejects.toThrow('PageSpeed config response was invalid');
  });
});

describe('PagespeedKeyForm', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders PageSpeed request failures as an alert', () => {
    vi.spyOn(React, 'useState')
      .mockImplementationOnce(() => ['none', vi.fn()])
      .mockImplementationOnce(() => ['', vi.fn()])
      .mockImplementationOnce(() => ['error', vi.fn()])
      .mockImplementationOnce(() => ['Request failed', vi.fn()])
      .mockImplementationOnce(() => [false, vi.fn()])
      .mockImplementationOnce(() => [false, vi.fn()]);

    const html = renderToStaticMarkup(<PagespeedKeyForm />);

    expect(html).toContain('role="alert"');
    expect(html).toContain('Request failed');
  });
});
