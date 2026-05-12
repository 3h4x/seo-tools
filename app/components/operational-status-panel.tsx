import { formatRelativeTime } from '@/lib/format';
import type { OperationalStatus } from '@/lib/db';

const STATE_STYLES: Record<OperationalStatus['state'], string> = {
  fresh: 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30',
  stale: 'bg-amber-500/15 text-amber-300 border border-amber-500/30',
  never: 'bg-neutral-800 text-neutral-400 border border-neutral-700',
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
        <span className="text-xs px-2 py-0.5 rounded bg-neutral-800 text-neutral-400">Cached status</span>
      </div>
      <p className="text-xs text-neutral-500">
        Freshness is derived from collector, sitemap sync, and snapshot records. GA4 coverage may fall back to saved property IDs when discovery data is unavailable.
      </p>
      {error && (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
          Operational status could not be loaded. Config and site management are still available.
        </div>
      )}
      <div className="grid gap-3 md:grid-cols-2">
        {statuses.map((status) => (
          <div key={status.key} className="rounded-lg border border-neutral-800 bg-neutral-900 p-4 space-y-2">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-medium text-white">{status.label}</h3>
              <span className={`rounded-full px-2 py-0.5 text-xs ${STATE_STYLES[status.state]}`}>
                {STATE_LABELS[status.state]}
              </span>
            </div>
            <p className="text-sm text-neutral-200">{status.reason}</p>
            <div className="space-y-1 text-xs text-neutral-500">
              <p>{renderTimestamp(status.timestamp)}</p>
              {status.details && <p>{status.details}</p>}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
