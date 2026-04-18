export function MetricCard({ label, value, current, previous = 0, accent, icon, invert, valueColor = 'text-white' }: {
  label: string;
  value?: string;
  current: number;
  previous?: number;
  accent: string;
  icon?: React.ReactNode;
  invert?: boolean;
  valueColor?: string;
}) {
  const displayValue = value ?? (current > 0 ? current.toLocaleString() : '\u2014');
  const diff = previous > 0 ? ((current - previous) / previous) * 100 : 0;
  const show = previous > 0 && Math.abs(diff) >= 1;
  const up = invert ? diff < 0 : diff > 0;
  return (
    <div className={`bg-neutral-900 rounded-lg border border-neutral-800 border-l-4 ${accent} p-4`}>
      <div className="flex items-center gap-2 text-neutral-500 mb-2">
        {icon}
        <span className="text-xs uppercase tracking-wider">{label}</span>
      </div>
      <div className="flex items-baseline gap-2">
        <span className={`${valueColor} text-2xl font-mono font-bold`}>{displayValue}</span>
        {show && (
          <span className={`text-[10px] font-medium ${up ? 'text-emerald-400' : 'text-red-400'}`}>
            {diff > 0 ? '\u2191' : '\u2193'}{Math.abs(diff).toFixed(0)}%
          </span>
        )}
      </div>
    </div>
  );
}
