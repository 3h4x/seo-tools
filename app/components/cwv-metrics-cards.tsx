import type { ReactNode } from 'react';
import { CWV_METRIC_ORDER, CWV_RATING_COLORS, type CwvMetricName, type CwvRating } from '@/lib/constants';
import { formatCwv } from './cwv-cell';

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
          <div key={name} className={`bg-neutral-900 rounded-lg border border-neutral-800 border-l-4 ${accent} p-4`}>
            <div className="flex items-center gap-2 text-neutral-500 mb-2">
              <span className="text-xs uppercase tracking-wider">{name}</span>
              {m && <span className={`text-[10px] ${CWV_RATING_COLORS[m.rating].text}`}>{CWV_RATING_COLORS[m.rating].label}</span>}
            </div>
            <div className="text-2xl font-mono font-bold text-white">
              {m ? formatCwv(name, m.value) : '—'}
            </div>
            {footer != null && <div className="text-[10px] text-neutral-500 mt-1">{footer}</div>}
          </div>
        );
      })}
    </div>
  );
}
