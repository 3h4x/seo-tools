import type { PropsWithChildren } from 'react';
import { notFound } from 'next/navigation';
import { getManagedSite, getSCUrl } from '@/lib/sites';
import { getCwvAuditSummary } from '@/lib/performance-site';
import { discoverPropertyIdsWithStatus, cachedGetAnalytics } from '@/lib/ga4';
import {
  cachedGetSearchConsoleDataWithComparison,
  cachedGetSearchConsolePages,
  cachedGetSearchConsoleQueries,
  cachedGetSitemapSubmissions,
} from '@/lib/search-console';
import { cachedAuditSite, createFailedSiteAuditResult, normalizeSiteAuditResult, type CheckStatus } from '@/lib/audit';
import { analyzeSiteGaps, createSiteGapSignals } from '@/lib/gaps';
import type { GapSeverity } from '@/lib/gap-definitions';
import { summarizeCanonicalChecks } from '@/lib/canonical';
import { getScDaily, getGa4Daily, getKeywordDeltas } from '@/lib/db';
import type { KeywordDelta } from '@/lib/keyword-history';
import { KeywordRankTable } from '../components/keyword-rank-table';
import { CHART_NEUTRALS, METRIC_COLORS, CWV_RATING_COLORS, CWV_THRESHOLDS, STATUS_COLORS, VALID_DAYS, type CwvMetricName } from '@/lib/constants';
import { pluralize, formatSource, formatDuration, formatBounce } from '@/lib/format';
import TimeRange from '../components/time-range';
import { Icons } from '../components/icons';
import TrendChart from '../components/trend-chart';
import { MetricCard } from '../components/metric-card';
import { CheckCard, statusDots, Recommendation, MetaChecksTable } from '../components/audit/check-card';
import { IndexNowButton } from '../components/indexnow-button';
import { gapsBySection } from '@/lib/gaps';
import { ScTable } from '../components/sc-table';
import { PageQueriesTable } from '../components/page-queries-table';
import { parseAllowedIntegerParam, type QueryParamValue } from '@/lib/days';
import { loadOrFallback, loadOrFlag, loadSyncOrFlag } from '@/lib/page-helpers';
import { PartialFailureBanner } from '../components/partial-failure-banner';
import { PerformanceSourceBadge } from '../components/performance-source-badge';
import { ProviderErrorBadge } from '../components/provider-error-badge';
import { DataTable, type DataTableColumn } from '../components/data-table';
import { Badge, Disclosure, Divider, Notice, NoticeCenteredContent, ProgressBar, Surface, TextLink } from '@/components/ui';

export const revalidate = 300;

const QUERY_BUCKETS = [
  { label: 'Top 3', sublabel: 'pos 1–3', color: STATUS_COLORS.pass.chart, test: (position: number) => position <= 3 },
  { label: '4–10', sublabel: 'first page', color: METRIC_COLORS.users, test: (position: number) => position > 3 && position <= 10 },
  { label: '11–20', sublabel: 'second page', color: STATUS_COLORS.warn.chart, test: (position: number) => position > 10 && position <= 20 },
  { label: '20+', sublabel: 'buried', color: CHART_NEUTRALS.inactive, test: (position: number) => position > 20 },
] as const;

const GAP_SEVERITY_BADGE_TONES = {
  high: 'dangerText',
  medium: 'warningText',
  low: 'mutedText',
} as const satisfies Record<GapSeverity, 'dangerText' | 'warningText' | 'mutedText'>;

type QueryBucketStat = (typeof QUERY_BUCKETS)[number] & {
  count: number;
  impressions: number;
  clicks: number;
};

const GA4_TOP_PAGE_COLUMNS: DataTableColumn[] = [
  { label: 'Page', rowHeader: true, className: 'px-4 py-3 font-semibold', cellClassName: 'px-4 py-2.5 font-normal text-left' },
  { label: 'Views', align: 'right', className: 'px-4 py-3 font-semibold text-right', cellClassName: 'px-4 py-2.5 text-right' },
  { label: 'Engagement', align: 'right', className: 'px-4 py-3 font-semibold text-right', cellClassName: 'px-4 py-2.5 text-right font-mono' },
];

const GA4_TRAFFIC_SOURCE_COLUMNS: DataTableColumn[] = [
  { label: 'Source', rowHeader: true, cellClassName: 'py-0.5 pr-3 font-normal text-left' },
  { label: 'Sessions', align: 'right', cellClassName: 'py-0.5 pl-3 text-right' },
];

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
  if (engagementRate >= 0.6) return STATUS_COLORS.pass.text;
  if (engagementRate >= 0.4) return STATUS_COLORS.warn.text;
  return STATUS_COLORS.fail.text;
}

function statusTextTone(status: CheckStatus, passTone: string = STATUS_COLORS.pass.text): string {
  return status === 'pass' ? passTone : STATUS_COLORS[status].text;
}

function coverageStatus(coveragePct: number): CheckStatus {
  if (coveragePct >= 60) return 'pass';
  if (coveragePct >= 30) return 'warn';
  return 'fail';
}

function ttfbStatus(ms: number): CheckStatus {
  if (ms < 800) return 'pass';
  if (ms < 2000) return 'warn';
  return 'fail';
}

function SearchConsoleDisabledNotice() {
  return (
    <Notice size="panel" className="rounded-lg">
      <h2 className="text-xs uppercase tracking-wider text-neutral-500 font-semibold">Search Console</h2>
      <p className="mt-2 text-sm text-neutral-500">
        Search Console is disabled for this site in Config. Metrics, query tables, and keyword history are hidden.
      </p>
    </Notice>
  );
}

export default async function SiteDashboardPage({
  params,
  searchParams,
}: {
  params: Promise<{ site: string }>;
  searchParams: Promise<{ days?: QueryParamValue }>;
}) {
  const { site: siteId } = await params;
  const site = await loadOrFallback(`SiteDashboard site ${siteId}`, getManagedSite(siteId), null);
  if (!site) notFound();

  const sp = await searchParams;
  const days = parseAllowedIntegerParam(sp.days, VALID_DAYS, 7);
  const hasSearchConsole = site.searchConsole !== false;

  // Discover GA4 property ID
  const discoveredResult = await loadOrFlag(
    'SiteDashboard GA4 discovery',
    discoverPropertyIdsWithStatus(),
    { sites: [], failed: false },
  );
  const discovered = discoveredResult.value.sites;
  const propertyId = discovered.find((s) => s.id === siteId)?.ga4PropertyId || site.ga4PropertyId || '';

  const scUrl = getSCUrl(site);

  const [rawAuditResult, sitemapSubmissionsResult, scComparisonResult, scQueriesResult, scTopPagesResult, ga4DataResult, cwvSummaryResult] = await Promise.all([
    loadOrFlag(`SiteDashboard audit ${siteId}`, cachedAuditSite(site), createFailedSiteAuditResult(site)),
    hasSearchConsole ? loadOrFlag(`SiteDashboard sitemap submissions ${siteId}`, cachedGetSitemapSubmissions(scUrl), []) : Promise.resolve({ value: [], failed: false }),
    hasSearchConsole ? loadOrFlag(`SiteDashboard Search Console comparison ${siteId}`, cachedGetSearchConsoleDataWithComparison(scUrl, days), { data: null, error: true }) : Promise.resolve({ value: null, failed: false }),
    hasSearchConsole ? loadOrFlag(`SiteDashboard Search Console queries ${siteId}`, cachedGetSearchConsoleQueries(scUrl, days), null) : Promise.resolve({ value: null, failed: false }),
    hasSearchConsole ? loadOrFlag(`SiteDashboard Search Console pages ${siteId}`, cachedGetSearchConsolePages(scUrl, days), null) : Promise.resolve({ value: null, failed: false }),
    loadOrFlag(`SiteDashboard GA4 ${siteId}`, cachedGetAnalytics(propertyId, days), { data: null, error: Boolean(propertyId) }),
    loadOrFlag(`SiteDashboard CWV ${siteId}`, getCwvAuditSummary(siteId), null),
  ]);
  const rawAudit = rawAuditResult.value;
  const sitemapSubmissions = sitemapSubmissionsResult.value;
  const scComparison = scComparisonResult.value;
  const scQueries = scQueriesResult.value;
  const scTopPages = scTopPagesResult.value;
  const ga4Data = ga4DataResult.value;
  const cwvSummary = cwvSummaryResult.value;

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
  const ga4TopPagesMaxViews = ga4?.topPages[0]?.views || 1;
  const queryBucketStats = scQueries ? getQueryBucketStats(scQueries) : [];
  const scQueryRows: Array<{ label: string; clicks: number; impressions: number; ctr: number; position: number }> = [];
  const scQueryExportRows: Array<{ query: string; clicks: number; impressions: number; ctr: string; position: string }> = [];

  for (const row of scQueries ?? []) {
    scQueryRows.push({
      label: row.query,
      clicks: row.clicks,
      impressions: row.impressions,
      ctr: row.ctr,
      position: row.position,
    });
    scQueryExportRows.push({
      query: row.query,
      clicks: row.clicks,
      impressions: row.impressions,
      ctr: `${(row.ctr * 100).toFixed(2)}%`,
      position: row.position.toFixed(1),
    });
  }

  const scDailyResult = hasSearchConsole
    ? loadSyncOrFlag(`SiteDashboard SC daily ${siteId}`, () => getScDaily(siteId), [])
    : { value: [], failed: false };
  const ga4DailyResult = loadSyncOrFlag(`SiteDashboard GA4 daily ${siteId}`, () => getGa4Daily(siteId), []);
  const keywordDeltasResult = hasSearchConsole
    ? loadSyncOrFlag(`SiteDashboard keyword deltas ${siteId}`, () => getKeywordDeltas(siteId), [])
    : { value: [] as KeywordDelta[], failed: false };
  const scDaily = scDailyResult.value;
  const ga4DailyData = ga4DailyResult.value;
  const keywordDeltas: KeywordDelta[] = keywordDeltasResult.value;

  const partialFailures: string[] = [];
  if (discoveredResult.failed || discoveredResult.value.failed) partialFailures.push('GA4 discovery');
  if (rawAuditResult.failed) partialFailures.push('site audit');
  if (sitemapSubmissionsResult.failed) partialFailures.push('sitemap submissions');
  if (scComparisonResult.failed) partialFailures.push('Search Console metrics');
  if (scQueriesResult.failed) partialFailures.push('Search Console queries');
  if (scTopPagesResult.failed) partialFailures.push('Search Console pages');
  if (ga4DataResult.failed) partialFailures.push('GA4 metrics');
  if (cwvSummaryResult.failed) partialFailures.push('Core Web Vitals');
  if (scDailyResult.failed) partialFailures.push('Search Console trends');
  if (ga4DailyResult.failed) partialFailures.push('GA4 trends');
  if (keywordDeltasResult.failed) partialFailures.push('keyword history');

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between">
        <div>
          <TextLink href="/" variant="muted" className="text-sm">&larr; Overview</TextLink>
          <h1 className="text-2xl font-bold text-white mt-1">{site.name}</h1>
          <p className="text-neutral-500 text-sm mt-1">{site.domain} &middot; Last {days} days</p>
        </div>
        <TimeRange />
      </div>
      <PartialFailureBanner failures={partialFailures} />
      <div className="flex flex-wrap gap-6">
        {([
          { status: 'pass', value: audit.score.pass, label: 'passed' },
          { status: 'warn', value: audit.score.warn, label: 'warnings' },
          { status: 'fail', value: audit.score.fail + audit.score.error, label: 'failures' },
        ] satisfies Array<{ status: CheckStatus; value: number; label: string }>).map(({ status, value, label }) => (
          <Badge key={label} size="inline" borderless className="gap-2 font-normal">
            <span className={`size-2 rounded-full ${STATUS_COLORS[status].dot}`} aria-hidden="true" />
            <span className={`${STATUS_COLORS[status].text} font-mono text-sm font-bold`}>{value}</span>
            <span className="text-neutral-500 text-xs">{label}</span>
          </Badge>
        ))}
        {totalGaps > 0 && (
          <div className="flex items-center gap-2 ml-auto">
            <span className="text-neutral-300 font-mono text-sm font-bold">{totalGaps}</span>
            <span className="text-neutral-500 text-xs">recommendations</span>
            {(['high', 'medium', 'low'] satisfies GapSeverity[]).map((severity) => (
              gapAnalysis.counts[severity] > 0 && (
                <Badge key={severity} tone={GAP_SEVERITY_BADGE_TONES[severity]} size="inline" borderless className="font-mono font-normal">
                  {gapAnalysis.counts[severity]} {severity === 'medium' ? 'med' : severity}
                </Badge>
              )
            ))}
          </div>
        )}
      </div>
      {hasSearchConsole ? (
        <div>
          <div className="flex items-center gap-3 mb-3">
            <h2 className="text-xs uppercase tracking-wider text-neutral-500 font-semibold">Search Console</h2>
            {scError && <ProviderErrorBadge />}
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <MetricCard icon={Icons.clicks} label="Clicks" current={sc?.current.clicks ?? 0} previous={sc?.previous.clicks} accentTone="success" />
            <MetricCard icon={Icons.impressions} label="Impressions" current={sc?.current.impressions ?? 0} previous={sc?.previous.impressions} accent="border-cyan-500" />
            <MetricCard label="CTR" value={hasSc ? `${(sc!.current.ctr * 100).toFixed(2)}%` : '\u2014'} current={hasSc ? sc!.current.ctr * 100 : 0} previous={hasSc ? sc!.previous.ctr * 100 : 0} accent="border-violet-500" icon={Icons.ctr} />
            <MetricCard label="Avg Position" value={hasSc ? sc!.current.position.toFixed(1) : '\u2014'} current={hasSc ? sc!.current.position : 0} previous={hasSc ? sc!.previous.position : 0} accentTone="warning" icon={Icons.position} invert />
          </div>
        </div>
      ) : (
        <SearchConsoleDisabledNotice />
      )}
      <div>
        <div className="flex items-center gap-3 mb-3">
          <h2 className="text-xs uppercase tracking-wider text-neutral-500 font-semibold">GA4 Analytics</h2>
          {ga4Error && <ProviderErrorBadge />}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          <MetricCard icon={Icons.users} label="Users" current={ga4?.current.users ?? 0} previous={ga4?.previous.users} accentTone="info" />
          <MetricCard icon={Icons.sessions} label="Sessions" current={ga4?.current.sessions ?? 0} previous={ga4?.previous.sessions} accent="border-pink-500" />
          <MetricCard icon={Icons.views} label="Page Views" current={ga4?.current.views ?? 0} previous={ga4?.previous.views} accentTone="warning" />
          <MetricCard label="Bounce Rate" value={hasGa4 ? formatBounce(ga4!.current.bounceRate) : '\u2014'} current={hasGa4 ? ga4!.current.bounceRate * 100 : 0} previous={hasGa4 ? ga4!.previous.bounceRate * 100 : 0} accentTone="danger" icon={Icons.bounce} invert />
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
          <Surface padding="sm" className="space-y-4">
            <div className="flex h-2.5 rounded-full overflow-hidden gap-px bg-neutral-800">
              {queryBucketStats.map((bucket) => bucket.count > 0 && (
                <div
                  key={bucket.label}
                  className="transition-all first:rounded-l-full last:rounded-r-full"
                  style={{
                    backgroundColor: bucket.color,
                    width: `${(bucket.count / scQueries.length) * 100}%`,
                  }}
                />
              ))}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {queryBucketStats.map((bucket) => (
                <div key={bucket.label} className="space-y-0.5">
                  <div className="flex items-center gap-1.5">
                    <div className="size-2 rounded-full shrink-0" style={{ backgroundColor: bucket.color }} />
                    <span className="text-neutral-400 text-xs font-semibold">{bucket.label}</span>
                  </div>
                  <div className="pl-3.5">
                    <span className="text-lg font-mono font-bold leading-none" style={{ color: bucket.color }}>{bucket.count}</span>
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
          </Surface>
        </div>
      )}
      {hasSearchConsole && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <ScTable
            heading="Top Queries"
            columnLabel="Query"
            rows={scQueryRows}
            emptyMessage="No query data available."
            exportData={scQueryExportRows}
            filename={`${siteId}-queries-${days}d`}
          />
          <PageQueriesTable siteId={siteId} days={days} />
        </div>
      )}
      {keywordDeltas.length > 0 && (
        <div>
          <h2 className="text-xs uppercase tracking-wider text-neutral-500 mb-3 font-semibold">
            Keyword Rank Changes
            <TextLink href="/trends#keywords" variant="muted" className="ml-3 text-neutral-600 hover:text-neutral-400 normal-case font-normal">view history →</TextLink>
          </h2>
          <Surface padding="none" className="overflow-hidden">
            <KeywordRankTable deltas={keywordDeltas} />
          </Surface>
        </div>
      )}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div>
          <h2 className="text-xs uppercase tracking-wider text-neutral-500 mb-3 font-semibold">Top Pages (GA4)</h2>
          {ga4 && ga4.topPages.length > 0 ? (
            <Surface padding="none" className="overflow-hidden">
              <DataTable
                columns={GA4_TOP_PAGE_COLUMNS}
                rows={ga4.topPages.map((page) => {
                  return [
                    <div key="page" className="min-w-0">
                      <span className="block truncate font-mono text-neutral-400">{page.path}</span>
                      <span className="block text-[11px] text-neutral-600">{formatDuration(page.avgSessionDuration)}</span>
                    </div>,
                    <div key="views" className="flex items-center justify-end gap-3">
                      <ProgressBar
                        value={(page.views / ga4TopPagesMaxViews) * 100}
                        className="w-16 h-1 shrink-0"
                      />
                      <span className="w-20 text-right font-mono text-neutral-500">{pluralize(page.views, 'view')}</span>
                    </div>,
                    <span key="engagement" className={engagementTone(page.engagementRate)}>
                      {(page.engagementRate * 100).toFixed(0)}%
                    </span>,
                  ];
                })}
                rowKeys={ga4.topPages.map((page, i) => `${page.path}-${i}`)}
                monospaceCells={false}
                containerClassName="contents"
                tableClassName="w-full text-xs"
                bodyClassName="divide-y divide-neutral-900"
                rowClassName="hover:bg-neutral-900/40"
              />
            </Surface>
          ) : (
            <Notice size="sm">
              <NoticeCenteredContent height="auto" textTone="muted" className="items-start text-left">
                No GA4 page data available.
              </NoticeCenteredContent>
            </Notice>
          )}
        </div>
        <div>
          <h2 className="text-xs uppercase tracking-wider text-neutral-500 mb-3 font-semibold">Traffic Sources</h2>
          {(ga4?.trafficSources ?? []).length === 0 ? (
            <Notice size="sm">
              <NoticeCenteredContent height="auto" textTone="muted" className="items-start text-left">
                No traffic source data available.
              </NoticeCenteredContent>
            </Notice>
          ) : (
            <Surface padding="sm">
              <DataTable
                columns={GA4_TRAFFIC_SOURCE_COLUMNS}
                rows={(ga4?.trafficSources ?? []).map((src) => [
                  <span key="source" className="text-neutral-400 font-mono">{formatSource(src.source, src.medium)}</span>,
                  <span key="sessions" className="text-neutral-500 font-mono">{pluralize(src.sessions, 'session')}</span>,
                ])}
                rowKeys={(ga4?.trafficSources ?? []).map((src, i) => `${src.source}-${src.medium}-${i}`)}
                caption="GA4 traffic sources"
                monospaceCells={false}
                containerClassName="contents"
                tableClassName="w-full text-xs"
                headClassName="sr-only"
                bodyClassName=""
                rowClassName=""
              />
            </Surface>
          )}
        </div>
      </div>
      <div>
        <Divider className="mb-8" />
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
              <div className="mt-3 space-y-2 text-xs font-mono">
                <Divider className="mb-3" />
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
              <div className="mt-3 space-y-2">
                <Divider className="mb-3" />
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
                    {s.isPending && (
                      <Badge size="xs" shape="rounded" tone="warning">
                        pending
                      </Badge>
                    )}
                    {s.errors > 0 && (
                      <Badge size="xs" shape="rounded" tone="danger">
                        {s.errors} errors
                      </Badge>
                    )}
                    {s.warnings > 0 && (
                      <Badge size="xs" shape="rounded" tone="warning">
                        {s.warnings} warnings
                      </Badge>
                    )}
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
                <ProgressBar
                  value={audit.indexingCoverage.coveragePct ?? 0}
                  className="w-full h-2"
                  fillClassName={STATUS_COLORS[coverageStatus(audit.indexingCoverage.coveragePct ?? 0)].dot}
                />
                <div className="flex justify-between text-[10px] text-neutral-600 mt-1">
                  <span>0%</span>
                  <span>30%</span>
                  <span>60%</span>
                  <span>100%</span>
                </div>
              </div>
            )}
          </CheckCard>
          <CheckCard check={audit.indexNow}>
            <IndexNowButton siteId={siteId} configured={Boolean(site.indexNowKey)} />
          </CheckCard>
          {audit.urlInspection.length > 0 && (
            <AuditPanel title={`URL Inspection · ${audit.urlInspection.length} test pages`}>
              <div className="space-y-3">
                {audit.urlInspection.map((inspection) => (
                  <Surface key={inspection.page} padding="xs" className="!bg-neutral-950/40">
                    <div className="flex flex-wrap items-center gap-3 text-xs">
                      <div className={`size-1.5 rounded-full shrink-0 ${statusDots[inspection.status]}`} />
                      <span className="text-neutral-300 font-mono">{inspection.page}</span>
                      <span className={`font-mono ${statusTextTone(inspection.status)}`}>{inspection.message}</span>
                      {inspection.verdict && <span className="text-neutral-500 font-mono">verdict: {inspection.verdict}</span>}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] font-mono text-neutral-500">
                      <span>crawl: <span className="text-neutral-300">{inspection.lastCrawlTime ? new Date(inspection.lastCrawlTime).toLocaleString() : '—'}</span></span>
                      <span>mobile: <span className="text-neutral-300">{inspection.mobileUsabilityVerdict ?? '—'}</span></span>
                      <span>rich results: <span className="text-neutral-300">{inspection.richResultsVerdict ?? '—'}</span></span>
                    </div>
                    {(inspection.googleCanonical || inspection.userCanonical) && (
                      <div className="mt-2 space-y-1 text-[11px] font-mono text-neutral-500 break-all">
                        {inspection.userCanonical && <div>user canonical: <span className="text-neutral-300">{inspection.userCanonical}</span></div>}
                        {inspection.googleCanonical && <div>google canonical: <span className="text-neutral-300">{inspection.googleCanonical}</span></div>}
                      </div>
                    )}
                    {inspection.referringUrls && inspection.referringUrls.length > 0 && (
                      <div className="mt-2 text-[11px] font-mono text-neutral-500">
                        discovered via: <span className="text-neutral-300">{inspection.referringUrls.slice(0, 2).join(' • ')}</span>
                      </div>
                    )}
                    {inspection.inspectionResultLink && (
                      <div className="mt-2">
                        <TextLink
                          href={inspection.inspectionResultLink}
                          target="_blank"
                          rel="noreferrer"
                          size="inherit"
                          variant="inherit"
                          className="text-[11px] text-neutral-400 hover:text-neutral-200"
                        >
                          Open in Search Console →
                        </TextLink>
                      </div>
                    )}
                  </Surface>
                ))}
              </div>
            </AuditPanel>
          )}
          <AuditPanel title={`Meta Tags · ${audit.metaTags.length} pages checked`}>
            <div className="space-y-5">
              {audit.metaTags.map((meta, i) => (
                <div key={i}>
                  <div className="text-neutral-400 text-xs font-mono pb-1">
                    {meta.page}
                  </div>
                  <Divider className="mb-2" />
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
                    <div className={statusTextTone(meta.canonical.status, 'text-neutral-500')}>
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
                <Surface padding="none" className="max-w-md w-full overflow-hidden !rounded border-neutral-700">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={audit.ogImage.url}
                    alt={`OG image for ${site.domain}`}
                    className="w-full"
                  />
                </Surface>
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
                          {!d.hasAlt && (
                            <Badge size="xs" shape="rounded" tone="danger" className="whitespace-nowrap">
                              missing alt
                            </Badge>
                          )}
                          {!d.isLazy && (
                            <Badge size="xs" shape="rounded" tone="warning" className="whitespace-nowrap">
                              not lazy
                            </Badge>
                          )}
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
                <Surface key={i} padding="xs" className="!bg-neutral-950/40">
                  <div className="flex flex-wrap items-center gap-4 text-xs">
                    <div className={`size-1.5 rounded-full shrink-0 ${statusDots[link.status]}`} />
                    <span className="text-neutral-400 font-mono w-32 shrink-0">{link.page}</span>
                    <span className="text-neutral-300 font-mono">{link.internalLinks} internal</span>
                    <span className="text-neutral-500 font-mono">{link.externalLinks} external</span>
                    <span className="text-neutral-600 font-mono">{link.brokenLinksMessage}</span>
                    {link.brokenLinks.length > 0 && (
                      <Badge size="xs" shape="rounded" tone="danger" className="font-mono">
                        {link.brokenLinks.length} broken
                      </Badge>
                    )}
                  </div>
                  {link.brokenLinks.length > 0 && (
                    <Disclosure
                      className="mt-3"
                      summary="Show broken internal URLs"
                      summaryClassName="cursor-pointer text-xs text-red-400 font-mono"
                    >
                      <div className="mt-2 space-y-1">
                        {link.brokenLinks.map((brokenLink) => (
                          <div key={`${link.page}-${brokenLink.url}`} className="text-[11px] font-mono text-neutral-500 break-all">
                            <Badge size="xs" shape="rounded" tone="danger" className="mr-1 font-mono">
                              HTTP {brokenLink.status || 0}
                            </Badge>
                            {brokenLink.url}
                          </div>
                        ))}
                      </div>
                    </Disclosure>
                  )}
                </Surface>
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
                    <span className={`font-mono ${statusTextTone(check.status, 'text-neutral-300')}`}>{check.message}</span>
                  </div>
                ))}
              </div>
              {sections['security']?.map(g => <Recommendation key={g.id} gap={g} />)}
            </AuditPanel>
          )}
          <CheckCard check={audit.ttfb} gaps={sections['ttfb']}>
            {audit.ttfb.ms !== undefined && (
              <div className="mt-3">
                <ProgressBar
                  value={(audit.ttfb.ms / 3000) * 100}
                  className="w-full h-2"
                  fillClassName={STATUS_COLORS[ttfbStatus(audit.ttfb.ms)].dot}
                />
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
            <Surface>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-white font-semibold text-sm">Core Web Vitals</h2>
                <div className="flex items-center gap-3">
                  <PerformanceSourceBadge source={cwvSummary.source} />
                  <TextLink
                    href={`/performance/${encodeURIComponent(siteId)}`}
                    variant="muted"
                  >
                    Full detail →
                  </TextLink>
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
            </Surface>
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

function ChartPanel({ title, children }: PropsWithChildren<{ title: string }>) {
  return (
    <Surface padding="sm">
      <h3 className="text-neutral-500 text-xs uppercase tracking-wider mb-3 font-semibold">{title}</h3>
      {children}
    </Surface>
  );
}

function AuditPanel({ title, children }: PropsWithChildren<{ title: string }>) {
  return (
    <Surface>
      <h2 className="text-white font-semibold text-sm mb-4">{title}</h2>
      {children}
    </Surface>
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
    <Surface padding="xs" className="mt-3 !rounded border-neutral-700/40 bg-neutral-800/20">
      <Badge size="inline" borderless uppercase className="mb-2 text-neutral-500 font-semibold">
        SERP Preview
      </Badge>
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
    </Surface>
  );
}
