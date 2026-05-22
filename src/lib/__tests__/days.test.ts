import { describe, expect, it } from 'vitest';
import { normalizeAllowedNumber, parseAllowedIntegerParam, parseIntegerParam } from '../days';

describe('days helpers', () => {
  it('parses integer query params', () => {
    expect(parseIntegerParam('28', 7)).toBe(28);
    expect(Number.isNaN(parseIntegerParam('abc', 7))).toBe(true);
    expect(Number.isNaN(parseIntegerParam('28abc', 7))).toBe(true);
    expect(Number.isNaN(parseIntegerParam('28.5', 7))).toBe(true);
    expect(Number.isNaN(parseIntegerParam('1e2', 7))).toBe(true);
    expect(Number.isNaN(parseIntegerParam('', 7))).toBe(true);
    expect(parseIntegerParam(undefined, 7)).toBe(7);
    expect(parseIntegerParam(['28', '90'], 7)).toBe(28);
    expect(parseIntegerParam([], 7)).toBe(7);
  });

  it('normalizes values against an allowlist', () => {
    expect(normalizeAllowedNumber(28, [7, 28] as const, 7)).toBe(28);
    expect(normalizeAllowedNumber(90, [7, 28] as const, 7)).toBe(7);
  });

  it('parses and normalizes allowed integer params', () => {
    expect(parseAllowedIntegerParam('28', [7, 28] as const, 7)).toBe(28);
    expect(parseAllowedIntegerParam('abc', [7, 28] as const, 7)).toBe(7);
    expect(parseAllowedIntegerParam('90', [7, 28] as const, 7)).toBe(7);
    expect(parseAllowedIntegerParam(['28', '90'], [7, 28] as const, 7)).toBe(28);
  });
});
