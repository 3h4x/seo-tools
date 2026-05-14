import type { ReactNode } from 'react';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getManagedSite, getSCUrl } from '@/lib/sites';
import { getCwvAuditSummary } from '@/lib/performance-site';
import { discoverPropertyIds, cachedGetAnalytics } from '@/lib/ga4';
import {
  cachedGetSearchConsoleDataWithComparison,
  cachedGetSearchConsolePages,
  cachedGetSearchConsoleQueries,
  cachedGetSitemapSubmissions,
} from '@/lib/search-console';
import { cachedAuditSite, normalizeSiteAuditResult } from '@/lib/audit';
import { analyzeSiteGaps, createSiteGapSignals } from '@/lib/gaps';
import { summarizeCanonicalChecks } from '@/lib/canonical';
import { getScDaily, getGa4Daily, getKeywordDeltas } from '@/lib/db';
import type { KeywordDelta } from '@/lib/keyword-history';
import { getPageOpportunityRows } from '@/lib/page-opportunities';
import { KeywordRankTable } from '../components/keyword-rank-table';
import { METRIC_COLORS, CWV_RATING_COLORS, CWV_THRESHOLDS, type CwvMetricName } from '@/lib/constants';
import { pluralize, formatSource, formatDuration, formatBounce } from '@/lib/format';
import TimeRange from '../components/time-range';
import { Icons } from '../components/icons';
import TrendChart from '../components/trend-chart';
import { MetricCard } from '../components/metric-card';
import { CheckCard, statusDots, Recommendation, MetaChecksTable } from '../components/audit/check-card';
import { gapsBySection } from '@/lib/gaps';
import { ScTable } from '../components/sc-table';
import { PagesTable } from '../components/pages-table';
import { VALID_DAYS } from '@/lib/constants';
import { parseAllowedIntegerParam } from '@/lib/days';

export const revalidate = 300;

const QUERY_BUCKETS = [
  { label: 'Top 3', sublabel: 'pos 1–3', colorBar: 'bg-emerald-500', colorText: 'text-emerald-400', test: (position: number) => position <= 3 },
  { label: '4–10', sublabel: 'first page', colorBar: 'bg-blue-500', colorText: 'text-blue-400', test: (position: number) => position > 3 && position <= 10 },
  { label: '11–20', sublabel: 'second page', colorBar: 'bg-amber-500', colorText: 'text-amber-400', test: (position: number) => position > 10 && position <= 20 },
  { label: '20+', sublabel: 'buried', colorBar: 'bg-neutral-600', colorText: 'text-neutral-500', test: (position: number) => position > 20 },
] as const;

type QueryBucketStat = (typeof QUERY_BUCKETS)[number] & {
  count: number;
  impressions: number;
  clicks: number;
};

function getQueryBucketStats(
  queries: Array<{ position: number; impressions: number; clicks: number }>,
): QueryBucketStat[] {
  const stats = QUERY_BUCKETS.map((bucket) => ({
    ...bucket,
    count: 0,
    impressions: 0,
    clicks: 0,
  }));

  for (const query of queries) {
    const bucket = stats.find(({ test }) => test(query.position));
    if (!bucket) continue;
    bucket.count += 1;
    bucket.impressions += query.impressions;
    bucket.clicks += query.clicks;
  }

  return stats;
}

function engagementTone(engagementRate: number): string {
  if (engagementRate >= 0.6) return 'text-emerald-400';
  if (engagementRate >= 0.4) return 'text-amber-400';
  return 'text-red-400';
}

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
  const days = parseAllowedIntegerParam(sp.days, VALID_DAYS, 7);

  // Discover GA4 property ID
  const discovered = await discoverPropertyIds();
  const propertyId = discovered.find((s) => s.id === siteId)?.ga4PropertyId || site.ga4PropertyId || '';

  const scUrl = getSCUrl(site);

  const [rawAudit, sitemapSubmissions, scComparison, scQueries, scTopPages, ga4Data, cwvSummary, pageOpportunities] = await Promise.all([
    cachedAuditSite(site),
    site.searchConsole ? cachedGetSitemapSubmissions(scUrl) : Promise.resolve([]),
    site.searchConsole ? cachedGetSearchConsoleDataWithComparison(scUrl, days) : null,
    site.searchConsole ? cachedGetSearchConsoleQueries(scUrl, days) : null,
    site.searchConsole ? cachedGetSearchConsolePages(scUrl, days) : null,
    cachedGetAnalytics(propertyId, days),
    getCwvAuditSummary(siteId),
    getPageOpportunityRows(site, days),
  ]);

  const audit = normalizeSiteAuditResult(rawAudit);
  const gapAnalysis = analyzeSiteGaps(audit, site, createSiteGapSignals({
    ga4TopPages: ga4Data.data?.topPages,
    scTopPages: scTopPages ?? undefined,
    days,
  }));
  const sections = gapsBySection(gapAnalysis.gaps);
  const totalGaps = gapAnalysis.gaps.length;
  const canonicalSummary = summarizeCanonicalChecks(audit.metaTags);

  const sc = scComparison?.data ?? null;
  const scError = scComparison?.error ?? false;
  const hasSc = sc && sc.current.clicks > 0;
  const ga4 = ga4Data.data;
  const ga4Error = ga4Data.error;
  const hasGa4 = ga4 && ga4.current.users > 0;
  const queryBucketStats = scQueries ? getQueryBucketStats(scQueries) : [];

  let scDaily: ReturnType<typeof getScDaily> = [];
  let ga4DailyData: ReturnType<typeof getGa4Daily> = [];
  let keywordDeltas: KeywordDelta[] = [];
  try {
    scDaily = getScDaily(siteId);
    ga4DailyData = getGa4Daily(siteId);
    keywordDeltas = getKeywordDeltas(siteId);
  } catch { /* no data yet */ }

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between">
        <div>
          <Link href="/" className="text-neutral-500 hover:text-neutral-300 text-sm transition-colors">&larr; Overview</Link>
          <h1 className="text-2xl font-bold text-white mt-1">{site.name}</h1>
          <p className="text-neutral-500 text-sm mt-1">{site.domain} &middot; Last {days} days</p>
        </div>
        <TimeRange />
      </div>
      <div className="flex flex-wrap gap-6">
        {([
          { dot: 'bg-emerald-500', text: 'text-emerald-400', value: audit.score.pass, label: 'passed' },
          { dot: 'bg-amber-500',   text: 'text-amber-400',   value: audit.score.warn, label: 'warnings' },
          { dot: 'bg-red-500',     text: 'text-red-400',     value: audit.score.fail + audit.score.error, label: 'failures' },
        ] as const).map(({ dot, text, value, label }) => (
          <div key={label} className="flex items-center gap-2">
            <div className={`size-2 rounded-full ${dot}`} />
            <span className={`${text} font-mono text-sm font-bold`}>{value}</span>
            <span className="text-neutral-500 text-xs">{label}</span>
          </div>
        ))}
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
      <div>
        <div className="flex items-center gap-3 mb-3">
          <h2 className="text-xs uppercase tracking-wider text-neutral-500 font-semibold">Search Console</h2>
          {scError && <span className="text-xs text-red-400">data unavailable</span>}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <MetricCard icon={Icons.clicks} label="Clicks" current={sc?.current.clicks ?? 0} previous={sc?.previous.clicks} accent="border-emerald-500" />
          <MetricCard icon={Icons.impressions} label="Impressions" current={sc?.current.impressions ?? 0} previous={sc?.previous.impressions} accent="border-cyan-500" />
          <MetricCard label="CTR" value={hasSc ? `${(sc!.current.ctr * 100).toFixed(2)}%` : '\u2014'} current={hasSc ? sc!.current.ctr * 100 : 0} previous={hasSc ? sc!.previous.ctr * 100 : 0} accent="border-violet-500" icon={Icons.ctr} />
          <MetricCard label="Avg Position" value={hasSc ? sc!.current.position.toFixed(1) : '\u2014'} current={hasSc ? sc!.current.position : 0} previous={hasSc ? sc!.previous.position : 0} accent="border-amber-500" icon={Icons.position} invert />
        </div>
      </div>
      <div>
        <div className="flex items-center gap-3 mb-3">
          <h2 className="text-xs uppercase tracking-wider text-neutral-500 font-semibold">GA4 Analytics</h2>
          {ga4Error && <span className="text-xs text-red-400">data unavailable</span>}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          <MetricCard icon={Icons.users} label="Users" current={ga4?.current.users ?? 0} previous={ga4?.previous.users} accent="border-blue-500" />
          <MetricCard icon={Icons.sessions} label="Sessions" current={ga4?.current.sessions ?? 0} previous={ga4?.previous.sessions} accent="border-pink-500" />
          <MetricCard icon={Icons.views} label="Page Views" current={ga4?.current.views ?? 0} previous={ga4?.previous.views} accent="border-amber-500" />
          <MetricCard label="Bounce Rate" value={hasGa4 ? formatBounce(ga4!.current.bounceRate) : '\u2014'} current={hasGa4 ? ga4!.current.bounceRate * 100 : 0} previous={hasGa4 ? ga4!.previous.bounceRate * 100 : 0} accent="border-red-500" icon={Icons.bounce} invert />
          <MetricCard label="Avg Duration" value={hasGa4 ? formatDuration(ga4!.current.avgSessionDuration) : '\u2014'} current={hasGa4 ? ga4!.current.avgSessionDuration : 0} previous={hasGa4 ? ga4!.previous.avgSessionDuration : 0} accent="border-teal-500" icon={Icons.duration} />
        </div>
      </div>
      {(scDaily.length >= 2 || ga4DailyData.length >= 2) && (
        <div>
          <div className="mb-3">
            <h2 className="text-xs uppercase tracking-wider text-neutral-500 font-semibold">Daily Trends</h2>
            <p className="text-xs text-neutral-600 mt-1">
              {Math.max(scDaily.length, ga4DailyData.length)} days of data
            </p>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {scDaily.length >= 2 && (
              <>
                <ChartPanel title="Search Position">
                  <TrendChart data={scDaily} lines={[{ key: 'position', color: METRIC_COLORS.position, label: 'Avg Position' }]} />
                </ChartPanel>
                <ChartPanel title="Clicks & Impressions">
                  <TrendChart data={scDaily} lines={[{ key: 'clicks', color: METRIC_COLORS.clicks, label: 'Clicks' }, { key: 'impressions', color: METRIC_COLORS.impressions, label: 'Impressions' }]} />
                </ChartPanel>
              </>
            )}
            {ga4DailyData.length >= 2 && (
              <>
                <ChartPanel title="Users & Sessions">
                  <TrendChart data={ga4DailyData} lines={[{ key: 'users', color: METRIC_COLORS.users, label: 'Users' }, { key: 'sessions', color: METRIC_COLORS.sessions, label: 'Sessions' }]} />
                </ChartPanel>
                <ChartPanel title="Page Views">
                  <TrendChart data={ga4DailyData} lines={[{ key: 'views', color: METRIC_COLORS.views, label: 'Page Views' }]} />
                </ChartPanel>
              </>
            )}
          </div>
        </div>
      )}
      {scQueries && scQueries.length > 0 && (
        <div>
          <h2 className="text-xs uppercase tracking-wider text-neutral-500 mb-3 font-semibold">
            Ranking Distribution &middot; top {scQueries.length} queries
          </h2>
          <div className="bg-neutral-900 rounded-lg border border-neutral-800 p-4 space-y-4">
            <div className="flex h-2.5 rounded-full overflow-hidden gap-px bg-neutral-800">
              {queryBucketStats.map((bucket) => bucket.count > 0 && (
                <div
                  key={bucket.label}
                  className={`${bucket.colorBar} transition-all first:rounded-l-full last:rounded-r-full`}
                  style={{ width: `${(bucket.count / scQueries.length) * 100}%` }}
                />
              ))}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {queryBucketStats.map((bucket) => (
                <div key={bucket.label} className="space-y-0.5">
                  <div className="flex items-center gap-1.5">
                    <div className={`size-2 rounded-full shrink-0 ${bucket.colorBar}`} />
                    <span className="text-neutral-400 text-xs font-semibold">{bucket.label}</span>
                  </div>
                  <div className="pl-3.5">
                    <span className={`${bucket.colorText} text-lg font-mono font-bold leading-none`}>{bucket.count}</span>
                    {' '}
                    <span className="text-neutral-600 text-xs">queries</span>
                  </div>
                  {bucket.impressions > 0 && (
                    <div className="pl-3.5 text-[10px] text-neutral-600 font-mono space-x-2">
                      <span>{bucket.impressions.toLocaleString()} impr</span>
                      {bucket.clicks > 0 && <span>{bucket.clicks.toLocaleString()} clicks</span>}
                    </div>
                  )}
                  <div className="pl-3.5 text-[10px] text-neutral-700">{bucket.sublabel}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ScTable
          heading="Top Queries"
          columnLabel="Query"
          rows={(scQueries ?? []).map(r => ({ label: r.query, clicks: r.clicks, impressions: r.impressions, ctr: r.ctr, position: r.position }))}
          emptyMessage="No query data available."
          exportData={(scQueries ?? []).map(r => ({ query: r.query, clicks: r.clicks, impressions: r.impressions, ctr: `${(r.ctr * 100).toFixed(2)}%`, position: r.position.toFixed(1) }))}
          filename={`${siteId}-queries-${days}d`}
        />
        <PagesTable rows={pageOpportunities} days={days} />
      </div>
      {keywordDeltas.length > 0 && (
        <div>
          <h2 className="text-xs uppercase tracking-wider text-neutral-500 mb-3 font-semibold">
            Keyword Rank Changes
            <Link href="/trends#keywords" className="ml-3 text-neutral-600 hover:text-neutral-400 normal-case font-normal">view history →</Link>
          </h2>
          <div className="bg-neutral-900 rounded-lg border border-neutral-800 overflow-hidden">
            <KeywordRankTable deltas={keywordDeltas} />
          </div>
        </div>
      )}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div>
          <h2 className="text-xs uppercase tracking-wider text-neutral-500 mb-3 font-semibold">Top Pages (GA4)</h2>
          {ga4 && ga4.topPages.length > 0 ? (
            <div className="bg-neutral-900 rounded-lg border border-neutral-800 overflow-hidden">
              <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-3 border-b border-neutral-800 px-4 py-3 text-[11px] uppercase tracking-wider text-neutral-500">
                <span>Page</span>
                <span className="text-right">Views</span>
                <span className="text-right">Engagement</span>
              </div>
              <div className="space-y-1.5 p-4">
                {ga4.topPages.map((page, i) => {
                  const maxViews = ga4.topPages[0].views || 1;
                  return (
                    <div key={i} className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 text-xs">
                      <div className="min-w-0">
                        <span className="block truncate font-mono text-neutral-400">{page.path}</span>
                        <span className="block text-[11px] text-neutral-600">{formatDuration(page.avgSessionDuration)}</span>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <div className="w-16 bg-neutral-800 h-1 rounded-full overflow-hidden shrink-0">
                          <div className="h-full bg-blue-500/50 rounded-full" style={{ width: `${(page.views / maxViews) * 100}%` }} />
                        </div>
                        <span className="w-20 text-right font-mono text-neutral-500">{pluralize(page.views, 'view')}</span>
                      </div>
                      <span className={`w-24 text-right font-mono ${engagementTone(page.engagementRate)}`}>
                        {(page.engagementRate * 100).toFixed(0)}%
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <p className="text-neutral-600 text-sm">No GA4 page data available.</p>
          )}
        </div>
        <div>
          <h2 className="text-xs uppercase tracking-wider text-neutral-500 mb-3 font-semibold">Traffic Sources</h2>
          {(ga4?.trafficSources ?? []).length === 0 ? (
            <p className="text-neutral-600 text-sm">No traffic source data available.</p>
          ) : (
            <div className="bg-neutral-900 rounded-lg border border-neutral-800 p-4">
              <div className="space-y-1.5">
                {(ga4?.trafficSources ?? []).map((src, i) => (
                  <div key={i} className="flex items-center justify-between text-xs">
                    <span className="text-neutral-400 font-mono">{formatSource(src.source, src.medium)}</span>
                    <span className="text-neutral-500 font-mono">{pluralize(src.sessions, 'session')}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
      <div className="border-t border-neutral-800 pt-8">
        <h2 className="text-lg font-bold text-white mb-6">Site Audit</h2>

        <div className="space-y-6">
          <CheckCard check={audit.robotsTxt} gaps={sections['robotsTxt']}>
            {audit.robotsTxt.raw && (
              <pre className="bg-neutral-800 rounded p-3 mt-3 text-xs text-neutral-400 font-mono overflow-x-auto max-h-40">
                {audit.robotsTxt.raw}
              </pre>
            )}
          </CheckCard>
          <CheckCard check={audit.sitemap} gaps={sections['sitemap']}>
            {audit.sitemap.url && (
              <p className="text-neutral-600 text-xs font-mono mt-2">URL: {audit.sitemap.url}</p>
            )}
            {(audit.sitemap.checkedUrlCount != null || audit.sitemap.crawledPagesChecked != null || audit.sitemap.checkedLastmodCount != null) && (
              <div className="mt-3 border-t border-neutral-800 pt-3 space-y-2 text-xs font-mono">
                {audit.sitemap.checkedUrlCount != null && (
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-neutral-500">
                    <span>
                      URL health: <span className="text-neutral-300">{audit.sitemap.deadUrlCount ?? 0}/{audit.sitemap.checkedUrlCount}</span> dead
                    </span>
                    {audit.sitemap.deadUrls && audit.sitemap.deadUrls.length > 0 && (
                      <span className="text-red-400">{audit.sitemap.deadUrls.slice(0, 3).join(' • ')}</span>
                    )}
                  </div>
                )}
                {audit.sitemap.crawledPagesChecked != null && audit.sitemap.crawledPagesInSitemap != null && (
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-neutral-500">
                    <span>
                      Crawl coverage: <span className="text-neutral-300">{audit.sitemap.crawledPagesInSitemap}/{audit.sitemap.crawledPagesChecked}</span>
                    </span>
                    <span>
                      ratio: <span className="text-neutral-300">{audit.sitemap.crawlCoveragePct ?? 0}%</span>
                    </span>
                  </div>
                )}
                {audit.sitemap.checkedLastmodCount != null && audit.sitemap.checkedLastmodCount > 0 && (
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-neutral-500">
                    <span>
                      Stale lastmod: <span className="text-neutral-300">{audit.sitemap.staleLastmodCount ?? 0}/{audit.sitemap.checkedLastmodCount}</span>
                    </span>
                    <span>
                      threshold: <span className="text-neutral-300">{audit.sitemap.staleLastmodThresholdDays ?? 90}d</span>
                    </span>
                  </div>
                )}
              </div>
            )}
            {(sitemapSubmissions ?? []).length > 0 && (
              <div className="mt-3 border-t border-neutral-800 pt-3 space-y-2">
                <p className="text-neutral-500 text-xs font-semibold uppercase tracking-wide">Google Search Console</p>
                {(sitemapSubmissions ?? []).map((s, i) => (
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
          <CheckCard check={audit.scSitemapFreshness} />
          <CheckCard check={audit.indexingCoverage} gaps={sections['indexing']}>
            {audit.indexingCoverage.sitemapUrls != null && audit.indexingCoverage.indexedPages != null && (
              <div className="mt-3">
                <div className="flex items-center gap-4 text-xs text-neutral-400 mb-2">
                  <span>Sitemap: <span className="text-white font-mono">{audit.indexingCoverage.sitemapUrls}</span> URLs</span>
                  <span>Indexed: <span className="text-white font-mono">{audit.indexingCoverage.indexedPages}</span> pages</span>
                  <span>Gap: <span className="text-red-400 font-mono">{Math.max(audit.indexingCoverage.sitemapUrls - audit.indexingCoverage.indexedPages, 0)}</span> not indexed</span>
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
          <AuditPanel title={`Meta Tags · ${audit.metaTags.length} pages checked`}>
            <div className="space-y-5">
              {audit.metaTags.map((meta, i) => (
                <div key={i}>
                  <div className="text-neutral-400 text-xs font-mono mb-2 pb-1 border-b border-neutral-800">
                    {meta.page}
                  </div>
                  <MetaChecksTable
                    checks={[meta.title, meta.description, meta.ogTitle, meta.ogImage, meta.ogDescription, meta.twitterCard, meta.canonical, meta.jsonLd]}
                  />
                  <SerpSnippetPreview
                    page={meta.page}
                    domain={site.domain}
                    titleRaw={meta.title.rawValue}
                    titleLen={meta.title.rawLength}
                    descRaw={meta.description.rawValue}
                    descLen={meta.description.rawLength}
                  />
                </div>
              ))}
            </div>
            {sections['metaTags']?.map(g => <Recommendation key={g.id} gap={g} />)}
          </AuditPanel>
          <CheckCard check={canonicalSummary}>
            <div className="mt-3 space-y-2">
              {audit.metaTags.map((meta, i) => (
                <div key={i} className="flex items-start gap-3 text-xs">
                  <div className={`size-1.5 rounded-full shrink-0 mt-1 ${statusDots[meta.canonical.status]}`} />
                  <div className="min-w-0">
                    <div className="text-neutral-300 font-mono">{meta.page}</div>
                    <div className={meta.canonical.status === 'fail' ? 'text-red-400' : meta.canonical.status === 'warn' ? 'text-amber-400' : 'text-neutral-500'}>
                      {meta.canonical.message}
                    </div>
                    {meta.canonicalTarget && (
                      <div className="text-neutral-600 font-mono break-all">
                        {meta.canonicalTarget}
                        {meta.canonicalStatus ? ` · HTTP ${meta.canonicalStatus}` : ''}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CheckCard>
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
          <AuditPanel title={`Image SEO · ${audit.imageSeo.length} pages checked`}>
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
          </AuditPanel>
          <AuditPanel title={`Redirect Chains · ${audit.redirectChains.length} pages checked`}>
            <div className="space-y-3">
              {audit.redirectChains.map((chain, i) => (
                <div key={i} className="space-y-1.5">
                  <div className="flex items-center gap-4 text-xs">
                    <div className={`size-1.5 rounded-full shrink-0 ${statusDots[chain.status]}`} />
                    <span className="text-neutral-400 font-mono w-32 shrink-0">{chain.page}</span>
                    <span className="text-neutral-300 font-mono">{chain.message}</span>
                  </div>
                  <div className="ml-5 space-y-1">
                    {chain.hops.length > 0 ? (
                      <>
                        {chain.hops.map((hop, j) => (
                          <div key={j} className="text-[11px] font-mono text-neutral-500 break-all">
                            {hop.url} <span className="text-neutral-400">HTTP {hop.status}</span>
                            {hop.location ? ` -> ${hop.location}` : ''}
                          </div>
                        ))}
                        {chain.finalUrl !== chain.hops[chain.hops.length - 1]?.url && (
                          <div className="text-[11px] font-mono text-neutral-600 break-all">{chain.finalUrl}</div>
                        )}
                      </>
                    ) : (
                      <div className="text-[11px] font-mono text-neutral-600 break-all">{chain.finalUrl}</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
            {sections['redirectChains']?.map(g => <Recommendation key={g.id} gap={g} />)}
          </AuditPanel>
          <AuditPanel title={`Internal Links · ${audit.internalLinks.length} pages checked`}>
            <div className="space-y-3">
              {audit.internalLinks.map((link, i) => (
                <div key={i} className="rounded border border-neutral-800 bg-neutral-950/40 p-3">
                  <div className="flex flex-wrap items-center gap-4 text-xs">
                    <div className={`size-1.5 rounded-full shrink-0 ${statusDots[link.status]}`} />
                    <span className="text-neutral-400 font-mono w-32 shrink-0">{link.page}</span>
                    <span className="text-neutral-300 font-mono">{link.internalLinks} internal</span>
                    <span className="text-neutral-500 font-mono">{link.externalLinks} external</span>
                    <span className="text-neutral-600 font-mono">{link.brokenLinksMessage}</span>
                    {link.brokenLinks.length > 0 && (
                      <span className="text-red-400 font-mono">{link.brokenLinks.length} broken</span>
                    )}
                  </div>
                  {link.brokenLinks.length > 0 && (
                    <details className="mt-3">
                      <summary className="cursor-pointer text-xs text-red-400 font-mono">
                        Show broken internal URLs
                      </summary>
                      <div className="mt-2 space-y-1">
                        {link.brokenLinks.map((brokenLink) => (
                          <div key={`${link.page}-${brokenLink.url}`} className="text-[11px] font-mono text-neutral-500 break-all">
                            <span className="text-red-400">HTTP {brokenLink.status || 0}</span> {brokenLink.url}
                          </div>
                        ))}
                      </div>
                    </details>
                  )}
                </div>
              ))}
            </div>
            {sections['internalLinks']?.map(g => <Recommendation key={g.id} gap={g} />)}
          </AuditPanel>
          {sections['content'] && sections['content'].length > 0 && (
            <AuditPanel title="Content Opportunities">
              {sections['content'].map(g => <Recommendation key={g.id} gap={g} />)}
            </AuditPanel>
          )}
          {audit.security && (
            <AuditPanel title="Security">
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
            </AuditPanel>
          )}
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
          {cwvSummary && Object.keys(cwvSummary.metrics).length > 0 && (
            <div className="bg-neutral-900 rounded-lg border border-neutral-800 p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-white font-semibold text-sm">Core Web Vitals</h2>
                <div className="flex items-center gap-3">
                  <span className="text-neutral-600 text-[10px] uppercase tracking-wider">
                    {cwvSummary.source === 'rum' ? 'RUM · GA4' : cwvSummary.source === 'psi-field' ? 'CrUX field' : cwvSummary.source === 'psi-lab' ? 'Lighthouse lab' : ''}
                  </span>
                  <Link
                    href={`/performance/${encodeURIComponent(siteId)}`}
                    className="text-neutral-500 hover:text-neutral-300 text-xs transition-colors"
                    onClick={e => e.stopPropagation()}
                  >
                    Full detail →
                  </Link>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                {(['LCP', 'INP', 'CLS'] as CwvMetricName[]).map(name => {
                  const metric = cwvSummary.metrics[name];
                  const t = CWV_THRESHOLDS[name];
                  if (!metric) {
                    return (
                      <div key={name} className="space-y-1">
                        <div className="text-neutral-600 text-xs font-medium">{name}</div>
                        <div className="text-neutral-700 text-sm font-mono">—</div>
                      </div>
                    );
                  }
                  const colors = CWV_RATING_COLORS[metric.rating];
                  const display = t.unit === 'ms' ? `${Math.round(metric.value)}ms` : metric.value.toFixed(3);
                  return (
                    <div key={name} className="space-y-1">
                      <div className="text-neutral-500 text-xs font-medium">{name}</div>
                      <div className={`text-lg font-mono font-bold ${colors.text}`}>{display}</div>
                      <div className={`text-[10px] ${colors.text} opacity-70`}>{colors.label}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {sections['other'] && sections['other'].length > 0 && (
            <AuditPanel title="Additional Recommendations">
              {sections['other'].map(g => <Recommendation key={g.id} gap={g} />)}
            </AuditPanel>
          )}
        </div>
      </div>
    </div>
  );
}

function ChartPanel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="bg-neutral-900 rounded-lg border border-neutral-800 p-4">
      <h3 className="text-neutral-500 text-xs uppercase tracking-wider mb-3 font-semibold">{title}</h3>
      {children}
    </div>
  );
}

function AuditPanel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="bg-neutral-900 rounded-lg border border-neutral-800 p-5">
      <h2 className="text-white font-semibold text-sm mb-4">{title}</h2>
      {children}
    </div>
  );
}

function SerpSnippetPreview({ page, domain, titleRaw, titleLen, descRaw, descLen }: {
  page: string;
  domain: string;
  titleRaw: string | undefined;
  titleLen: number | undefined;
  descRaw: string | undefined;
  descLen: number | undefined;
}) {
  const TITLE_LIMIT = 60;
  const DESC_LIMIT = 160;
  const breadcrumb = `${domain}${page === '/' ? '' : page}`;
  return (
    <div className="mt-3 border border-neutral-700/40 rounded bg-neutral-800/20 p-3">
      <div className="text-[10px] text-neutral-500 uppercase tracking-wider mb-2 font-semibold">SERP Preview</div>
      <div className="max-w-xl">
        <div className="text-[11px] text-green-700 font-mono mb-0.5 truncate">{breadcrumb}</div>
        <div className="text-[15px] leading-snug mb-1">
          {titleRaw ? (
            <>
              <span className="text-blue-400">{titleRaw.slice(0, TITLE_LIMIT)}</span>
              {(titleLen ?? 0) > TITLE_LIMIT && (
                <span className="text-red-400/50 line-through">{titleRaw.slice(TITLE_LIMIT, TITLE_LIMIT + 15)}&hellip;</span>
              )}
            </>
          ) : (
            <span className="text-neutral-600 italic text-sm">No title</span>
          )}
        </div>
        <div className="text-[12px] text-neutral-400 leading-relaxed">
          {descRaw ? (
            <>
              <span>{descRaw.slice(0, DESC_LIMIT)}</span>
              {(descLen ?? 0) > DESC_LIMIT && <span className="text-amber-400/60">&hellip;</span>}
            </>
          ) : (
            <span className="text-neutral-600 italic">No meta description</span>
          )}
        </div>
        <div className="flex gap-4 mt-1.5 text-[10px] font-mono text-neutral-600">
          {titleLen !== undefined && (
            <span className={titleLen > TITLE_LIMIT ? 'text-red-400' : titleLen > 50 ? 'text-amber-400' : ''}>
              title {titleLen}/{TITLE_LIMIT}
            </span>
          )}
          {descLen !== undefined && (
            <span className={descLen < 70 ? 'text-red-400' : descLen < 120 ? 'text-amber-400' : descLen > DESC_LIMIT ? 'text-red-400' : ''}>
              desc {descLen}/{DESC_LIMIT}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
