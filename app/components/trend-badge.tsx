import { Badge } from '@/components/ui';

const trendBadgeClassName = '!border-0 !px-0 !py-0 !text-[10px] !font-medium ml-1';

export function TrendBadge({ current, previous }: { current: number; previous: number }) {
  if (previous === 0 && current === 0) return null;
  if (previous === 0) {
    return (
      <Badge className={`${trendBadgeClassName} text-emerald-400`} title="New value">
        <span aria-hidden="true">NEW</span>
        <span className="sr-only">New value</span>
      </Badge>
    );
  }
  const pct = ((current - previous) / previous) * 100;
  if (Math.abs(pct) < 1) return null;
  const up = pct > 0;
  const pctLabel = `${up ? 'Increased' : 'Decreased'} by ${Math.abs(pct).toFixed(0)}%`;
  return (
    <Badge className={`${trendBadgeClassName} ${up ? 'text-emerald-400' : 'text-red-400'}`} title={pctLabel}>
      <span aria-hidden="true">{up ? '\u2191' : '\u2193'}{Math.abs(pct).toFixed(0)}%</span>
      <span className="sr-only">{pctLabel}</span>
    </Badge>
  );
}
