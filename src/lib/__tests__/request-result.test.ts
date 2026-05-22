import { describe, expect, it } from 'vitest';
import { formatConfigMutationError, formatNetworkError, getMutationResult } from '../request-result';

describe('getMutationResult', () => {
  it('returns ok for successful mutation payloads', async () => {
    const response = new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });

    await expect(getMutationResult(response, 'Delete failed')).resolves.toEqual({ ok: true });
  });

  it('surfaces payload errors for non-2xx responses', async () => {
    const response = new Response(JSON.stringify({ ok: false, error: 'Site is still referenced' }), {
      status: 409,
      headers: { 'content-type': 'application/json' },
    });

    await expect(getMutationResult(response, 'Delete failed')).resolves.toEqual({
      ok: false,
      error: 'Site is still referenced',
    });
  });

  it('treats 2xx payload failures as errors instead of success', async () => {
    const response = new Response(JSON.stringify({ ok: false, error: 'Delete rejected' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });

    await expect(getMutationResult(response, 'Delete failed')).resolves.toEqual({
      ok: false,
      error: 'Delete rejected',
    });
  });

  it('falls back to the caller-provided message when the payload is missing', async () => {
    const response = new Response(null, { status: 200 });

    await expect(getMutationResult(response, 'Delete failed')).resolves.toEqual({
      ok: false,
      error: 'Delete failed',
    });
  });
});

describe('formatNetworkError', () => {
  it('surfaces Error messages from failed browser requests', () => {
    expect(formatNetworkError(new TypeError('Failed to fetch'))).toBe('Failed to fetch');
  });

  it('falls back when the thrown value is not an Error with a message', () => {
    expect(formatNetworkError('offline', 'Request failed')).toBe('Request failed');
    expect(formatNetworkError(new Error(''), 'Request failed')).toBe('Request failed');
  });
});

describe('formatConfigMutationError', () => {
  it('maps config API codes to operator-facing messages', () => {
    expect(formatConfigMutationError('failed_to_load_config_source', 'Load failed')).toBe(
      'Could not load config source. Check server logs.',
    );
    expect(formatConfigMutationError('failed_to_save_config', 'Save failed')).toBe(
      'Could not save config. Check server logs.',
    );
    expect(formatConfigMutationError('failed_to_delete_config', 'Remove failed')).toBe(
      'Could not remove config. Check server logs.',
    );
  });

  it('passes through validation messages and falls back for blank errors', () => {
    expect(formatConfigMutationError('Invalid JSON', 'Save failed')).toBe('Invalid JSON');
    expect(formatConfigMutationError('   ', 'Save failed')).toBe('Save failed');
    expect(formatConfigMutationError(undefined, 'Save failed')).toBe('Save failed');
  });
});
