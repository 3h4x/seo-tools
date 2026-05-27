import type { PerformanceSource } from '@/lib/performance-site';
import { Badge } from '@/components/ui';

const SOURCE_BADGE: Record<PerformanceSource, { label: string; className: string; title: string }> = {
  rum: {
    label: 'RUM',
    className: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
    title: 'Real-user data via GA4 core_web_vitals',
  },
  'rum-pending': {
    label: 'RUM 24h',
    className: 'bg-blue-500/15 text-blue-300 border-blue-500/30',
    title: 'Events flowing; custom dimensions are still propagating to the Data API',
  },
  'psi-field': {
    label: 'CrUX',
    className: 'bg-blue-500/15 text-blue-300 border-blue-500/30',
    title: 'PageSpeed Insights field data (CrUX, p75)',
  },
  'psi-lab': {
    label: 'Lab',
    className: 'bg-violet-500/15 text-violet-300 border-violet-500/30',
    title: 'Lighthouse lab synthetic measurements',
  },
  none: {
    label: 'No data',
    className: 'bg-neutral-800 text-neutral-500 border-neutral-700',
    title: 'No RUM events and PSI returned no metrics',
  },
};

type PerformanceSourceBadgeProps = {
  source: PerformanceSource;
  className?: string;
};

export function PerformanceSourceBadge({ source, className }: PerformanceSourceBadgeProps) {
  const badge = SOURCE_BADGE[source];

  return (
    <Badge title={badge.title} shape="rounded" uppercase className={[badge.className, className].filter(Boolean).join(' ')}>
      {badge.label}
    </Badge>
  );
}
