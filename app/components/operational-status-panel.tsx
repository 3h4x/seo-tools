import type { ComponentProps } from 'react';
import { formatRelativeTime } from '@/lib/format';
import type { OperationalStatus } from '@/lib/db';
import { Badge, Notice, Surface } from '@/components/ui';

type BadgeTone = NonNullable<ComponentProps<typeof Badge>['tone']>;

const STATE_TONES: Record<OperationalStatus['state'], BadgeTone> = {
  fresh: 'success',
  stale: 'warning',
  never: 'muted',
};

const STATE_LABELS: Record<OperationalStatus['state'], string> = {
  fresh: 'Fresh',
  stale: 'Stale',
  never: 'Never',
};

function renderTimestamp(timestamp: number | null): string {
  if (timestamp === null) return 'No timestamp yet';
  return `Updated ${formatRelativeTime(timestamp)}`;
}

export default function OperationalStatusPanel({
  statuses,
  error = false,
}: {
  statuses: OperationalStatus[];
  error?: boolean;
}) {
  return (
    <section className="space-y-3 max-w-5xl">
      <div className="flex items-center gap-3">
        <h2 className="text-base font-semibold text-white">Operational Status</h2>
        <Badge shape="rounded" size="compact" tone="muted">
          Cached status
        </Badge>
      </div>
      <p className="text-xs text-neutral-500">
        Freshness is derived from collector, sitemap sync, and snapshot records. GA4 coverage may fall back to saved property IDs when discovery data is unavailable.
      </p>
      {error && (
        <Notice tone="warning" size="sm">
          Operational status could not be loaded. Config and site management are still available.
        </Notice>
      )}
      <div className="grid gap-3 md:grid-cols-2">
        {statuses.map((status) => (
          <Surface key={status.key} padding="sm" className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-medium text-white">{status.label}</h3>
              <Badge size="compact" tone={STATE_TONES[status.state]}>
                {STATE_LABELS[status.state]}
              </Badge>
            </div>
            <p className="text-sm text-neutral-200">{status.reason}</p>
            <div className="space-y-1 text-xs text-neutral-500">
              <p>{renderTimestamp(status.timestamp)}</p>
              {status.details && <p>{status.details}</p>}
            </div>
          </Surface>
        ))}
      </div>
    </section>
  );
}
