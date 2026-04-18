import { describe, it, expect, vi, afterEach } from 'vitest';
import { pluralize, formatSource, formatDuration, formatBounce, daysAgo, formatRelativeTime } from '../format';

describe('pluralize', () => {
  it('uses singular for count of 1', () => {
    expect(pluralize(1, 'page')).toBe('1 page');
  });

  it('uses plural for count of 0', () => {
    expect(pluralize(0, 'page')).toBe('0 pages');
  });

  it('uses plural for count > 1', () => {
    expect(pluralize(5, 'page')).toBe('5 pages');
  });

  it('formats large numbers with locale separators', () => {
    const result = pluralize(1000, 'click');
    expect(result).toMatch(/1[,.]?000 clicks/);
  });
});

describe('formatSource', () => {
  it('maps known source/medium pairs', () => {
    expect(formatSource('google', 'organic')).toBe('Google (Organic)');
    expect(formatSource('bing', 'organic')).toBe('Bing (Organic)');
    expect(formatSource('t.co', 'referral')).toBe('Twitter/X');
    expect(formatSource('(direct)', '(none)')).toBe('Direct');
    expect(formatSource('(not set)', '(not set)')).toBe('Unknown');
    expect(formatSource('google', 'cpc')).toBe('Google Ads');
  });

  it('returns source alone when medium is (none)', () => {
    expect(formatSource('newsletter', '(none)')).toBe('newsletter');
  });

  it('returns source alone when medium is (not set)', () => {
    expect(formatSource('partner', '(not set)')).toBe('partner');
  });

  it('capitalizes source for organic medium', () => {
    expect(formatSource('duckduckgo', 'organic')).toBe('Duckduckgo (Organic)');
  });

  it('returns source alone for referral medium', () => {
    expect(formatSource('reddit.com', 'referral')).toBe('reddit.com');
  });

  it('concatenates unknown source/medium pairs', () => {
    expect(formatSource('foo', 'bar')).toBe('foo / bar');
  });
});

describe('formatDuration', () => {
  it('returns 0s for zero', () => {
    expect(formatDuration(0)).toBe('0s');
  });

  it('formats seconds only', () => {
    expect(formatDuration(45)).toBe('45s');
  });

  it('formats minutes and seconds', () => {
    expect(formatDuration(90)).toBe('1m 30s');
  });

  it('formats minutes with zero seconds', () => {
    expect(formatDuration(120)).toBe('2m 0s');
  });

  it('rounds partial seconds', () => {
    expect(formatDuration(61.6)).toBe('1m 2s');
  });
});

describe('formatBounce', () => {
  it('formats 0 rate as 0%', () => {
    expect(formatBounce(0)).toBe('0%');
  });

  it('formats 1 rate as 100%', () => {
    expect(formatBounce(1)).toBe('100%');
  });

  it('formats 0.5 as 50%', () => {
    expect(formatBounce(0.5)).toBe('50%');
  });

  it('formats fractional rates without decimals', () => {
    expect(formatBounce(0.123)).toBe('12%');
  });
});

describe('daysAgo', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns today minus N days in YYYY-MM-DD format', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-06-15T12:00:00Z'));
    expect(daysAgo(0)).toBe('2025-06-15');
    expect(daysAgo(1)).toBe('2025-06-14');
    expect(daysAgo(7)).toBe('2025-06-08');
    expect(daysAgo(30)).toBe('2025-05-16');
  });

  it('produces a string matching YYYY-MM-DD format', () => {
    expect(daysAgo(3)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('formatRelativeTime', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns "just now" for less than 60 seconds ago', () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000_000);
    expect(formatRelativeTime(1_000_000_000 - 30_000)).toBe('just now');
    expect(formatRelativeTime(1_000_000_000)).toBe('just now');
  });

  it('returns minutes ago for 1-59 minutes', () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000_000);
    expect(formatRelativeTime(1_000_000_000 - 5 * 60_000)).toBe('5m ago');
    expect(formatRelativeTime(1_000_000_000 - 59 * 60_000)).toBe('59m ago');
  });

  it('returns hours ago for 1-23 hours', () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000_000);
    expect(formatRelativeTime(1_000_000_000 - 2 * 3_600_000)).toBe('2h ago');
    expect(formatRelativeTime(1_000_000_000 - 23 * 3_600_000)).toBe('23h ago');
  });

  it('returns "yesterday" for exactly 1 day ago', () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000_000);
    expect(formatRelativeTime(1_000_000_000 - 24 * 3_600_000)).toBe('yesterday');
  });

  it('returns days ago for more than 1 day', () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000_000);
    expect(formatRelativeTime(1_000_000_000 - 3 * 24 * 3_600_000)).toBe('3d ago');
  });
});
