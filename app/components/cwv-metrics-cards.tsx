import type { ReactNode } from 'react';
import { CWV_METRIC_ORDER, CWV_RATING_COLORS, type CwvMetricName, type CwvRating } from '@/lib/constants';
import { formatCwv } from './cwv-cell';
import { MetricCard } from './metric-card';

export function CwvMetricsCards({
  metrics,
  source,
  getFooter,
}: {
  metrics: Partial<Record<CwvMetricName, { value: number; rating: CwvRating; sampleCount?: number }>>;
  source?: string;
  getFooter?: (name: CwvMetricName) => ReactNode;
}) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
      {CWV_METRIC_ORDER.map((name) => {
        const m = metrics[name];
        const accent = m ? CWV_RATING_COLORS[m.rating].border : 'border-neutral-700';
        const footer = getFooter
          ? getFooter(name)
          : source
            ? (m?.sampleCount ? `${m.sampleCount.toLocaleString()} samples · ${source}` : source)
            : null;
        return (
          <MetricCard
            key={name}
            label={name}
            value={m ? formatCwv(name, m.value) : undefined}
            current={m?.value ?? 0}
            accent={accent}
            labelAddon={m && (
              <span className={`text-[10px] ${CWV_RATING_COLORS[m.rating].text}`}>
                {CWV_RATING_COLORS[m.rating].label}
              </span>
            )}
            footer={footer}
          />
        );
      })}
    </div>
  );
}
