export interface KeywordDelta {
  query: string;
  currentPosition: number;
  position7d: number | null;
  position30d: number | null;
  /** Positive = improved (moved up in rankings). Negative = declined. */
  delta7d: number | null;
  delta30d: number | null;
  trend: 'up' | 'down' | 'flat' | 'new';
}

type HistoryRow = { date: string; query: string; position: number };

function findClosest(
  rows: HistoryRow[],
  targetDate: string,
  windowDays: number,
  excludeDate?: string,
): number | null {
  const targetMs = new Date(targetDate).getTime();
  let best: { position: number; diffMs: number } | null = null;
  for (const row of rows) {
    if (excludeDate && row.date === excludeDate) continue;
    const diffMs = Math.abs(new Date(row.date).getTime() - targetMs);
    const diffDays = diffMs / 86_400_000;
    if (diffDays <= windowDays && (!best || diffMs < best.diffMs)) {
      best = { position: row.position, diffMs };
    }
  }
  return best?.position ?? null;
}

export function computeKeywordDeltas(history: HistoryRow[], today: string): KeywordDelta[] {
  const byQuery = new Map<string, HistoryRow[]>();
  for (const row of history) {
    const existing = byQuery.get(row.query) ?? [];
    existing.push(row);
    byQuery.set(row.query, existing);
  }

  const todayMs = new Date(today).getTime();
  const target7d = new Date(todayMs - 7 * 86_400_000).toISOString().split('T')[0];
  const target30d = new Date(todayMs - 30 * 86_400_000).toISOString().split('T')[0];

  const results: KeywordDelta[] = [];

  for (const [query, rows] of byQuery) {
    const currentPosition = findClosest(rows, today, 3);
    if (currentPosition === null) continue;

    const position7d = findClosest(rows, target7d, 2, today);
    const position30d = findClosest(rows, target30d, 5, today);

    // positive delta = improvement (old position was higher number = worse rank)
    const delta7d = position7d !== null ? position7d - currentPosition : null;
    const delta30d = position30d !== null ? position30d - currentPosition : null;

    let trend: KeywordDelta['trend'];
    if (delta7d === null && delta30d === null) {
      trend = 'new';
    } else if ((delta7d ?? delta30d ?? 0) > 0.5) {
      trend = 'up';
    } else if ((delta7d ?? delta30d ?? 0) < -0.5) {
      trend = 'down';
    } else {
      trend = 'flat';
    }

    results.push({ query, currentPosition, position7d, position30d, delta7d, delta30d, trend });
  }

  return results.sort((a, b) => a.currentPosition - b.currentPosition);
}
