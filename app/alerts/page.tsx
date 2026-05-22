import Link from 'next/link';
import { dbGetAlertEvents } from '@/lib/db';
import { formatAlertMetricValue, getAlertMetricLabel } from '@/lib/alerts';
import { loadOrFallback, loadSyncOrFallback } from '@/lib/page-helpers';
import { getManagedSites } from '@/lib/sites';

export const revalidate = 300;

export default async function AlertsPage() {
  const events = loadSyncOrFallback('AlertsPage events', () => dbGetAlertEvents(100), []);
  const managedSites = await loadOrFallback('AlertsPage managed sites', getManagedSites(), []);
  const sitesById = new Map(managedSites.map((site) => [site.id, site]));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Alerts</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Recent fired alerts from the snapshot pipeline. Configure rules and delivery in{' '}
          <Link href="/config" className="text-white underline">Config</Link>.
        </p>
      </div>

      {events.length === 0 ? (
        <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-6 text-sm text-neutral-500">
          No alerts have fired yet. Add rules in <Link href="/config" className="text-white underline">Config</Link> and run snapshots to populate history.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-neutral-800 bg-neutral-900">
          <table className="w-full text-sm text-left">
            <thead>
              <tr className="border-b border-neutral-800 text-neutral-500">
                <th className="px-4 py-3 font-medium">Site</th>
                <th className="px-4 py-3 font-medium">Metric</th>
                <th className="px-4 py-3 font-medium">Threshold</th>
                <th className="px-4 py-3 font-medium">Previous</th>
                <th className="px-4 py-3 font-medium">Current</th>
                <th className="px-4 py-3 font-medium">Drop</th>
                <th className="px-4 py-3 font-medium">Delivered</th>
                <th className="px-4 py-3 font-medium">Snapshot</th>
                <th className="px-4 py-3 font-medium">Created</th>
              </tr>
            </thead>
            <tbody>
              {events.map((event) => {
                const site = sitesById.get(event.siteId);
                return (
                  <tr key={event.id} className="border-b border-neutral-900 last:border-b-0">
                    <td className="px-4 py-3">
                      <div className="text-white">{site?.name ?? event.siteId}</div>
                      <div className="text-xs text-neutral-500 font-mono">{site?.domain ?? event.siteId}</div>
                    </td>
                    <td className="px-4 py-3 text-neutral-300">{getAlertMetricLabel(event.metric)}</td>
                    <td className="px-4 py-3 text-neutral-300">{event.thresholdPct}%</td>
                    <td className="px-4 py-3 text-neutral-300">{formatAlertMetricValue(event.metric, event.previousValue)}</td>
                    <td className="px-4 py-3 text-neutral-300">{formatAlertMetricValue(event.metric, event.currentValue)}</td>
                    <td className="px-4 py-3 text-red-400">{event.deltaPct.toFixed(1)}%</td>
                    <td className="px-4 py-3 text-neutral-300">
                      {event.deliveredChannels.length > 0 ? event.deliveredChannels.join(', ') : 'none'}
                      {event.deliveryError && (
                        <div className="mt-1 text-xs text-amber-400">{event.deliveryError}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-neutral-400 font-mono text-xs">{event.snapshotDate}</td>
                    <td className="px-4 py-3 text-neutral-400 font-mono text-xs">{event.createdAt}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
