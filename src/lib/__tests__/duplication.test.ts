import { describe, it, expect } from 'vitest';
import { formatRelativeTime } from '@/lib/format';

describe('formatRelativeTime', () => {
  it('formats 5 minutes ago', () => {
    const timestamp = Date.now() - 5 * 60 * 1000;
    expect(formatRelativeTime(timestamp)).toBe('5m ago');
  });

  it('formats various time deltas', () => {
    const now = Date.now();
    expect(formatRelativeTime(now - 1000)).toBe('just now');
    expect(formatRelativeTime(now - 30 * 1000)).toBe('just now');
    expect(formatRelativeTime(now - 2 * 60 * 1000)).toBe('2m ago');
    expect(formatRelativeTime(now - 1 * 60 * 60 * 1000)).toBe('1h ago');
    expect(formatRelativeTime(now - 12 * 60 * 60 * 1000)).toBe('12h ago');
    expect(formatRelativeTime(now - 24 * 60 * 60 * 1000)).toBe('yesterday');
    expect(formatRelativeTime(now - 3 * 24 * 60 * 60 * 1000)).toBe('3d ago');
  });
});
