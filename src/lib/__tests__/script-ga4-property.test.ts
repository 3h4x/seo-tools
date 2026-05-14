import { describe, expect, it } from 'vitest';

import { normalizeGa4PropertyId } from '../../../scripts/ga4-property.mjs';

describe('script normalizeGa4PropertyId', () => {
  it('prefixes bare numeric property IDs', () => {
    expect(normalizeGa4PropertyId('123')).toBe('properties/123');
  });

  it('keeps already-prefixed property IDs unchanged', () => {
    expect(normalizeGa4PropertyId('properties/123')).toBe('properties/123');
  });

  it('ignores empty values', () => {
    expect(normalizeGa4PropertyId('   ')).toBeUndefined();
  });
});
