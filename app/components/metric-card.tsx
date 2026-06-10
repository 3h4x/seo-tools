import type { ReactNode } from 'react';
import { Badge, Surface } from '@/components/ui';

type MetricAccentTone = 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'muted';

const METRIC_ACCENT_CLASSES: Record<MetricAccentTone, string> = {
  success: 'border-l-emerald-500',
  warning: 'border-l-amber-500',
  danger: 'border-l-red-500',
  info: 'border-l-blue-500',
  neutral: 'border-l-neutral-600',
  muted: 'border-l-neutral-700',
};

export function MetricCard({
  label,
  value,
  current,
  previous = 0,
  accent,
  accentTone,
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
  accent?: string;
  accentTone?: MetricAccentTone;
  icon?: ReactNode;
  invert?: boolean;
  valueColor?: string;
  labelAddon?: ReactNode;
  footer?: ReactNode;
}) {
  const accentClassName = accent ?? (accentTone ? METRIC_ACCENT_CLASSES[accentTone] : undefined);
  const displayValue = value ?? (current > 0 ? current.toLocaleString() : '\u2014');
  const diff = previous > 0 ? ((current - previous) / previous) * 100 : 0;
  const show = previous > 0 && Math.abs(diff) >= 1;
  const up = invert ? diff < 0 : diff > 0;
  const diffLabel = `${up ? 'Improved' : 'Declined'} by ${Math.abs(diff).toFixed(0)}%`;
  return (
    <Surface padding="sm" leftAccentClassName={accentClassName}>
      <div className="flex items-center gap-2 text-neutral-500 mb-2">
        {icon}
        <Badge size="inline" borderless uppercase className="text-xs text-neutral-500 font-normal">
          {label}
        </Badge>
        {labelAddon}
      </div>
      <div className="flex items-baseline gap-2">
        <span className={`${valueColor} text-2xl font-mono font-bold`}>{displayValue}</span>
        {show && (
          <Badge size="inline" borderless tone={up ? 'successText' : 'dangerText'} title={diffLabel}>
            <span aria-hidden="true">{diff > 0 ? '\u2191' : '\u2193'}{Math.abs(diff).toFixed(0)}%</span>
            <span className="sr-only">{diffLabel}</span>
          </Badge>
        )}
      </div>
      {footer != null && <div className="text-[10px] text-neutral-500 mt-1">{footer}</div>}
    </Surface>
  );
}
