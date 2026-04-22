import Link from 'next/link';
import { getManagedSites } from '@/lib/sites';
import { getScTrends, getGa4Trends, getAuditTrends, getSnapshotCount } from '@/lib/db';
import { formatDuration, formatBounce } from '@/lib/format';
import TrendChart from '../components/trend-chart';
import { METRIC_COLORS } from '@/lib/constants';
import { PositionBadge } from '../components/position-badge';
import { TrendBadge } from '../components/trend-badge';
import { TrendsTable } from '../components/trends-table';

export const revalidate = 300;

export default async function TrendsPage() {
  let snapshotCount: number;
  try {
    snapshotCount = getSnapshotCount();
  } catch {
    snapshotCount = 0;
  }

  if (snapshotCount === 0) {
    return (
      <div className="space-y-8">
        <div>
          <h1 className="text-2xl font-bold text-white">Trends</h1>
          <p className="text-neutral-500 text-sm mt-1">Historical data over time</p>
        </div>
        <div className="bg-neutral-900 rounded-lg border border-neutral-800 border-l-4 border-l-amber-500 p-8 text-center">
          <svg className="size-12 mx-auto text-amber-500 mb-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
          </svg>
          <p className="text-amber-400 font-bold text-lg">No trend data yet</p>
          <p className="text-neutral-500 text-sm mt-2 max-w-lg mx-auto">
            Take snapshots to track SEO performance over time. Each snapshot captures Search Console + GA4 metrics for all sites.
          </p>
          <div className="mt-4 bg-neutral-800 rounded-lg p-4 max-w-md mx-auto text-left">
            <p className="text-neutral-400 text-xs mb-2 font-semibold">Quick start:</p>
            <code className="text-emerald-400 text-xs font-mono">pnpm seo snapshot</code>
            <p className="text-neutral-600 text-xs mt-2">Run daily via cron for best results. Charts appear after 2+ snapshots.</p>
          </div>
        </div>
      </div>
    );
  }

  // Gather all site data and sort by GA4 users (most active first)
  const managedSites = await getManagedSites();

  if (managedSites.length === 0) {
    return (
      <div className="space-y-8">
        <div>
          <h1 className="text-2xl font-bold text-white">Trends</h1>
        </div>
        <p className="text-neutral-500 text-sm">
          No sites configured —{' '}
          <Link href="/config" className="text-white underline">add sites in the Config tab</Link>.
        </p>
      </div>
    );
  }

  const sitesData = managedSites.map((site) => {
    const scTrends = getScTrends(site.id);
    const ga4Trends = getGa4Trends(site.id);
    const auditTrends = getAuditTrends(site.id);
    const latestGa4 = ga4Trends[ga4Trends.length - 1];
    const latestSc = scTrends[scTrends.length - 1];
    return { site, scTrends, ga4Trends, auditTrends, latestGa4, latestSc };
  }).sort((a, b) => (b.latestGa4?.users ?? 0) - (a.latestGa4?.users ?? 0));

  const isSingle = snapshotCount === 1;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white">Trends</h1>
        <p className="text-neutral-500 text-sm mt-1">
          {snapshotCount} {snapshotCount === 1 ? 'snapshot' : 'snapshots'} collected
          {isSingle && ' \u00b7 Run daily for trend data'}
        </p>
      </div>
      <div>
        <h2 className="text-xs uppercase tracking-wider text-neutral-500 mb-3 font-semibold">Per-Site Data</h2>
        <div className="space-y-4">
          {sitesData.map(({ site, scTrends, ga4Trends, auditTrends, latestGa4, latestSc }) => {
            const hasData = scTrends.length > 0 || ga4Trends.length > 0 || auditTrends.length > 0;

            if (!hasData) {
              return (
                <div key={site.id} className="bg-neutral-900 rounded-lg border border-neutral-800 p-5">
                  <div className="flex items-center gap-3">
                    <span className="text-white font-semibold">{site.name}</span>
                    <span className="text-neutral-600 text-xs">{site.domain}</span>
                  </div>
                  <p className="text-neutral-600 text-sm mt-2">No data captured yet.</p>
                </div>
              );
            }

            // For single snapshot, show metric cards. For multiple, show tables.
            if (isSingle) {
              return (
                <div key={site.id} className="bg-neutral-900 rounded-lg border border-neutral-800 p-5">
                  <div className="flex items-center gap-3 mb-4">
                    <span className="text-white font-semibold">{site.name}</span>
                    <span className="text-neutral-600 text-xs">{site.domain}</span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-3">
                    {latestGa4 && (
                      <>
                        <MetricCell label="Users" value={latestGa4.users.toLocaleString()} color="text-blue-400" />
                        <MetricCell label="Sessions" value={latestGa4.sessions.toLocaleString()} color="text-violet-400" />
                        <MetricCell label="Views" value={latestGa4.views.toLocaleString()} color="text-amber-400" />
                        <MetricCell label="Bounce" value={formatBounce(latestGa4.bounceRate)} color="text-neutral-300" />
                        <MetricCell label="Avg Duration" value={formatDuration(latestGa4.avgDuration)} color="text-neutral-300" />
                      </>
                    )}
                    {latestSc && (
                      <>
                        <MetricCell label="SC Clicks" value={latestSc.clicks.toLocaleString()} color="text-emerald-400" />
                        <MetricCell label="SC Position" value={latestSc.position.toFixed(1)} color="text-neutral-300" />
                      </>
                    )}
                    {!latestGa4 && !latestSc && (
                      <div className="col-span-full text-neutral-600 text-sm">No metrics available</div>
                    )}
                  </div>
                </div>
              );
            }

            // Multiple snapshots: show charts + tables
            return (
              <div key={site.id} className="bg-neutral-900 rounded-lg border border-neutral-800 p-5 space-y-5">
                <div className="flex items-center gap-3">
                  <span className="text-white font-semibold">{site.name}</span>
                  <span className="text-neutral-600 text-xs">{site.domain}</span>
                  <span className="text-neutral-700 text-[10px] ml-auto">{ga4Trends.length || scTrends.length} data points</span>
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                  {ga4Trends.length > 0 && (
                    <div>
                      <h3 className="text-neutral-500 text-xs uppercase tracking-wider mb-3 font-semibold">GA4 Traffic</h3>
                      <TrendChart
                        data={ga4Trends}
                        lines={[
                          { key: 'users', color: METRIC_COLORS.users, label: 'Users' },
                          { key: 'views', color: METRIC_COLORS.views, label: 'Views' },
                          { key: 'sessions', color: METRIC_COLORS.sessions, label: 'Sessions' },
                        ]}
                      />
                    </div>
                  )}
                  {scTrends.length > 0 && (
                    <div>
                      <h3 className="text-neutral-500 text-xs uppercase tracking-wider mb-3 font-semibold">Search Console</h3>
                      <TrendChart
                        data={scTrends}
                        lines={[
                          { key: 'clicks', color: METRIC_COLORS.clicks, label: 'Clicks' },
                          { key: 'impressions', color: METRIC_COLORS.impressions, label: 'Impressions' },
                        ]}
                      />
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                  {ga4Trends.length > 0 && (
                    <TrendsTable
                      title="GA4 Data"
                      columns={[
                        { label: 'Date' },
                        { label: 'Users', align: 'right' },
                        { label: 'Sessions', align: 'right' },
                        { label: 'Views', align: 'right' },
                        { label: 'Bounce', align: 'right' },
                        { label: 'Duration', align: 'right' },
                      ]}
                      rows={ga4Trends.map((row, i) => {
                        const prev = ga4Trends[i - 1];
                        return [
                          <span key="d" className="text-neutral-400">{row.date}</span>,
                          <span key="u" className="inline-flex items-center gap-1"><span className="text-neutral-300">{row.users.toLocaleString()}</span>{prev && <TrendBadge current={row.users} previous={prev.users} />}</span>,
                          <span key="s" className="text-neutral-400">{row.sessions.toLocaleString()}</span>,
                          <span key="v" className="text-neutral-400">{row.views.toLocaleString()}</span>,
                          <span key="b" className="text-neutral-400">{formatBounce(row.bounceRate)}</span>,
                          <span key="dur" className="text-neutral-400">{formatDuration(row.avgDuration)}</span>,
                        ];
                      })}
                    />
                  )}

                  {scTrends.length > 0 && (
                    <TrendsTable
                      title="SC Data"
                      columns={[
                        { label: 'Date' },
                        { label: 'Clicks', align: 'right' },
                        { label: 'Impr', align: 'right' },
                        { label: 'CTR', align: 'right' },
                        { label: 'Position', align: 'right' },
                      ]}
                      rows={scTrends.map((row, i) => {
                        const prev = scTrends[i - 1];
                        return [
                          <span key="d" className="text-neutral-400">{row.date}</span>,
                          <span key="c" className="inline-flex items-center gap-1"><span className="text-neutral-300">{row.clicks.toLocaleString()}</span>{prev && <TrendBadge current={row.clicks} previous={prev.clicks} />}</span>,
                          <span key="i" className="text-neutral-400">{row.impressions.toLocaleString()}</span>,
                          <span key="ctr" className="text-neutral-400">{(row.ctr * 100).toFixed(1)}%</span>,
                          <PositionBadge key="pos" position={row.position} />,
                        ];
                      })}
                    />
                  )}

                  {auditTrends.length > 0 && (
                    <TrendsTable
                      title="Audit Score"
                      columns={[
                        { label: 'Date' },
                        { label: 'Pass', align: 'right' },
                        { label: 'Warn', align: 'right' },
                        { label: 'Fail', align: 'right' },
                      ]}
                      rows={auditTrends.map((row) => [
                        <span key="d" className="text-neutral-400">{row.date}</span>,
                        <span key="p" className="text-emerald-400">{row.pass}</span>,
                        <span key="w" className="text-amber-400">{row.warn}</span>,
                        <span key="f" className="text-red-400">{row.fail}</span>,
                      ])}
                    />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function MetricCell({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div>
      <div className="text-neutral-500 text-[10px] uppercase tracking-wider mb-0.5">{label}</div>
      <div className={`${color} font-mono text-sm font-semibold`}>{value}</div>
    </div>
  );
}

