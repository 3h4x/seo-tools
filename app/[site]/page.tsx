import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getManagedSite, getSCUrl } from '@/lib/sites';
import { discoverPropertyIds, cachedGetAnalytics } from '@/lib/ga4';
import {
  cachedGetSearchConsoleDataWithComparison,
  cachedGetSearchConsoleQueries,
  cachedGetSearchConsolePages,
  cachedGetSitemapSubmissions,
} from '@/lib/search-console';
import { cachedAuditSite } from '@/lib/audit';
import { analyzeSiteGaps } from '@/lib/gaps';
import { getScDaily, getGa4Daily } from '@/lib/db';
import { pluralize, formatSource, formatDuration, formatBounce } from '@/lib/format';
import TimeRange from '../components/time-range';
import { TrendBadge } from '../components/trend-badge';
import { SummaryCard } from '../components/summary-card';
import { Icons } from '../components/icons';
import TrendChart from '../components/trend-chart';
import { MetricCard } from '../components/metric-card';
import { CheckCard, statusDots } from '../components/audit/check-card';
import { Recommendation } from '../components/audit/recommendation';
import { MetaChecksTable } from '../components/audit/meta-checks-table';
import { gapsBySection } from '../components/audit/gap-helpers';
import { ExportButton } from '../components/export-button';
import { PositionBadge } from '../components/position-badge';

export const revalidate = 300;

const VALID_DAYS = [1, 7, 30, 90, 180, 365];

export default async function SiteDashboardPage({
  params,
  searchParams,
}: {
  params: Promise<{ site: string }>;
  searchParams: Promise<{ days?: string }>;
}) {
  const { site: siteId } = await params;
  const site = await getManagedSite(siteId);
  if (!site) notFound();

  const sp = await searchParams;
  const rawDays = parseInt(sp.days || '7');
  const days = VALID_DAYS.includes(rawDays) ? rawDays : 7;

  // Discover GA4 property ID
  const discovered = await discoverPropertyIds();
  const propertyId = discovered.find((s) => s.id === siteId)?.ga4PropertyId || site.ga4PropertyId || '';

  const scUrl = getSCUrl(site);

  const [audit, sitemapSubmissions, scComparison, scQueries, scPages, ga4Data] = await Promise.all([
    cachedAuditSite(site),
    site.searchConsole ? cachedGetSitemapSubmissions(scUrl) : Promise.resolve([]),
    site.searchConsole ? cachedGetSearchConsoleDataWithComparison(scUrl, days) : null,
    site.searchConsole ? cachedGetSearchConsoleQueries(scUrl, days) : null,
    site.searchConsole ? cachedGetSearchConsolePages(scUrl, days) : null,
    cachedGetAnalytics(propertyId, days),
  ]);

  const gapAnalysis = analyzeSiteGaps(audit, site);
  const sections = gapsBySection(gapAnalysis.gaps);
  const totalGaps = gapAnalysis.gaps.length;

  const sc = scComparison;
  const hasSc = sc && sc.current.clicks > 0;
  const hasGa4 = ga4Data && ga4Data.current.users > 0;

  let scDaily: ReturnType<typeof getScDaily> = [];
  let ga4DailyData: ReturnType<typeof getGa4Daily> = [];
  try {
    scDaily = getScDaily(siteId);
    ga4DailyData = getGa4Daily(siteId);
  } catch { /* no data yet */ }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <Link href="/" className="text-neutral-500 hover:text-neutral-300 text-sm transition-colors">&larr; Overview</Link>
          <h1 className="text-2xl font-bold text-white mt-1">{site.name}</h1>
          <p className="text-neutral-500 text-sm mt-1">{site.domain} &middot; Last {days} days</p>
        </div>
        <TimeRange />
      </div>

      {/* Audit Score Summary */}
      <div className="flex flex-wrap gap-6">
        <div className="flex items-center gap-2">
          <div className="size-2 rounded-full bg-emerald-500" />
          <span className="text-emerald-400 font-mono text-sm font-bold">{audit.score.pass}</span>
          <span className="text-neutral-500 text-xs">passed</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="size-2 rounded-full bg-amber-500" />
          <span className="text-amber-400 font-mono text-sm font-bold">{audit.score.warn}</span>
          <span className="text-neutral-500 text-xs">warnings</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="size-2 rounded-full bg-red-500" />
          <span className="text-red-400 font-mono text-sm font-bold">{audit.score.fail + audit.score.error}</span>
          <span className="text-neutral-500 text-xs">failures</span>
        </div>
        {totalGaps > 0 && (
          <div className="flex items-center gap-2 ml-auto">
            <span className="text-neutral-300 font-mono text-sm font-bold">{totalGaps}</span>
            <span className="text-neutral-500 text-xs">recommendations</span>
            {gapAnalysis.counts.high > 0 && <span className="text-red-400 text-xs font-mono">{gapAnalysis.counts.high} high</span>}
            {gapAnalysis.counts.medium > 0 && <span className="text-amber-400 text-xs font-mono">{gapAnalysis.counts.medium} med</span>}
            {gapAnalysis.counts.low > 0 && <span className="text-blue-400 text-xs font-mono">{gapAnalysis.counts.low} low</span>}
          </div>
        )}
      </div>

      {/* SC Metrics */}
      <div>
        <h2 className="text-xs uppercase tracking-wider text-neutral-500 mb-3 font-semibold">Search Console</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <SummaryCard icon={Icons.clicks} label="Clicks" value={sc?.current.clicks ?? 0} previous={sc?.previous.clicks} accent="border-emerald-500" />
          <SummaryCard icon={Icons.impressions} label="Impressions" value={sc?.current.impressions ?? 0} previous={sc?.previous.impressions} accent="border-cyan-500" />
          <MetricCard label="CTR" value={hasSc ? `${(sc!.current.ctr * 100).toFixed(2)}%` : '\u2014'} current={hasSc ? sc!.current.ctr * 100 : 0} previous={hasSc ? sc!.previous.ctr * 100 : 0} accent="border-violet-500" icon={Icons.ctr} />
          <MetricCard label="Avg Position" value={hasSc ? sc!.current.position.toFixed(1) : '\u2014'} current={hasSc ? sc!.current.position : 0} previous={hasSc ? sc!.previous.position : 0} accent="border-amber-500" icon={Icons.position} invert />
        </div>
      </div>

      {/* GA4 Metrics */}
      <div>
        <h2 className="text-xs uppercase tracking-wider text-neutral-500 mb-3 font-semibold">GA4 Analytics</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          <SummaryCard icon={Icons.users} label="Users" value={ga4Data?.current.users ?? 0} previous={ga4Data?.previous.users} accent="border-blue-500" />
          <SummaryCard icon={Icons.sessions} label="Sessions" value={ga4Data?.current.sessions ?? 0} previous={ga4Data?.previous.sessions} accent="border-pink-500" />
          <SummaryCard icon={Icons.views} label="Page Views" value={ga4Data?.current.views ?? 0} previous={ga4Data?.previous.views} accent="border-amber-500" />
          <MetricCard label="Bounce Rate" value={hasGa4 ? formatBounce(ga4Data!.current.bounceRate) : '\u2014'} current={hasGa4 ? ga4Data!.current.bounceRate * 100 : 0} previous={hasGa4 ? ga4Data!.previous.bounceRate * 100 : 0} accent="border-red-500" icon={Icons.bounce} invert />
          <MetricCard label="Avg Duration" value={hasGa4 ? formatDuration(ga4Data!.current.avgSessionDuration) : '\u2014'} current={hasGa4 ? ga4Data!.current.avgSessionDuration : 0} previous={hasGa4 ? ga4Data!.previous.avgSessionDuration : 0} accent="border-teal-500" icon={Icons.duration} />
        </div>
      </div>

      {/* Daily Trend Charts */}
      {(scDaily.length >= 2 || ga4DailyData.length >= 2) && (
        <div>
          <h2 className="text-xs uppercase tracking-wider text-neutral-500 mb-3 font-semibold">
            Daily Trends
            <span className="text-neutral-600 font-normal ml-2">
              {Math.max(scDaily.length, ga4DailyData.length)} days of data
            </span>
          </h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {scDaily.length >= 2 && (
              <>
                <div className="bg-neutral-900 rounded-lg border border-neutral-800 p-4">
                  <h3 className="text-neutral-500 text-xs uppercase tracking-wider mb-3 font-semibold">Search Position</h3>
                  <TrendChart
                    data={scDaily}
                    lines={[{ key: 'position', color: '#f59e0b', label: 'Avg Position' }]}
                  />
                </div>
                <div className="bg-neutral-900 rounded-lg border border-neutral-800 p-4">
                  <h3 className="text-neutral-500 text-xs uppercase tracking-wider mb-3 font-semibold">Clicks &amp; Impressions</h3>
                  <TrendChart
                    data={scDaily}
                    lines={[
                      { key: 'clicks', color: '#10b981', label: 'Clicks' },
                      { key: 'impressions', color: '#06b6d4', label: 'Impressions' },
                    ]}
                  />
                </div>
              </>
            )}
            {ga4DailyData.length >= 2 && (
              <>
                <div className="bg-neutral-900 rounded-lg border border-neutral-800 p-4">
                  <h3 className="text-neutral-500 text-xs uppercase tracking-wider mb-3 font-semibold">Users &amp; Sessions</h3>
                  <TrendChart
                    data={ga4DailyData}
                    lines={[
                      { key: 'users', color: '#3b82f6', label: 'Users' },
                      { key: 'sessions', color: '#8b5cf6', label: 'Sessions' },
                    ]}
                  />
                </div>
                <div className="bg-neutral-900 rounded-lg border border-neutral-800 p-4">
                  <h3 className="text-neutral-500 text-xs uppercase tracking-wider mb-3 font-semibold">Page Views</h3>
                  <TrendChart
                    data={ga4DailyData}
                    lines={[{ key: 'views', color: '#f59e0b', label: 'Page Views' }]}
                  />
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Keyword Position Distribution */}
      {scQueries && scQueries.length > 0 && (() => {
        const buckets = [
          { label: 'Top 3', sublabel: 'pos 1–3', colorBar: 'bg-emerald-500', colorText: 'text-emerald-400', test: (p: number) => p <= 3 },
          { label: '4–10', sublabel: 'first page', colorBar: 'bg-blue-500', colorText: 'text-blue-400', test: (p: number) => p > 3 && p <= 10 },
          { label: '11–20', sublabel: 'second page', colorBar: 'bg-amber-500', colorText: 'text-amber-400', test: (p: number) => p > 10 && p <= 20 },
          { label: '20+', sublabel: 'buried', colorBar: 'bg-neutral-600', colorText: 'text-neutral-500', test: (p: number) => p > 20 },
        ];
        const stats = buckets.map(b => ({
          ...b,
          count: scQueries!.filter(q => b.test(q.position)).length,
          impressions: scQueries!.filter(q => b.test(q.position)).reduce((s, q) => s + q.impressions, 0),
          clicks: scQueries!.filter(q => b.test(q.position)).reduce((s, q) => s + q.clicks, 0),
        }));
        const total = scQueries!.length;

        return (
          <div>
            <h2 className="text-xs uppercase tracking-wider text-neutral-500 mb-3 font-semibold">
              Ranking Distribution &middot; top {total} queries
            </h2>
            <div className="bg-neutral-900 rounded-lg border border-neutral-800 p-4 space-y-4">
              {/* Stacked bar */}
              <div className="flex h-2.5 rounded-full overflow-hidden gap-px bg-neutral-800">
                {stats.map(s => s.count > 0 && (
                  <div
                    key={s.label}
                    className={`${s.colorBar} transition-all first:rounded-l-full last:rounded-r-full`}
                    style={{ width: `${(s.count / total) * 100}%` }}
                  />
                ))}
              </div>
              {/* Legend + stats */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {stats.map(s => (
                  <div key={s.label} className="space-y-0.5">
                    <div className="flex items-center gap-1.5">
                      <div className={`size-2 rounded-full shrink-0 ${s.colorBar}`} />
                      <span className="text-neutral-400 text-xs font-semibold">{s.label}</span>
                    </div>
                    <div className="pl-3.5">
                      <span className={`${s.colorText} text-lg font-mono font-bold leading-none`}>{s.count}</span>
                      <span className="text-neutral-600 text-xs ml-1">queries</span>
                    </div>
                    {s.impressions > 0 && (
                      <div className="pl-3.5 text-[10px] text-neutral-600 font-mono space-x-2">
                        <span>{s.impressions.toLocaleString()} impr</span>
                        {s.clicks > 0 && <span>{s.clicks.toLocaleString()} clicks</span>}
                      </div>
                    )}
                    <div className="pl-3.5 text-[10px] text-neutral-700">{s.sublabel}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        );
      })()}

      {/* SC Tables */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Queries */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs uppercase tracking-wider text-neutral-500 font-semibold">Top Queries</h2>
            {scQueries && scQueries.length > 0 && (
              <ExportButton
                data={scQueries.map(r => ({ query: r.query, clicks: r.clicks, impressions: r.impressions, ctr: `${(r.ctr * 100).toFixed(2)}%`, position: r.position.toFixed(1) }))}
                filename={`${siteId}-queries-${days}d`}
              />
            )}
          </div>
          {scQueries && scQueries.length > 0 ? (
            <div className="bg-neutral-900 rounded-lg border border-neutral-800 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-neutral-800 text-neutral-500 text-left text-xs uppercase tracking-wider">
                    <th className="px-4 py-3 font-semibold">Query</th>
                    <th className="px-4 py-3 font-semibold text-right">Clicks</th>
                    <th className="px-4 py-3 font-semibold text-right hidden md:table-cell">Impr</th>
                    <th className="px-4 py-3 font-semibold text-right hidden md:table-cell">CTR</th>
                    <th className="px-4 py-3 font-semibold text-right">Pos</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-800">
                  {scQueries.map((row, i) => (
                    <tr key={i} className="hover:bg-neutral-800/30 transition-colors">
                      <td className="px-4 py-2.5 text-neutral-300 font-mono text-xs truncate max-w-[200px]">{row.query}</td>
                      <td className="px-4 py-2.5 text-right text-neutral-300 font-mono">{row.clicks.toLocaleString()}</td>
                      <td className="px-4 py-2.5 text-right text-neutral-400 font-mono hidden md:table-cell">{row.impressions.toLocaleString()}</td>
                      <td className="px-4 py-2.5 text-right text-neutral-400 font-mono hidden md:table-cell">{(row.ctr * 100).toFixed(1)}%</td>
                      <td className="px-4 py-2.5 text-right"><PositionBadge position={row.position} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-neutral-600 text-sm">No query data available.</p>
          )}
        </div>

        {/* Top Pages */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs uppercase tracking-wider text-neutral-500 font-semibold">Top Pages (Search Console)</h2>
            {scPages && scPages.length > 0 && (
              <ExportButton
                data={scPages.map(r => ({ page: r.page, clicks: r.clicks, impressions: r.impressions, position: r.position.toFixed(1) }))}
                filename={`${siteId}-pages-${days}d`}
              />
            )}
          </div>
          {scPages && scPages.length > 0 ? (
            <div className="bg-neutral-900 rounded-lg border border-neutral-800 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-neutral-800 text-neutral-500 text-left text-xs uppercase tracking-wider">
                    <th className="px-4 py-3 font-semibold">Page</th>
                    <th className="px-4 py-3 font-semibold text-right">Clicks</th>
                    <th className="px-4 py-3 font-semibold text-right hidden md:table-cell">Impr</th>
                    <th className="px-4 py-3 font-semibold text-right">Pos</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-800">
                  {scPages.map((row, i) => {
                    let shortPage = row.page;
                    try { shortPage = new URL(row.page).pathname; } catch {}
                    return (
                      <tr key={i} className="hover:bg-neutral-800/30 transition-colors">
                        <td className="px-4 py-2.5 text-neutral-300 font-mono text-xs truncate max-w-[200px]" title={row.page}>{shortPage}</td>
                        <td className="px-4 py-2.5 text-right text-neutral-300 font-mono">{row.clicks.toLocaleString()}</td>
                        <td className="px-4 py-2.5 text-right text-neutral-400 font-mono hidden md:table-cell">{row.impressions.toLocaleString()}</td>
                        <td className="px-4 py-2.5 text-right"><PositionBadge position={row.position} /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-neutral-600 text-sm">No page data available.</p>
          )}
        </div>
      </div>

      {/* GA4 Tables */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* GA4 Top Pages */}
        <div>
          <h2 className="text-xs uppercase tracking-wider text-neutral-500 mb-3 font-semibold">Top Pages (GA4)</h2>
          {ga4Data && ga4Data.topPages.length > 0 ? (
            <div className="bg-neutral-900 rounded-lg border border-neutral-800 p-4">
              <div className="space-y-1.5">
                {ga4Data.topPages.map((page, i) => {
                  const maxViews = ga4Data.topPages[0].views || 1;
                  return (
                    <div key={i} className="flex items-center gap-3 text-xs">
                      <span className="text-neutral-400 font-mono truncate min-w-0 flex-1">{page.path}</span>
                      <div className="w-16 bg-neutral-800 h-1 rounded-full overflow-hidden shrink-0">
                        <div className="h-full bg-blue-500/50 rounded-full" style={{ width: `${(page.views / maxViews) * 100}%` }} />
                      </div>
                      <span className="text-neutral-500 font-mono shrink-0 w-20 text-right">{pluralize(page.views, 'view')}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <p className="text-neutral-600 text-sm">No GA4 page data available.</p>
          )}
        </div>

        {/* Traffic Sources */}
        <div>
          <h2 className="text-xs uppercase tracking-wider text-neutral-500 mb-3 font-semibold">Traffic Sources</h2>
          {ga4Data && ga4Data.trafficSources.length > 0 ? (
            <div className="bg-neutral-900 rounded-lg border border-neutral-800 p-4">
              <div className="space-y-1.5">
                {ga4Data.trafficSources.map((src, i) => (
                  <div key={i} className="flex items-center justify-between text-xs">
                    <span className="text-neutral-400 font-mono">{formatSource(src.source, src.medium)}</span>
                    <span className="text-neutral-500 font-mono">{pluralize(src.sessions, 'session')}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-neutral-600 text-sm">No traffic source data available.</p>
          )}
        </div>
      </div>

      {/* ── Audit Details ── */}
      <div className="border-t border-neutral-800 pt-8">
        <h2 className="text-lg font-bold text-white mb-6">Site Audit</h2>

        <div className="space-y-6">
          {/* robots.txt */}
          <CheckCard check={audit.robotsTxt} gaps={sections['robotsTxt']}>
            {audit.robotsTxt.raw && (
              <pre className="bg-neutral-800 rounded p-3 mt-3 text-xs text-neutral-400 font-mono overflow-x-auto max-h-40">
                {audit.robotsTxt.raw}
              </pre>
            )}
          </CheckCard>

          {/* Sitemap */}
          <CheckCard check={audit.sitemap} gaps={sections['sitemap']}>
            {audit.sitemap.url && (
              <p className="text-neutral-600 text-xs font-mono mt-2">URL: {audit.sitemap.url}</p>
            )}
            {sitemapSubmissions.length > 0 && (
              <div className="mt-3 border-t border-neutral-800 pt-3 space-y-2">
                <p className="text-neutral-500 text-xs font-semibold uppercase tracking-wide">Google Search Console</p>
                {sitemapSubmissions.map((s, i) => (
                  <div key={i} className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-mono">
                    <span className="text-neutral-400 truncate max-w-xs">{s.path.replace(/^https?:\/\/[^/]+/, '') || s.path}</span>
                    <span className="text-neutral-500">
                      submitted: <span className="text-neutral-300">{s.lastSubmitted ? new Date(s.lastSubmitted).toLocaleString() : '—'}</span>
                    </span>
                    <span className="text-neutral-500">
                      downloaded: <span className="text-neutral-300">{s.lastDownloaded ? new Date(s.lastDownloaded).toLocaleString() : '—'}</span>
                    </span>
                    {s.isPending && <span className="text-amber-400">pending</span>}
                    {s.errors > 0 && <span className="text-red-400">{s.errors} errors</span>}
                    {s.warnings > 0 && <span className="text-amber-400">{s.warnings} warnings</span>}
                  </div>
                ))}
              </div>
            )}
          </CheckCard>

          {/* SC Sitemap Freshness */}
          <CheckCard check={audit.scSitemapFreshness} />

          {/* Indexing Coverage */}
          <CheckCard check={audit.indexingCoverage}>
            {audit.indexingCoverage.sitemapUrls != null && audit.indexingCoverage.indexedPages != null && (
              <div className="mt-3">
                <div className="flex items-center gap-4 text-xs text-neutral-400 mb-2">
                  <span>Sitemap: <span className="text-white font-mono">{audit.indexingCoverage.sitemapUrls}</span> URLs</span>
                  <span>Indexed: <span className="text-white font-mono">{audit.indexingCoverage.indexedPages}</span> pages</span>
                  <span>Gap: <span className="text-red-400 font-mono">{audit.indexingCoverage.sitemapUrls - audit.indexingCoverage.indexedPages}</span> not indexed</span>
                </div>
                <div className="w-full bg-neutral-800 h-2 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${
                      (audit.indexingCoverage.coveragePct ?? 0) >= 60 ? 'bg-emerald-500' : (audit.indexingCoverage.coveragePct ?? 0) >= 30 ? 'bg-amber-500' : 'bg-red-500'
                    }`}
                    style={{ width: `${Math.min(audit.indexingCoverage.coveragePct ?? 0, 100)}%` }}
                  />
                </div>
                <div className="flex justify-between text-[10px] text-neutral-600 mt-1">
                  <span>0%</span>
                  <span>30%</span>
                  <span>60%</span>
                  <span>100%</span>
                </div>
              </div>
            )}
          </CheckCard>

          {/* Meta Tags */}
          <div className="bg-neutral-900 rounded-lg border border-neutral-800 p-5">
            <h2 className="text-white font-semibold text-sm mb-4">Meta Tags &middot; {audit.metaTags.length} pages checked</h2>
            <div className="space-y-5">
              {audit.metaTags.map((meta, i) => (
                <div key={i}>
                  <div className="text-neutral-400 text-xs font-mono mb-2 pb-1 border-b border-neutral-800">
                    {meta.page}
                  </div>
                  <MetaChecksTable
                    checks={[meta.title, meta.description, meta.ogTitle, meta.ogImage, meta.ogDescription, meta.twitterCard, meta.canonical, meta.jsonLd]}
                  />
                </div>
              ))}
            </div>
            {sections['metaTags']?.map(g => <Recommendation key={g.id} gap={g} />)}
          </div>

          {/* OG Image */}
          <CheckCard check={audit.ogImage} gaps={sections['ogImage']}>
            {audit.ogImage.url && (
              <div className="mt-3 space-y-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={audit.ogImage.url}
                  alt={`OG image for ${site.domain}`}
                  className="rounded border border-neutral-700 max-w-md w-full"
                />
                <div className="space-y-1">
                  <p className="text-neutral-600 text-xs font-mono">URL: {audit.ogImage.url}</p>
                  {audit.ogImage.contentType && <p className="text-neutral-600 text-xs font-mono">Type: {audit.ogImage.contentType}</p>}
                  {audit.ogImage.dimensions && <p className="text-neutral-600 text-xs font-mono">Dimensions: {audit.ogImage.dimensions}</p>}
                </div>
              </div>
            )}
          </CheckCard>

          {/* Image SEO */}
          <div className="bg-neutral-900 rounded-lg border border-neutral-800 p-5">
            <h2 className="text-white font-semibold text-sm mb-4">Image SEO &middot; {audit.imageSeo.length} pages checked</h2>
            <div className="space-y-5">
              {audit.imageSeo.map((img, i) => (
                <div key={i}>
                  <div className="flex items-center gap-3 mb-2">
                    <div className={`size-1.5 rounded-full shrink-0 ${statusDots[img.status]}`} />
                    <span className="text-neutral-400 font-mono text-xs">{img.page}</span>
                    <span className="text-neutral-500 text-xs">
                      {img.totalImages} images &middot; {img.withAlt} with alt &middot; {img.withLazyLoading} lazy
                    </span>
                  </div>
                  {img.images?.length > 0 && (
                    <div className="ml-4 space-y-1">
                      {img.images.filter(d => !d.hasAlt || !d.isLazy).map((d, j) => (
                        <div key={j} className="flex items-start gap-2 text-xs">
                          <span className="text-neutral-600 font-mono truncate max-w-xs shrink-0">{d.src.length > 60 ? d.src.slice(0, 57) + '...' : d.src}</span>
                          {!d.hasAlt && <span className="text-red-400 whitespace-nowrap">missing alt</span>}
                          {!d.isLazy && <span className="text-amber-400 whitespace-nowrap">not lazy</span>}
                        </div>
                      ))}
                      {img.images.every(d => d.hasAlt && d.isLazy) && (
                        <span className="text-emerald-400 text-xs">All images have alt text and lazy loading</span>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
            {sections['imageSeo']?.map(g => <Recommendation key={g.id} gap={g} />)}
          </div>

          {/* Internal Links */}
          <div className="bg-neutral-900 rounded-lg border border-neutral-800 p-5">
            <h2 className="text-white font-semibold text-sm mb-4">Internal Links &middot; {audit.internalLinks.length} pages checked</h2>
            <div className="space-y-3">
              {audit.internalLinks.map((link, i) => (
                <div key={i} className="flex items-center gap-4 text-xs">
                  <div className={`size-1.5 rounded-full shrink-0 ${statusDots[link.status]}`} />
                  <span className="text-neutral-400 font-mono w-32 shrink-0">{link.page}</span>
                  <span className="text-neutral-300 font-mono">{link.internalLinks} internal</span>
                  <span className="text-neutral-500 font-mono">{link.externalLinks} external</span>
                </div>
              ))}
            </div>
            {sections['internalLinks']?.map(g => <Recommendation key={g.id} gap={g} />)}
          </div>

          {/* Security */}
          {audit.security && (
            <div className="bg-neutral-900 rounded-lg border border-neutral-800 p-5">
              <h2 className="text-white font-semibold text-sm mb-4">Security</h2>
              <div className="space-y-2">
                {[audit.security.https, audit.security.hsts, audit.security.favicon].map((check, i) => (
                  <div key={i} className="flex items-center gap-3 text-xs">
                    <div className={`size-1.5 rounded-full shrink-0 ${statusDots[check.status]}`} />
                    <span className="text-neutral-500 w-16 shrink-0">{check.label}</span>
                    <span className={`font-mono ${check.status === 'pass' ? 'text-neutral-300' : 'text-amber-400'}`}>{check.message}</span>
                  </div>
                ))}
              </div>
              {sections['security']?.map(g => <Recommendation key={g.id} gap={g} />)}
            </div>
          )}

          {/* TTFB */}
          <CheckCard check={audit.ttfb} gaps={sections['ttfb']}>
            {audit.ttfb.ms !== undefined && (
              <div className="mt-3">
                <div className="w-full bg-neutral-800 h-2 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${
                      audit.ttfb.ms < 800 ? 'bg-emerald-500' : audit.ttfb.ms < 2000 ? 'bg-amber-500' : 'bg-red-500'
                    }`}
                    style={{ width: `${Math.min((audit.ttfb.ms / 3000) * 100, 100)}%` }}
                  />
                </div>
                <div className="flex justify-between text-[10px] text-neutral-600 mt-1">
                  <span>0ms</span>
                  <span>800ms</span>
                  <span>2000ms</span>
                  <span>3000ms</span>
                </div>
              </div>
            )}
          </CheckCard>

          {/* Indexing recommendations */}
          {sections['indexing'] && sections['indexing'].length > 0 && (
            <div className="bg-neutral-900 rounded-lg border border-neutral-800 p-5">
              <h2 className="text-white font-semibold text-sm mb-4">Indexing</h2>
              {sections['indexing'].map(g => <Recommendation key={g.id} gap={g} />)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

