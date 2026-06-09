import type { ComponentProps } from 'react';
import type { PerformanceSource } from '@/lib/performance-site';
import { Badge } from '@/components/ui';

type BadgeTone = NonNullable<ComponentProps<typeof Badge>['tone']>;

const SOURCE_BADGE: Record<PerformanceSource, { label: string; tone: BadgeTone; title: string }> = {
  rum: {
    label: 'RUM',
    tone: 'success',
    title: 'Real-user data via GA4 core_web_vitals',
  },
  'rum-pending': {
    label: 'RUM 24h',
    tone: 'info',
    title: 'Events flowing; custom dimensions are still propagating to the Data API',
  },
  'psi-field': {
    label: 'CrUX',
    tone: 'info',
    title: 'PageSpeed Insights field data (CrUX, p75)',
  },
  'psi-lab': {
    label: 'Lab',
    tone: 'accent',
    title: 'Lighthouse lab synthetic measurements',
  },
  none: {
    label: 'No data',
    tone: 'subtle',
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
    <Badge title={badge.title} shape="rounded" uppercase tone={badge.tone} className={className}>
      {badge.label}
    </Badge>
  );
}
