import { Badge } from '@/components/ui';

export function TrendBadge({ current, previous }: { current: number; previous: number }) {
  if (previous === 0 && current === 0) return null;
  if (previous === 0) {
    return (
      <Badge size="inline" borderless tone="successText" className="ml-1" title="New value">
        <span aria-hidden="true">NEW</span>
        <span className="sr-only">New value</span>
      </Badge>
    );
  }
  const pct = ((current - previous) / previous) * 100;
  if (Math.abs(pct) < 1) return null;
  const up = pct > 0;
  const pctValue = Math.abs(pct).toFixed(0);
  const pctLabel = `${up ? 'Increased' : 'Decreased'} by ${pctValue}%`;
  return (
    <Badge size="inline" borderless tone={up ? 'successText' : 'dangerText'} className="ml-1" title={pctLabel}>
      <span aria-hidden="true">{up ? '\u2191' : '\u2193'}{pctValue}%</span>
      <span className="sr-only">{pctLabel}</span>
    </Badge>
  );
}
