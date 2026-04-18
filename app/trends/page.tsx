import Link from 'next/link';
import { getManagedSites } from '@/lib/sites';
import { getScTrends, getGa4Trends, getAuditTrends, getSnapshotCount, type ScTrendPoint, type Ga4TrendPoint } from '@/lib/db';
import { formatDuration, formatBounce } from '@/lib/format';
import TrendChart from '../components/trend-chart';
import { PositionBadge } from '../components/position-badge';
import { MetricCard } from '../components/metric-card';

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

  // Aggregate totals from latest snapshot
  const totals = sitesData.reduce(
    (acc, { latestGa4, latestSc }) => {
      if (latestGa4) { acc.users += latestGa4.users; acc.views += latestGa4.views; acc.sessions += latestGa4.sessions; }
      if (latestSc) { acc.clicks += latestSc.clicks; acc.impressions += latestSc.impressions; }
      return acc;
    },
    { users: 0, views: 0, sessions: 0, clicks: 0, impressions: 0 },
  );

  const isSingle = snapshotCount === 1;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">Trends</h1>
        <p className="text-neutral-500 text-sm mt-1">
          {snapshotCount} {snapshotCount === 1 ? 'snapshot' : 'snapshots'} collected
          {isSingle && ' \u00b7 Run daily for trend data'}
        </p>
      </div>

      {/* Aggregate summary */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        <MetricCard label="Total Users" current={totals.users} accent="border-blue-500" />
        <MetricCard label="Total Views" current={totals.views} accent="border-amber-500" />
        <MetricCard label="Total Sessions" current={totals.sessions} accent="border-violet-500" />
        <MetricCard label="SC Clicks" current={totals.clicks} accent="border-emerald-500" />
        <MetricCard label="SC Impressions" current={totals.impressions} accent="border-cyan-500" />
      </div>

      {/* Per-site cards */}
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

                {/* Charts */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                  {ga4Trends.length > 0 && (
                    <div>
                      <h3 className="text-neutral-500 text-xs uppercase tracking-wider mb-3 font-semibold">GA4 Traffic</h3>
                      <TrendChart
                        data={ga4Trends}
                        lines={[
                          { key: 'users', color: '#3b82f6', label: 'Users' },
                          { key: 'views', color: '#f59e0b', label: 'Views' },
                          { key: 'sessions', color: '#8b5cf6', label: 'Sessions' },
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
                          { key: 'clicks', color: '#10b981', label: 'Clicks' },
                          { key: 'impressions', color: '#06b6d4', label: 'Impressions' },
                        ]}
                      />
                    </div>
                  )}
                </div>

                {/* Data tables */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                  {/* GA4 Table */}
                  {ga4Trends.length > 0 && (
                    <div>
                      <h3 className="text-neutral-500 text-xs uppercase tracking-wider mb-2 font-semibold">GA4 Data</h3>
                      <div className="overflow-hidden rounded border border-neutral-800 max-h-64 overflow-y-auto">
                        <table className="w-full text-xs">
                          <thead className="sticky top-0 bg-neutral-900">
                            <tr className="border-b border-neutral-800 text-neutral-500">
                              <th className="px-3 py-2 text-left font-semibold">Date</th>
                              <th className="px-3 py-2 text-right font-semibold">Users</th>
                              <th className="px-3 py-2 text-right font-semibold">Sessions</th>
                              <th className="px-3 py-2 text-right font-semibold">Views</th>
                              <th className="px-3 py-2 text-right font-semibold">Bounce</th>
                              <th className="px-3 py-2 text-right font-semibold">Duration</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-neutral-800">
                            {ga4Trends.map((row, i) => {
                              const prev = ga4Trends[i - 1];
                              return (
                                <tr key={row.date} className="hover:bg-neutral-800/30">
                                  <td className="px-3 py-2 text-neutral-400 font-mono">{row.date}</td>
                                  <td className="px-3 py-2 text-right font-mono">
                                    <span className="text-neutral-300">{row.users.toLocaleString()}</span>
                                    {prev && <Delta current={row.users} previous={prev.users} />}
                                  </td>
                                  <td className="px-3 py-2 text-right text-neutral-400 font-mono">{row.sessions.toLocaleString()}</td>
                                  <td className="px-3 py-2 text-right text-neutral-400 font-mono">{row.views.toLocaleString()}</td>
                                  <td className="px-3 py-2 text-right text-neutral-400 font-mono">{formatBounce(row.bounceRate)}</td>
                                  <td className="px-3 py-2 text-right text-neutral-400 font-mono">{formatDuration(row.avgDuration)}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* SC Table */}
                  {scTrends.length > 0 && (
                    <div>
                      <h3 className="text-neutral-500 text-xs uppercase tracking-wider mb-2 font-semibold">SC Data</h3>
                      <div className="overflow-hidden rounded border border-neutral-800 max-h-64 overflow-y-auto">
                        <table className="w-full text-xs">
                          <thead className="sticky top-0 bg-neutral-900">
                            <tr className="border-b border-neutral-800 text-neutral-500">
                              <th className="px-3 py-2 text-left font-semibold">Date</th>
                              <th className="px-3 py-2 text-right font-semibold">Clicks</th>
                              <th className="px-3 py-2 text-right font-semibold">Impr</th>
                              <th className="px-3 py-2 text-right font-semibold">CTR</th>
                              <th className="px-3 py-2 text-right font-semibold">Position</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-neutral-800">
                            {scTrends.map((row, i) => {
                              const prev = scTrends[i - 1];
                              return (
                                <tr key={row.date} className="hover:bg-neutral-800/30">
                                  <td className="px-3 py-2 text-neutral-400 font-mono">{row.date}</td>
                                  <td className="px-3 py-2 text-right font-mono">
                                    <span className="text-neutral-300">{row.clicks.toLocaleString()}</span>
                                    {prev && <Delta current={row.clicks} previous={prev.clicks} />}
                                  </td>
                                  <td className="px-3 py-2 text-right text-neutral-400 font-mono">{row.impressions.toLocaleString()}</td>
                                  <td className="px-3 py-2 text-right text-neutral-400 font-mono">{(row.ctr * 100).toFixed(1)}%</td>
                                  <td className="px-3 py-2 text-right"><PositionBadge position={row.position} /></td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Audit Table */}
                  {auditTrends.length > 0 && (
                    <div>
                      <h3 className="text-neutral-500 text-xs uppercase tracking-wider mb-2 font-semibold">Audit Score</h3>
                      <div className="overflow-hidden rounded border border-neutral-800 max-h-64 overflow-y-auto">
                        <table className="w-full text-xs">
                          <thead className="sticky top-0 bg-neutral-900">
                            <tr className="border-b border-neutral-800 text-neutral-500">
                              <th className="px-3 py-2 text-left font-semibold">Date</th>
                              <th className="px-3 py-2 text-right font-semibold">Pass</th>
                              <th className="px-3 py-2 text-right font-semibold">Warn</th>
                              <th className="px-3 py-2 text-right font-semibold">Fail</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-neutral-800">
                            {auditTrends.map((row) => (
                              <tr key={row.date} className="hover:bg-neutral-800/30">
                                <td className="px-3 py-2 text-neutral-400 font-mono">{row.date}</td>
                                <td className="px-3 py-2 text-right text-emerald-400 font-mono">{row.pass}</td>
                                <td className="px-3 py-2 text-right text-amber-400 font-mono">{row.warn}</td>
                                <td className="px-3 py-2 text-right text-red-400 font-mono">{row.fail}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
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

function Delta({ current, previous }: { current: number; previous: number }) {
  if (previous === 0) return null;
  const pct = ((current - previous) / previous) * 100;
  if (Math.abs(pct) < 1) return null;
  const up = pct > 0;
  return (
    <span className={`text-[10px] font-medium ml-1 ${up ? 'text-emerald-400' : 'text-red-400'}`}>
      {up ? '\u2191' : '\u2193'}{Math.abs(pct).toFixed(0)}%
    </span>
  );
}
