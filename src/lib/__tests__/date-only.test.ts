import { describe, expect, it, vi, afterEach } from 'vitest';
import { addDateOnlyDays, dateOnlyDaysBack, dateStr, parseDateOnly, todayDateOnly } from '../date-only';

afterEach(() => {
  vi.useRealTimers();
});

describe('date-only helpers', () => {
  it('formats local calendar dates as YYYY-MM-DD', () => {
    expect(dateStr(new Date(2026, 4, 9, 23, 30))).toBe('2026-05-09');
  });

  it('uses local calendar days for today and days-back windows', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 4, 21, 1, 30));

    expect(todayDateOnly()).toBe('2026-05-21');
    expect(dateOnlyDaysBack(7)).toBe('2026-05-14');
  });

  it('increments cleanly across DST-sensitive calendar boundaries', () => {
    const date = parseDateOnly('2026-03-28');

    date.setDate(date.getDate() + 1);
    expect(dateStr(date)).toBe('2026-03-29');

    date.setDate(date.getDate() + 1);
    expect(dateStr(date)).toBe('2026-03-30');
    expect(addDateOnlyDays('2026-03-28', 2)).toBe('2026-03-30');
  });
});
