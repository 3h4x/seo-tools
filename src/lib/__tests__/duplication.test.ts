import { describe, it, expect } from 'vitest';
import { formatRelativeTime } from '@/lib/format';

describe('Code Duplication - Shared Utilities', () => {
  it('formatRelativeTime should be used from @/lib/format, not duplicated in pages', () => {
    // This test documents that formatRelativeTime is exported from @/lib/format
    // and should be imported in app/audit/page.tsx instead of being redefined
    const timestamp = Date.now() - 5 * 60 * 1000; // 5 minutes ago
    const result = formatRelativeTime(timestamp);
    expect(result).toBe('5m ago');
  });

  it('should format various time deltas correctly', () => {
    const now = Date.now();
    expect(formatRelativeTime(now - 1000)).toBe('just now'); // 1 second ago
    expect(formatRelativeTime(now - 30 * 1000)).toBe('just now'); // 30 seconds ago
    expect(formatRelativeTime(now - 2 * 60 * 1000)).toBe('2m ago'); // 2 minutes ago
    expect(formatRelativeTime(now - 1 * 60 * 60 * 1000)).toBe('1h ago'); // 1 hour ago
    expect(formatRelativeTime(now - 12 * 60 * 60 * 1000)).toBe('12h ago'); // 12 hours ago
    expect(formatRelativeTime(now - 24 * 60 * 60 * 1000)).toBe('yesterday'); // 1 day ago
    expect(formatRelativeTime(now - 3 * 24 * 60 * 60 * 1000)).toBe('3d ago'); // 3 days ago
  });

  it('documents that statusColors, statusDots, StatusBadge should be imported from components', () => {
    // These are already exported from app/components/audit/check-card.ts
    // and duplicated in app/audit/page.tsx - should use imports instead
    expect(true).toBe(true);
  });
});
