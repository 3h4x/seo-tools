import { describe, it, expect, vi } from 'vitest';

// Mock external dependencies so importing decay.ts doesn't require Google API
vi.mock('../search-console', () => ({
  getSearchConsolePagesForPeriod: vi.fn(),
}));
vi.mock('../sites', () => ({
  MANAGED_SITES: [],
  getSCUrl: vi.fn((site: { domain: string }) => site.domain),
}));

import { classifySeverity } from '../decay';

describe('classifySeverity', () => {
  it('classifies as severe when clicks dropped by more than 50%', () => {
    expect(classifySeverity(-51, 0)).toBe('severe');
  });

  it('classifies as severe when clicks dropped by exactly 50%', () => {
    // boundary: < -50 is severe, so -50 is NOT severe
    expect(classifySeverity(-50, 0)).toBe('moderate');
  });

  it('classifies as severe when position worsened by more than 5', () => {
    expect(classifySeverity(0, 6)).toBe('severe');
  });

  it('classifies as moderate when clicks dropped 20-50%', () => {
    expect(classifySeverity(-25, 0)).toBe('moderate');
  });

  it('classifies as moderate when position worsened by 2-5', () => {
    expect(classifySeverity(0, 3)).toBe('moderate');
  });

  it('classifies as moderate at the -20 boundary', () => {
    // boundary: < -20 is moderate; -20 is not moderate, should be mild
    expect(classifySeverity(-20, 0)).toBe('mild');
  });

  it('classifies as mild for small drops', () => {
    expect(classifySeverity(-10, 1)).toBe('mild');
  });

  it('classifies as mild for zero changes', () => {
    expect(classifySeverity(0, 0)).toBe('mild');
  });

  it('classifies as mild for positive clicks delta (growth)', () => {
    expect(classifySeverity(50, 0)).toBe('mild');
  });
});
