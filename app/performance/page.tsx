import {
  CWV_METRIC_ORDER,
  CWV_RATING_COLORS,
  PERF_VALID_DAYS,
  rateCwv,
  ratePerformanceScore,
  type CwvMetricName,
  type CwvRating,
} from '@/lib/constants';
import { parseAllowedIntegerParam, type QueryParamValue } from '@/lib/days';
import {
  getPerformanceOverviewRows,
} from '@/lib/performance-overview';
import { Notice, Surface, TextLink } from '@/components/ui';
import TimeRange from '../components/time-range';
import CwvSetupGuide from '../components/cwv-setup-guide';
import { CwvCell } from '../components/cwv-cell';
import { CwvMetricsCards } from '../components/cwv-metrics-cards';
import { DataTable, type DataTableColumn } from '../components/data-table';
import { NoSitesNotice } from '../components/no-sites-notice';
import { PartialFailureBanner } from '../components/partial-failure-banner';
import { PerformanceSourceBadge } from '../components/performance-source-badge';

export const revalidate = 300;

export default async function PerformancePage({
  searchParams,
}: {
  searchParams: Promise<{ days?: QueryParamValue; guide?: QueryParamValue }>;
}) {
  const params = await searchParams;
  const days = parseAllowedIntegerParam(params.days, PERF_VALID_DAYS, 7);
  const { rows, failures } = await getPerformanceOverviewRows(days);

  const overallAgg: Record<CwvMetricName, { sum: number; count: number }> = {
    LCP:  { sum: 0, count: 0 }, INP: { sum: 0, count: 0 }, CLS: { sum: 0, count: 0 },
    FCP:  { sum: 0, count: 0 }, TTFB: { sum: 0, count: 0 },
  };
  let sitesWithRum = 0;
  let needsKey = false;
  let allNone = rows.length > 0;
  for (const row of rows) {
    for (const name of CWV_METRIC_ORDER) {
      const m = row.metrics[name];
      if (m) { overallAgg[name].sum += m.value; overallAgg[name].count += 1; }
    }
    if (row.source === 'rum') sitesWithRum += 1;
    if (row.needsKey) needsKey = true;
    if (row.source !== 'none') allNone = false;
  }
  const guideParam = Array.isArray(params.guide) ? params.guide[0] : params.guide;
  const guideOpen = guideParam === '1' || allNone;

  const overallMetrics: Partial<Record<CwvMetricName, { value: number; rating: CwvRating }>> = {};
  for (const name of CWV_METRIC_ORDER) {
    const a = overallAgg[name];
    if (a.count > 0) overallMetrics[name] = { value: a.sum / a.count, rating: rateCwv(name, a.sum / a.count) };
  }

  const columns: DataTableColumn[] = [
    { label: 'Site', rowHeader: true, className: 'px-3 py-2 font-semibold', cellClassName: 'px-3 py-2' },
    { label: 'Source', className: 'px-3 py-2 font-semibold', cellClassName: 'px-3 py-2' },
    ...CWV_METRIC_ORDER.map((name) => ({
      label: name,
      align: 'right' as const,
      className: 'px-3 py-2 font-semibold',
      cellClassName: 'px-3 py-2',
    })),
    { label: 'PSI', align: 'right', className: 'px-3 py-2 font-semibold', cellClassName: 'px-3 py-2 text-right font-mono' },
  ];

  const tableRows = rows.map((row) => [
      <div key="site">
        <TextLink
          href={`/performance/${encodeURIComponent(row.id)}`}
          variant="neutral"
          className="text-sm font-medium text-white"
        >
          {row.name}
        </TextLink>
        <div className="text-xs text-neutral-500 font-mono">{row.domain}</div>
      </div>,
      <PerformanceSourceBadge key="source" source={row.source} />,
      ...CWV_METRIC_ORDER.map((name) => {
        const m = row.metrics[name];
        return <CwvCell key={name} name={name} value={m?.value} rating={m?.rating} />;
      }),
      row.perfScore == null
        ? <span key="psi" className="text-neutral-600">—</span>
        : <span key="psi" className={CWV_RATING_COLORS[ratePerformanceScore(row.perfScore)].text}>{row.perfScore}</span>,
    ]);

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Performance</h1>
          <p className="text-neutral-500 text-sm mt-1">
            Last {days} days · {rows.length} sites · {sitesWithRum} with RUM data
          </p>
        </div>
        <TimeRange options={[{ value: '7', label: '7d' }, { value: '28', label: '28d' }]} defaultValue="7" />
      </div>

      <PartialFailureBanner failures={failures} />

      {needsKey && (
        <Notice tone="warning" size="sm">
          PageSpeed Insights rate-limited. Add a free API key in{' '}
          <TextLink href="/config" className="underline">Config</TextLink> to lift the per-IP cap.
        </Notice>
      )}

      <CwvMetricsCards
        metrics={overallMetrics}
        getFooter={(name) => {
          const a = overallAgg[name];
          return a.count > 0 ? `avg across ${a.count} site${a.count === 1 ? '' : 's'}` : 'no RUM data yet';
        }}
      />

      <div>
        <h2 className="text-xs uppercase tracking-wider text-neutral-500 mb-3 font-semibold">Per-site Core Web Vitals</h2>
        {rows.length > 0 ? (
          <Surface padding="none" className="overflow-hidden">
            <DataTable
              columns={columns}
              rows={tableRows}
              rowKeys={rows.map((row) => row.id)}
              monospaceCells={false}
              containerClassName="overflow-hidden"
              tableClassName="w-full text-sm"
              headRowClassName="border-b border-neutral-800 text-neutral-500"
              rowClassName="hover:bg-neutral-800/30"
            />
          </Surface>
        ) : (
          <NoSitesNotice />
        )}
      </div>

      <CwvSetupGuide defaultOpen={guideOpen} />
    </div>
  );
}
