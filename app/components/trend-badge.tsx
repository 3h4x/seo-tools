export function TrendBadge({ current, previous }: { current: number; previous: number }) {
  if (previous === 0 && current === 0) return null;
  if (previous === 0) return <span className="text-emerald-400 text-[10px] font-medium ml-1">NEW</span>;
  const pct = ((current - previous) / previous) * 100;
  if (Math.abs(pct) < 1) return null;
  const up = pct > 0;
  return (
    <span className={`text-[10px] font-medium ml-1 ${up ? 'text-emerald-400' : 'text-red-400'}`}>
      {up ? '\u2191' : '\u2193'}{Math.abs(pct).toFixed(0)}%
    </span>
  );
}
