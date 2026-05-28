import Link from 'next/link';
import { Notice } from '@/components/ui';
import { loadOrFlag, loadSyncOrFallback, loadSyncOrFlag } from '@/lib/page-helpers';
import { NoSitesNotice } from '../components/no-sites-notice';
import { PartialFailureBanner } from '../components/partial-failure-banner';
import { getManagedSites } from '@/lib/sites';
import { SnapshotButton } from '../components/snapshot-button';
import {
  getScTrends,
  getGa4Trends,
  getAuditTrends,
  getTtfbTrends,
  getSnapshotCount,
  getKeywordCount,
  getTopKeywordsWithHistory,
  getKeywordDeltas,
  type KeywordHistoryPoint,
} from '@/lib/db';
import { formatDuration, formatBounce } from '@/lib/format';
import TrendChart from '../components/trend-chart';
import { METRIC_COLORS, CHART_COLORS } from '@/lib/constants';
import { PositionBadge } from '../components/position-badge';
import { TrendBadge } from '../components/trend-badge';
import { TrendsTable } from '../components/trends-table';
import { KeywordRankTable } from '../components/keyword-rank-table';

export const revalidate = 300;

export default async function TrendsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const tab = Array.isArray(sp.tab) ? sp.tab[0] : sp.tab;
  const showKeywordsFirst = tab === 'keywords';

  const partialFailures: string[] = [];
  const snapshotCountResult = loadSyncOrFlag('TrendsPage snapshot count', () => getSnapshotCount(), 0);
  const keywordCountResult = loadSyncOrFlag('TrendsPage keyword count', () => getKeywordCount(), 0);
  const snapshotCount = snapshotCountResult.value;
  const keywordCount = keywordCountResult.value;
  if (snapshotCountResult.failed) partialFailures.push('snapshot count');
  if (keywordCountResult.failed) partialFailures.push('keyword count');
  const countsFailed = snapshotCountResult.failed || keywordCountResult.failed;

  if (!countsFailed && snapshotCount === 0 && keywordCount === 0) {
    return (
      <div className="space-y-8">
        <div>
          <h1 className="text-2xl font-bold text-white">Trends</h1>
          <p className="text-neutral-500 text-sm mt-1">Historical data over time</p>
        </div>
        <Notice tone="warning" size="none" className="rounded-lg border-l-4 border-l-amber-500 p-8 text-center">
          <svg className="size-12 mx-auto text-amber-500 mb-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
          </svg>
          <p className="text-amber-400 font-bold text-lg">No trend data yet</p>
          <p className="text-neutral-500 text-sm mt-2 max-w-lg mx-auto">
            Take snapshots to track SEO performance over time. Each snapshot captures Search Console + GA4 metrics and top-50 keyword rankings for all sites.
          </p>
          <div className="mt-4 bg-neutral-800 rounded-lg p-4 max-w-md mx-auto text-left">
            <p className="text-neutral-400 text-xs mb-2 font-semibold">Quick start:</p>
            <div className="flex justify-center">
              <SnapshotButton />
            </div>
            <p className="text-neutral-600 text-xs mt-3 text-center">Or run <code className="text-emerald-400 font-mono">pnpm seo snapshot</code> from the CLI. Charts appear after 2+ snapshots.</p>
          </div>
        </Notice>
      </div>
    );
  }

  const managedSitesResult = await loadOrFlag('TrendsPage managed sites', getManagedSites(), []);
  const managedSites = managedSitesResult.value;
  if (managedSitesResult.failed) partialFailures.push('managed sites');

  if (managedSites.length === 0) {
    return (
      <div className="space-y-8">
        <div>
          <h1 className="text-2xl font-bold text-white">Trends</h1>
        </div>
        <PartialFailureBanner failures={partialFailures} />
        {managedSitesResult.failed ? (
          <Notice tone="danger" size="none" className="rounded-lg border-l-4 border-l-red-500 p-6" role="alert">
            <p className="text-red-400 font-semibold">Couldn&apos;t load managed sites</p>
            <p className="text-neutral-500 text-sm mt-2">
              The sites table failed to read. Check the server logs and use Refresh to retry.
            </p>
          </Notice>
        ) : (
          <NoSitesNotice variant="inline" />
        )}
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Trends</h1>
          <p className="text-neutral-500 text-sm mt-1">
            {snapshotCount} {snapshotCount === 1 ? 'snapshot' : 'snapshots'} collected
            {snapshotCount === 1 && ' · Run daily for trend data'}
          </p>
        </div>
        <SnapshotButton />
      </div>
      <PartialFailureBanner failures={partialFailures} />
      {showKeywordsFirst ? (
        <>
          <KeywordsSection managedSites={managedSites} keywordCount={keywordCount} />
          <OverviewTab managedSites={managedSites} snapshotCount={snapshotCount} />
        </>
      ) : (
        <>
          <OverviewTab managedSites={managedSites} snapshotCount={snapshotCount} />
          <KeywordsSection managedSites={managedSites} keywordCount={keywordCount} />
        </>
      )}
    </div>
  );
}

function OverviewTab({
  managedSites,
  snapshotCount,
}: {
  managedSites: Awaited<ReturnType<typeof getManagedSites>>;
  snapshotCount: number;
}) {
  const isSingle = snapshotCount === 1;

  const sitesData = managedSites.map((site) => {
    const scTrends = site.searchConsole === false
      ? []
      : loadSyncOrFallback(`TrendsPage SC trends ${site.id}`, () => getScTrends(site.id), []);
    const ga4Trends = loadSyncOrFallback(`TrendsPage GA4 trends ${site.id}`, () => getGa4Trends(site.id), []);
    const auditTrends = loadSyncOrFallback(`TrendsPage audit trends ${site.id}`, () => getAuditTrends(site.id), []);
    const ttfbTrends = loadSyncOrFallback(`TrendsPage TTFB trends ${site.id}`, () => getTtfbTrends(site.id), []);
    const latestGa4 = ga4Trends[ga4Trends.length - 1];
    const latestSc = scTrends[scTrends.length - 1];
    const latestTtfb = ttfbTrends[ttfbTrends.length - 1];
    return { site, scTrends, ga4Trends, auditTrends, ttfbTrends, latestGa4, latestSc, latestTtfb };
  }).sort((a, b) => (b.latestGa4?.users ?? 0) - (a.latestGa4?.users ?? 0));

  return (
    <div>
      <h2 className="text-xs uppercase tracking-wider text-neutral-500 mb-3 font-semibold">Per-Site Data</h2>
      <div className="space-y-4">
        {sitesData.map(({ site, scTrends, ga4Trends, auditTrends, ttfbTrends, latestGa4, latestSc, latestTtfb }) => {
          const hasData = scTrends.length > 0 || ga4Trends.length > 0 || auditTrends.length > 0 || ttfbTrends.length > 0;

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
                  {latestTtfb && (
                    <MetricCell label="TTFB" value={`${latestTtfb.ttfbMs}ms`} color="text-orange-400" />
                  )}
                  {!latestGa4 && !latestSc && !latestTtfb && (
                    <div className="col-span-full text-neutral-600 text-sm">No metrics available</div>
                  )}
                </div>
              </div>
            );
          }

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
              {ttfbTrends.length > 0 && (
                <div>
                  <h3 className="text-neutral-500 text-xs uppercase tracking-wider mb-3 font-semibold">TTFB · ms · lower is better</h3>
                  <TrendChart
                    data={ttfbTrends}
                    lines={[{ key: 'ttfbMs', color: '#f97316', label: 'TTFB (ms)' }]}
                    height={160}
                    valueFormat="integer"
                  />
                </div>
              )}
              {auditTrends.some((row) => row.coveragePct !== undefined) && (
                <div>
                  <h3 className="text-neutral-500 text-xs uppercase tracking-wider mb-3 font-semibold">Indexing Coverage · % of sitemap URLs appearing in search</h3>
                  <TrendChart
                    data={auditTrends}
                    lines={[{ key: 'coveragePct', color: '#38bdf8', label: 'Coverage %' }]}
                    height={160}
                    valueFormat="integer"
                  />
                </div>
              )}
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
                {auditTrends.some((row) => row.coveragePct !== undefined) && (
                  <TrendsTable
                    title="Indexing Coverage"
                    columns={[
                      { label: 'Date' },
                      { label: 'Coverage', align: 'right' },
                      { label: 'Indexed', align: 'right' },
                      { label: 'Sitemap URLs', align: 'right' },
                    ]}
                    rows={auditTrends.map((row) => [
                      <span key="d" className="text-neutral-400">{row.date}</span>,
                      <span key="c" className="text-sky-400">{row.coveragePct !== undefined ? `${row.coveragePct}%` : '—'}</span>,
                      <span key="i" className="text-neutral-400">{row.indexedPages?.toLocaleString() ?? '—'}</span>,
                      <span key="s" className="text-neutral-400">{row.sitemapUrls?.toLocaleString() ?? '—'}</span>,
                    ])}
                  />
                )}
                {ttfbTrends.length > 0 && (
                  <TrendsTable
                    title="TTFB"
                    columns={[
                      { label: 'Date' },
                      { label: 'ms', align: 'right' },
                    ]}
                    rows={ttfbTrends.map((row) => [
                      <span key="d" className="text-neutral-400">{row.date}</span>,
                      <span key="t" className={row.ttfbMs < 800 ? 'text-emerald-400' : row.ttfbMs < 2000 ? 'text-amber-400' : 'text-red-400'}>
                        {row.ttfbMs}ms
                      </span>,
                    ])}
                  />
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function KeywordsSection({
  managedSites,
  keywordCount,
}: {
  managedSites: Awaited<ReturnType<typeof getManagedSites>>;
  keywordCount: number;
}) {
  if (keywordCount === 0) {
    return (
      <section id="keywords" className="space-y-4 scroll-mt-8">
        <div>
          <h2 className="text-lg font-bold text-white">Keyword History</h2>
          <p className="text-neutral-500 text-sm mt-1">Rank movement over time across tracked queries</p>
        </div>
        <Notice tone="warning" size="none" className="rounded-lg border-l-4 border-l-amber-500 p-8 text-center">
          <p className="text-amber-400 font-bold">No keyword history yet</p>
          <p className="text-neutral-500 text-sm mt-2">
            Run <code className="text-emerald-400 font-mono">pnpm seo snapshot</code> to start capturing per-keyword rank data.
          </p>
        </Notice>
      </section>
    );
  }

  const sitesData = managedSites.filter((site) => site.searchConsole !== false).map((site) => {
    const { topQueries, history } = loadSyncOrFallback(
      `TrendsPage keyword history ${site.id}`,
      () => getTopKeywordsWithHistory(site.id, 5, 30),
      { topQueries: [], history: [] },
    );
    const deltas = loadSyncOrFallback(`TrendsPage keyword deltas ${site.id}`, () => getKeywordDeltas(site.id), []);
    return { site, topQueries, history, deltas };
  }).filter((s) => s.topQueries.length > 0);

  return (
    <section id="keywords" className="space-y-4 scroll-mt-8">
      <div>
        <h2 className="text-lg font-bold text-white">Keyword History</h2>
        <p className="text-neutral-500 text-sm mt-1">
          Rank movement over time across tracked queries
          {keywordCount > 0 && <span className="text-neutral-600 font-mono ml-2">{keywordCount.toLocaleString()} keywords</span>}
        </p>
      </div>

      {sitesData.length === 0 ? (
        <Notice size="sm">No keyword data found for any configured site.</Notice>
      ) : (
        <div className="space-y-6">
          {sitesData.map(({ site, topQueries, history, deltas }) => {
            const chartData = buildKeywordChartData(history, topQueries);
            const chartLines = topQueries.map((q, i) => ({
              key: q,
              color: CHART_COLORS[i % CHART_COLORS.length],
              label: q,
            }));

            return (
              <div key={site.id} className="bg-neutral-900 rounded-lg border border-neutral-800 p-5 space-y-5">
                <div className="flex items-center gap-3">
                  <Link href={`/${encodeURIComponent(site.id)}`} className="text-white font-semibold hover:underline">{site.name}</Link>
                  <span className="text-neutral-600 text-xs">{site.domain}</span>
                  <span className="text-neutral-700 text-[10px] ml-auto">{deltas.length} tracked queries</span>
                </div>

                {chartData.length >= 2 && (
                  <div>
                    <h3 className="text-neutral-500 text-xs uppercase tracking-wider mb-3 font-semibold">
                      Position Over Time · top {topQueries.length} queries · lower is better
                    </h3>
                    <TrendChart
                      data={chartData as Parameters<typeof TrendChart>[0]['data']}
                      lines={chartLines}
                      yAxisReversed
                      valueFormat="fixed1"
                      height={220}
                      yAxisWidth={30}
                    />
                  </div>
                )}

                {deltas.length > 0 && (
                  <div>
                    <h3 className="text-neutral-500 text-xs uppercase tracking-wider mb-3 font-semibold">Rank Changes</h3>
                    <KeywordRankTable deltas={deltas} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function buildKeywordChartData(
  history: KeywordHistoryPoint[],
  topQueries: string[],
): Array<{ date: string; [query: string]: string | number }> {
  const byDateQuery = new Map<string, number>();
  const datesSet = new Set<string>();
  for (const r of history) {
    byDateQuery.set(`${r.date}|${r.query}`, r.position);
    datesSet.add(r.date);
  }
  const dates = [...datesSet].sort();
  return dates.map((date) => {
    const point: { date: string; [query: string]: string | number } = { date };
    for (const query of topQueries) {
      if (query === 'date') continue;
      const pos = byDateQuery.get(`${date}|${query}`);
      if (pos !== undefined) point[query] = pos;
    }
    return point;
  });
}

function MetricCell({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div>
      <div className="text-neutral-500 text-[10px] uppercase tracking-wider mb-0.5">{label}</div>
      <div className={`${color} font-mono text-sm font-semibold`}>{value}</div>
    </div>
  );
}
