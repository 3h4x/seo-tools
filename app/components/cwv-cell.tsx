import { CWV_RATING_COLORS, CWV_THRESHOLDS, type CwvMetricName, type CwvRating } from '@/lib/constants';

export function formatCwv(name: CwvMetricName, value: number): string {
  const unit = CWV_THRESHOLDS[name].unit;
  if (unit === 'score') return value.toFixed(2);
  if (value >= 1000) return `${(value / 1000).toFixed(2)}s`;
  return `${Math.round(value)}ms`;
}

export function CwvCell({ name, value, rating, sub }: {
  name: CwvMetricName;
  value: number | null | undefined;
  rating: CwvRating | null | undefined;
  sub?: string;
}) {
  if (value == null || rating == null) {
    return <span className="text-neutral-600">—</span>;
  }
  const c = CWV_RATING_COLORS[rating];
  return (
    <span className={`inline-flex flex-col leading-tight font-mono ${c.text}`}>
      <span>{formatCwv(name, value)}</span>
      {sub && <span className="text-[10px] text-neutral-500">{sub}</span>}
    </span>
  );
}
