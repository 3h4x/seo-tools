import { describe, expect, it } from 'vitest';

import { normalizeGa4PropertyId } from '../ga4-property';

describe('normalizeGa4PropertyId', () => {
  it('returns undefined for null', () => {
    expect(normalizeGa4PropertyId(null)).toBeUndefined();
  });

  it('returns undefined for undefined', () => {
    expect(normalizeGa4PropertyId(undefined)).toBeUndefined();
  });

  it('returns undefined for empty string', () => {
    expect(normalizeGa4PropertyId('')).toBeUndefined();
  });

  it('returns undefined for whitespace-only string', () => {
    expect(normalizeGa4PropertyId('   ')).toBeUndefined();
  });

  it('prepends properties/ prefix to a bare numeric id', () => {
    expect(normalizeGa4PropertyId('123456789')).toBe('properties/123456789');
  });

  it('returns an already-prefixed id unchanged', () => {
    expect(normalizeGa4PropertyId('properties/123456789')).toBe('properties/123456789');
  });

  it('trims whitespace before normalizing a bare id', () => {
    expect(normalizeGa4PropertyId('  123456789  ')).toBe('properties/123456789');
  });

  it('trims whitespace before returning an already-prefixed id', () => {
    expect(normalizeGa4PropertyId('  properties/123456789  ')).toBe('properties/123456789');
  });
});
