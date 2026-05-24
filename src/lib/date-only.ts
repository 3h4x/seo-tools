export function dateStr(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function parseDateOnly(value: string): Date {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day, 12);
}

export function addDateOnlyDays(value: string, days: number): string {
  const date = parseDateOnly(value);
  date.setDate(date.getDate() + days);
  return dateStr(date);
}

export function batchRanges(dates: string[]): Array<{ start: string; end: string }> {
  if (dates.length === 0) return [];

  const sorted = [...dates].sort();
  const ranges: Array<{ start: string; end: string }> = [];
  let rangeStart = sorted[0];
  let prev = sorted[0];

  for (let i = 1; i < sorted.length; i++) {
    const expected = addDateOnlyDays(prev, 1);
    if (sorted[i] !== expected) {
      ranges.push({ start: rangeStart, end: prev });
      rangeStart = sorted[i];
    }
    prev = sorted[i];
  }

  ranges.push({ start: rangeStart, end: prev });
  return ranges;
}

export function dateOnlyDaysBack(days: number, from = new Date()): string {
  const date = new Date(from);
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() - days);
  return dateStr(date);
}

export function todayDateOnly(from = new Date()): string {
  return dateStr(from);
}
