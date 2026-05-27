import { describe, it, expect } from 'vitest';
import {
  siteRouteOk,
  siteRouteError,
  siteValidationError,
  siteNotFoundError,
  getRequiredQueryParam,
  parseOrderedSiteIds,
} from '../site-route';

describe('siteRouteOk', () => {
  it('returns 200 with { ok: true }', async () => {
    const res = siteRouteOk();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});

describe('siteRouteError', () => {
  it('defaults to 400 with { ok: false, error }', async () => {
    const res = siteRouteError('something went wrong');
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ ok: false, error: 'something went wrong' });
  });

  it('uses a custom status when provided', async () => {
    const res = siteRouteError('forbidden', { status: 403 });
    expect(res.status).toBe(403);
  });

  it('includes errors field when provided', async () => {
    const res = siteRouteError('validation failed', { errors: { id: 'bad id' } });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      ok: false,
      error: 'validation failed',
      errors: { id: 'bad id' },
    });
  });

  it('omits errors field when not provided', async () => {
    const body = await siteRouteError('plain error').json();
    expect(body).not.toHaveProperty('errors');
  });
});

describe('siteValidationError', () => {
  it('joins non-empty field errors into the error string', async () => {
    const res = siteValidationError({ id: 'id is required', name: 'name is required' });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error).toContain('id is required');
    expect(body.error).toContain('name is required');
    expect(body.errors).toEqual({ id: 'id is required', name: 'name is required' });
  });

  it('ignores undefined field errors', async () => {
    const res = siteValidationError({ id: 'bad id', name: undefined });
    const body = await res.json();
    expect(body.error).toBe('bad id');
  });
});

describe('siteNotFoundError', () => {
  it('returns 404 with error message', async () => {
    const res = siteNotFoundError();
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'Site not found' });
  });
});

describe('getRequiredQueryParam', () => {
  it('returns trimmed value for a present non-empty param', () => {
    const sp = new URLSearchParams({ key: '  hello  ' });
    expect(getRequiredQueryParam(sp, 'key')).toBe('hello');
  });

  it('returns null for a missing param', () => {
    const sp = new URLSearchParams();
    expect(getRequiredQueryParam(sp, 'key')).toBeNull();
  });

  it('returns null for an empty string param', () => {
    const sp = new URLSearchParams({ key: '' });
    expect(getRequiredQueryParam(sp, 'key')).toBeNull();
  });

  it('returns null for a whitespace-only param', () => {
    const sp = new URLSearchParams({ key: '   ' });
    expect(getRequiredQueryParam(sp, 'key')).toBeNull();
  });
});

describe('parseOrderedSiteIds', () => {
  it('returns null for non-array input', () => {
    expect(parseOrderedSiteIds(null)).toBeNull();
    expect(parseOrderedSiteIds(undefined)).toBeNull();
    expect(parseOrderedSiteIds('site-a')).toBeNull();
    expect(parseOrderedSiteIds(42)).toBeNull();
    expect(parseOrderedSiteIds({ 0: 'site-a' })).toBeNull();
  });

  it('returns an empty array for an empty input array', () => {
    expect(parseOrderedSiteIds([])).toEqual([]);
  });

  it('returns trimmed ids for a valid string array', () => {
    expect(parseOrderedSiteIds(['site-a', '  site-b  ', 'site-c'])).toEqual([
      'site-a',
      'site-b',
      'site-c',
    ]);
  });

  it('returns null when any entry is a non-string', () => {
    expect(parseOrderedSiteIds(['site-a', 42])).toBeNull();
    expect(parseOrderedSiteIds(['site-a', null])).toBeNull();
    expect(parseOrderedSiteIds(['site-a', {}])).toBeNull();
  });

  it('returns null when any string entry is empty', () => {
    expect(parseOrderedSiteIds(['site-a', ''])).toBeNull();
  });

  it('returns null when any string entry is whitespace-only', () => {
    expect(parseOrderedSiteIds(['site-a', '   '])).toBeNull();
  });
});
