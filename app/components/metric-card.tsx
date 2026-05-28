import type { ReactNode } from 'react';
import { Badge } from '@/components/ui';

export function MetricCard({
  label,
  value,
  current,
  previous = 0,
  accent,
  icon,
  invert,
  valueColor = 'text-white',
  labelAddon,
  footer,
}: {
  label: string;
  value?: string;
  current: number;
  previous?: number;
  accent: string;
  icon?: ReactNode;
  invert?: boolean;
  valueColor?: string;
  labelAddon?: ReactNode;
  footer?: ReactNode;
}) {
  const displayValue = value ?? (current > 0 ? current.toLocaleString() : '\u2014');
  const diff = previous > 0 ? ((current - previous) / previous) * 100 : 0;
  const show = previous > 0 && Math.abs(diff) >= 1;
  const up = invert ? diff < 0 : diff > 0;
  const diffLabel = `${up ? 'Improved' : 'Declined'} by ${Math.abs(diff).toFixed(0)}%`;
  return (
    <div className={`bg-neutral-900 rounded-lg border border-neutral-800 border-l-4 ${accent} p-4`}>
      <div className="flex items-center gap-2 text-neutral-500 mb-2">
        {icon}
        <span className="text-xs uppercase tracking-wider">{label}</span>
        {labelAddon}
      </div>
      <div className="flex items-baseline gap-2">
        <span className={`${valueColor} text-2xl font-mono font-bold`}>{displayValue}</span>
        {show && (
          <Badge className={`!border-0 !px-0 !py-0 !text-[10px] ${up ? 'text-emerald-400' : 'text-red-400'}`} title={diffLabel}>
            <span aria-hidden="true">{diff > 0 ? '\u2191' : '\u2193'}{Math.abs(diff).toFixed(0)}%</span>
            <span className="sr-only">{diffLabel}</span>
          </Badge>
        )}
      </div>
      {footer != null && <div className="text-[10px] text-neutral-500 mt-1">{footer}</div>}
    </div>
  );
}
