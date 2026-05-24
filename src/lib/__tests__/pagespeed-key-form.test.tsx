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

  it('renders a skeleton while loading PageSpeed config', () => {
    const html = renderToStaticMarkup(<PagespeedKeyForm />);

    expect(html).toContain('aria-label="Loading PageSpeed config"');
    expect(html).toContain('animate-pulse bg-neutral-800 rounded');
  });

  it('renders PageSpeed request failures as an alert', () => {
    vi.spyOn(React, 'useState')
      .mockImplementationOnce(() => ['none', vi.fn()])
      .mockImplementationOnce(() => ['', vi.fn()])
      .mockImplementationOnce(() => ['error', vi.fn()])
      .mockImplementationOnce(() => ['Request failed', vi.fn()])
      .mockImplementationOnce(() => [false, vi.fn()])
      .mockImplementationOnce(() => [false, vi.fn()])
      .mockImplementationOnce(() => [false, vi.fn()]);

    const html = renderToStaticMarkup(<PagespeedKeyForm />);

    expect(html).toContain('role="alert"');
    expect(html).toContain('Request failed');
  });

  it('renders successful PageSpeed checks as a status update', () => {
    vi.spyOn(React, 'useState')
      .mockImplementationOnce(() => ['none', vi.fn()])
      .mockImplementationOnce(() => ['', vi.fn()])
      .mockImplementationOnce(() => ['ok', vi.fn()])
      .mockImplementationOnce(() => ['', vi.fn()])
      .mockImplementationOnce(() => [false, vi.fn()])
      .mockImplementationOnce(() => [false, vi.fn()])
      .mockImplementationOnce(() => [false, vi.fn()]);

    const html = renderToStaticMarkup(<PagespeedKeyForm />);

    expect(html).toContain('role="status"');
    expect(html).toContain('Key works');
  });

  it('disables the remove button while removing a stored key', () => {
    vi.spyOn(React, 'useState')
      .mockImplementationOnce(() => ['db', vi.fn()])
      .mockImplementationOnce(() => ['', vi.fn()])
      .mockImplementationOnce(() => ['idle', vi.fn()])
      .mockImplementationOnce(() => ['', vi.fn()])
      .mockImplementationOnce(() => [false, vi.fn()])
      .mockImplementationOnce(() => [true, vi.fn()])
      .mockImplementationOnce(() => [false, vi.fn()]);

    const html = renderToStaticMarkup(<PagespeedKeyForm />);

    expect(html).toContain('disabled');
    expect(html).toContain('Removing…');
    expect(html).toContain('for="pagespeed-api-key"');
    expect(html).toContain('id="pagespeed-api-key"');
  });
});
