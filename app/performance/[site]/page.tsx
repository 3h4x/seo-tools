import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { getPerformanceSiteData } from '@/lib/performance-site';
import { Notice } from '@/components/ui';
import {
  CWV_METRIC_ORDER,
  PERF_VALID_DAYS,
  CWV_THRESHOLDS,
  CWV_TREND_COLORS,
  rateCwv,
} from '@/lib/constants';
import { parseAllowedIntegerParam, type QueryParamValue } from '@/lib/days';
import TimeRange from '../../components/time-range';
import TrendChart from '../../components/trend-chart';
import CwvSetupGuide from '../../components/cwv-setup-guide';
import { CwvCell } from '../../components/cwv-cell';
import { CwvMetricsCards } from '../../components/cwv-metrics-cards';
import { DataTable, type DataTableColumn } from '../../components/data-table';
import { PartialFailureBanner } from '../../components/partial-failure-banner';
import { PerformanceSourceBadge } from '../../components/performance-source-badge';

export const revalidate = 300;

export default async function PerfSiteDetail({
  params,
  searchParams,
}: {
  params: Promise<{ site: string }>;
  searchParams: Promise<{ days?: QueryParamValue }>;
}) {
  const { site: siteId } = await params;
  const sp = await searchParams;
  const requestedDays = parseAllowedIntegerParam(sp.days, PERF_VALID_DAYS, 7);
  const perf = await getPerformanceSiteData(siteId, requestedDays);
  if (!perf) notFound();

  const { site, days, source, hasRum, propagating, eventCount, heroSource, overall, byDevice, slowestPages, trend, psi } = perf;
  const partialFailures = perf.failures ?? [];
  const hasOverallMetrics = CWV_METRIC_ORDER.some((name) => overall[name]);
  const trendData = trend.map((point) => ({
    date: point.date,
    LCP: point.metrics.LCP?.value ?? null,
    INP: point.metrics.INP?.value ?? null,
    CLS: point.metrics.CLS ? point.metrics.CLS.value * 1000 : null,
  }));
  const psiNeedsKey = perf.needsKey;
  const psiMobile = psi.mobile;
  const psiDesktop = psi.desktop;
  const slowestPageColumns: DataTableColumn[] = [
    { label: 'Path', rowHeader: true, className: 'px-3 py-2 font-semibold', cellClassName: 'px-3 py-2 font-mono text-xs font-normal text-left text-neutral-300' },
    { label: 'Samples', align: 'right', className: 'px-3 py-2 font-semibold', cellClassName: 'px-3 py-2 text-right font-mono text-neutral-400' },
    ...CWV_METRIC_ORDER.map((name) => ({
      label: name,
      align: 'right' as const,
      className: 'px-3 py-2 font-semibold',
      cellClassName: 'px-3 py-2 text-right',
    })),
  ];
  const slowestPageRows: ReactNode[][] = [];
  const slowestPageRowKeys: string[] = [];

  for (const row of slowestPages) {
    slowestPageRowKeys.push(row.path);
    slowestPageRows.push([
      row.path,
      row.totalSamples.toLocaleString(),
      ...CWV_METRIC_ORDER.map((name) => {
        const m = row.metrics[name];
        return <CwvCell key={name} name={name} value={m?.value} rating={m?.rating} />;
      }),
    ]);
  }

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs text-neutral-500">
            <Link href="/performance" className="hover:text-white">Performance</Link>
            <span>/</span>
            <span>{site.name}</span>
          </div>
          <h1 className="text-2xl font-bold text-white mt-1">{site.name}</h1>
          <p className="text-neutral-500 text-sm mt-1 font-mono">{site.domain}</p>
        </div>
        <div className="flex items-center gap-3">
          <PerformanceSourceBadge source={source} />
          <TimeRange options={[{ value: '7', label: '7d' }, { value: '28', label: '28d' }]} defaultValue="7" />
        </div>
      </div>

      <PartialFailureBanner failures={partialFailures} />

      {psiNeedsKey && (
        <Notice tone="warning" size="sm">
          PageSpeed Insights rate-limited. Add a free API key in{' '}
          <Link href="/config" className="underline">Config</Link> to lift the per-IP cap.
        </Notice>
      )}

      {propagating && (
        <Notice tone="info" className="space-y-1">
          <div className="font-semibold">GTM wired · RUM data propagating</div>
          <div className="text-blue-300/80 text-xs">
            {eventCount.toLocaleString()} <span className="font-mono">core_web_vitals</span> events received
            in the last {days} days, but custom dimensions/metrics are still propagating to the GA4 Data API.
            This typically takes 24–48 hours after registering them. Showing PSI fallback until then.
          </div>
        </Notice>
      )}

      {!hasOverallMetrics && !propagating && (
        <Notice className="space-y-1">
          <div className="font-semibold text-white">No Core Web Vitals data yet</div>
          <div className="text-xs text-neutral-500">
            No RUM events were queryable for the last {days} days, and PageSpeed Insights returned no CrUX
            or Lighthouse metrics for <span className="font-mono text-neutral-400">{perf.url}</span>.
            Use the setup guide below to wire GTM and GA4, then refresh after events start flowing.
          </div>
        </Notice>
      )}

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xs uppercase tracking-wider text-neutral-500 font-semibold">Overall ({heroSource})</h2>
          {!hasRum && psiMobile?.performanceScore != null && (
            <span className="text-xs text-neutral-500">Lighthouse mobile: <span className="text-white font-mono">{psiMobile.performanceScore}</span></span>
          )}
        </div>
        <CwvMetricsCards metrics={overall} source={heroSource} />
      </section>

      {hasRum && byDevice && (
        <section className="space-y-3">
          <h2 className="text-xs uppercase tracking-wider text-neutral-500 font-semibold">Mobile vs Desktop (RUM)</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h3 className="text-sm text-neutral-300 mb-2">Mobile</h3>
              <CwvMetricsCards metrics={byDevice.mobile} source="RUM" />
            </div>
            <div>
              <h3 className="text-sm text-neutral-300 mb-2">Desktop</h3>
              <CwvMetricsCards metrics={byDevice.desktop} source="RUM" />
            </div>
          </div>
        </section>
      )}

      {!hasRum && psiMobile && psiDesktop && (
        <section className="space-y-3">
          <h2 className="text-xs uppercase tracking-wider text-neutral-500 font-semibold">Mobile vs Desktop (PSI)</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h3 className="text-sm text-neutral-300 mb-2">Mobile · score {psiMobile.performanceScore ?? '—'}</h3>
              <CwvMetricsCards
                metrics={Object.fromEntries(
                  CWV_METRIC_ORDER.flatMap((n) => {
                    const f = psiMobile.field?.[n];
                    if (f) return [[n, { value: f.value, rating: f.rating, sampleCount: 0 }]];
                    const lab = psiMobile.lab[n];
                    return typeof lab === 'number' ? [[n, { value: lab, rating: rateCwv(n, lab), sampleCount: 0 }]] : [];
                  }),
                )}
                source={psiMobile.field ? 'CrUX' : 'Lab'}
              />
            </div>
            <div>
              <h3 className="text-sm text-neutral-300 mb-2">Desktop · score {psiDesktop.performanceScore ?? '—'}</h3>
              <CwvMetricsCards
                metrics={Object.fromEntries(
                  CWV_METRIC_ORDER.flatMap((n) => {
                    const f = psiDesktop.field?.[n];
                    if (f) return [[n, { value: f.value, rating: f.rating, sampleCount: 0 }]];
                    const lab = psiDesktop.lab[n];
                    return typeof lab === 'number' ? [[n, { value: lab, rating: rateCwv(n, lab), sampleCount: 0 }]] : [];
                  }),
                )}
                source={psiDesktop.field ? 'CrUX' : 'Lab'}
              />
            </div>
          </div>
        </section>
      )}

      {slowestPages.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-xs uppercase tracking-wider text-neutral-500 font-semibold">Slowest pages</h2>
          <DataTable
            columns={slowestPageColumns}
            rows={slowestPageRows}
            caption="Slowest pages by Core Web Vitals samples"
            rowKeys={slowestPageRowKeys}
            monospaceCells={false}
            containerClassName="overflow-hidden rounded border border-neutral-800"
            tableClassName="w-full text-sm"
            headRowClassName="border-b border-neutral-800 text-neutral-500"
            rowClassName="hover:bg-neutral-800/30"
          />
        </section>
      )}

      {trendData.length >= 2 && (
        <section className="space-y-3">
          <h2 className="text-xs uppercase tracking-wider text-neutral-500 font-semibold">Trend (RUM)</h2>
          <p className="text-xs text-neutral-500">CLS is scaled ×1000 for comparable axis. LCP/INP shown in ms.</p>
          <TrendChart
            data={trendData}
            lines={[
              { key: 'LCP', color: CWV_TREND_COLORS.LCP, label: `LCP (good ≤${CWV_THRESHOLDS.LCP.good}ms)` },
              { key: 'INP', color: CWV_TREND_COLORS.INP, label: `INP (good ≤${CWV_THRESHOLDS.INP.good}ms)` },
              { key: 'CLS', color: CWV_TREND_COLORS.CLS, label: 'CLS ×1000' },
            ]}
            height={240}
            valueFormat="integer"
          />
        </section>
      )}

      {!hasRum && !propagating && (
        <CwvSetupGuide defaultOpen />
      )}
    </div>
  );
}
