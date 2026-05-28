import Link from 'next/link';
import { dbGetAlertEvents } from '@/lib/db';
import { formatAlertMetricValue, getAlertMetricLabel } from '@/lib/alerts';
import { loadOrFlag, loadSyncOrFlag } from '@/lib/page-helpers';
import { getManagedSites } from '@/lib/sites';
import { Notice } from '@/components/ui';
import { DataTable, type DataTableColumn } from '../components/data-table';
import { PartialFailureBanner } from '../components/partial-failure-banner';

export const revalidate = 300;

const ALERT_COLUMNS: DataTableColumn[] = [
  { label: 'Site', rowHeader: true, className: 'px-4 py-3 font-medium', cellClassName: 'px-4 py-3' },
  { label: 'Metric', className: 'px-4 py-3 font-medium', cellClassName: 'px-4 py-3 text-neutral-300' },
  { label: 'Threshold', className: 'px-4 py-3 font-medium', cellClassName: 'px-4 py-3 text-neutral-300' },
  { label: 'Previous', className: 'px-4 py-3 font-medium', cellClassName: 'px-4 py-3 text-neutral-300' },
  { label: 'Current', className: 'px-4 py-3 font-medium', cellClassName: 'px-4 py-3 text-neutral-300' },
  { label: 'Drop', className: 'px-4 py-3 font-medium', cellClassName: 'px-4 py-3 text-red-400' },
  { label: 'Delivered', className: 'px-4 py-3 font-medium', cellClassName: 'px-4 py-3 text-neutral-300' },
  { label: 'Snapshot', className: 'px-4 py-3 font-medium', cellClassName: 'px-4 py-3 text-neutral-400 font-mono text-xs' },
  { label: 'Created', className: 'px-4 py-3 font-medium', cellClassName: 'px-4 py-3 text-neutral-400 font-mono text-xs' },
];

export default async function AlertsPage() {
  const eventsResult = loadSyncOrFlag('AlertsPage events', () => dbGetAlertEvents(100), []);
  const managedSitesResult = await loadOrFlag('AlertsPage managed sites', getManagedSites(), []);
  const events = eventsResult.value;
  const managedSites = managedSitesResult.value;
  const partialFailures = [
    ...(eventsResult.failed ? ['Alert history'] : []),
    ...(managedSitesResult.failed ? ['Managed sites'] : []),
  ];
  const sitesById = new Map(managedSites.map((site) => [site.id, site]));
  const rows = events.map((event) => {
    const site = sitesById.get(event.siteId);

    return [
      <div key="site">
        <div className="text-white">{site?.name ?? event.siteId}</div>
        <div className="text-xs text-neutral-500 font-mono">{site?.domain ?? event.siteId}</div>
      </div>,
      getAlertMetricLabel(event.metric),
      `${event.thresholdPct}%`,
      formatAlertMetricValue(event.metric, event.previousValue),
      formatAlertMetricValue(event.metric, event.currentValue),
      `${event.deltaPct.toFixed(1)}%`,
      <>
        {event.deliveredChannels.length > 0 ? event.deliveredChannels.join(', ') : 'none'}
        {event.deliveryError && (
          <div className="mt-1 text-xs text-amber-400">{event.deliveryError}</div>
        )}
      </>,
      event.snapshotDate,
      event.createdAt,
    ];
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Alerts</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Recent fired alerts from the snapshot pipeline. Configure rules and delivery in{' '}
          <Link href="/config" className="text-white underline">Config</Link>.
        </p>
      </div>

      <PartialFailureBanner failures={partialFailures} />

      {eventsResult.failed ? (
        <Notice tone="danger" size="none" className="rounded-lg border-l-4 border-l-red-500 p-6">
          <p className="font-semibold text-red-400">Couldn&apos;t load alert history</p>
          <p className="mt-2 text-sm text-neutral-500">
            The alert events table failed to read. Check the server logs and use Refresh to retry.
          </p>
        </Notice>
      ) : events.length === 0 ? (
        <Notice size="none" className="rounded-lg p-6 text-sm text-neutral-500">
          No alerts have fired yet. Add rules in <Link href="/config" className="text-white underline">Config</Link> and run snapshots to populate history.
        </Notice>
      ) : (
        <DataTable
          columns={ALERT_COLUMNS}
          rows={rows}
          rowKeys={events.map((event) => event.id)}
          monospaceCells={false}
          containerClassName="overflow-x-auto rounded-lg border border-neutral-800 bg-neutral-900"
          tableClassName="w-full text-sm text-left"
          bodyClassName=""
          rowClassName="border-b border-neutral-900 last:border-b-0"
        />
      )}
    </div>
  );
}
