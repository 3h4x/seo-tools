import { describe, expect, it } from 'vitest';
import {
  SKIP_CHECK_OPTIONS,
  getSkipCheckId,
  hasSkipCheck,
  normalizeSkipChecks,
  toggleSkipCheck,
} from '../skip-checks';

describe('skip-check helpers', () => {
  it('exposes stable ids for the Config UI options', () => {
    expect(SKIP_CHECK_OPTIONS.find((option) => option.id === 'ogImage')?.label).toBe('OG Image');
    expect(SKIP_CHECK_OPTIONS.find((option) => option.id === 'ogImageMeta')?.label).toBe('og:image');
  });

  it('normalizes legacy labels and identifier-style keys to canonical ids', () => {
    expect(normalizeSkipChecks(['OG Image', 'Internal Links', 'canonical'])).toEqual([
      'ogImage',
      'internalLinks',
      'canonical',
    ]);
    expect(normalizeSkipChecks(['ogImage', 'internalLinks', 'jsonLd'])).toEqual([
      'ogImage',
      'internalLinks',
      'jsonLd',
    ]);
  });

  it('keeps og:image distinct from the OG Image asset check', () => {
    expect(getSkipCheckId('og:image')).toBe('ogImageMeta');
    expect(getSkipCheckId('ogImage')).toBe('ogImage');
    expect(normalizeSkipChecks(['og:image', 'ogImage'])).toEqual(['ogImageMeta', 'ogImage']);
  });

  it('treats existing identifier-style keys as selected in the UI helper path', () => {
    const current = ['ogImage', 'internalLinks'];
    expect(hasSkipCheck(current, 'ogImage')).toBe(true);
    expect(hasSkipCheck(current, 'internalLinks')).toBe(true);
    expect(hasSkipCheck(current, 'canonical')).toBe(false);
  });

  it('preserves canonical ids when toggling checkboxes for save payloads', () => {
    const current = ['ogImage', 'internalLinks'];
    expect(toggleSkipCheck(current, 'internalLinks', true)).toEqual(['ogImage', 'internalLinks']);
    expect(toggleSkipCheck(current, 'canonical', true)).toEqual(['ogImage', 'internalLinks', 'canonical']);
    expect(toggleSkipCheck(current, 'ogImage', false)).toEqual(['internalLinks']);
  });
});
