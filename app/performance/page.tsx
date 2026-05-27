import Link from 'next/link';
import {
  CWV_METRIC_ORDER,
  PERF_VALID_DAYS,
  rateCwv,
  type CwvMetricName,
  type CwvRating,
} from '@/lib/constants';
import { parseAllowedIntegerParam, type QueryParamValue } from '@/lib/days';
import {
  getPerformanceOverviewRows,
  type PerformanceOverviewRow,
} from '@/lib/performance-overview';
import { Badge } from '@/components/ui';
import TimeRange from '../components/time-range';
import CwvSetupGuide from '../components/cwv-setup-guide';
import { CwvCell } from '../components/cwv-cell';
import { CwvMetricsCards } from '../components/cwv-metrics-cards';
import { DataTable, type DataTableColumn } from '../components/data-table';
import { NoSitesNotice } from '../components/no-sites-notice';

export const revalidate = 300;

const SOURCE_BADGE: Record<PerformanceOverviewRow['source'], { label: string; cls: string; tip: string }> = {
  'rum':         { label: 'RUM',      cls: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30', tip: 'Real-user data via GA4 core_web_vitals' },
  'rum-pending': { label: 'RUM 24h',  cls: 'bg-blue-500/15 text-blue-300 border-blue-500/30',          tip: 'Events flowing — custom dimensions still propagating to the Data API (24–48h after registration)' },
  'psi-field':   { label: 'CrUX',     cls: 'bg-blue-500/15 text-blue-300 border-blue-500/30',          tip: 'PageSpeed Insights field data (CrUX, p75)' },
  'psi-lab':     { label: 'Lab',      cls: 'bg-violet-500/15 text-violet-300 border-violet-500/30',    tip: 'Lighthouse lab synthetic measurements' },
  'none':        { label: 'No data',  cls: 'bg-neutral-800 text-neutral-500 border-neutral-700',       tip: 'No RUM events and PSI returned nothing' },
};

export default async function PerformancePage({
  searchParams,
}: {
  searchParams: Promise<{ days?: QueryParamValue; guide?: QueryParamValue }>;
}) {
  const params = await searchParams;
  const days = parseAllowedIntegerParam(params.days, PERF_VALID_DAYS, 7);
  const rows = await getPerformanceOverviewRows(days);

  const overallAgg: Record<CwvMetricName, { sum: number; count: number }> = {
    LCP:  { sum: 0, count: 0 }, INP: { sum: 0, count: 0 }, CLS: { sum: 0, count: 0 },
    FCP:  { sum: 0, count: 0 }, TTFB: { sum: 0, count: 0 },
  };
  for (const row of rows) {
    for (const name of CWV_METRIC_ORDER) {
      const m = row.metrics[name];
      if (m) { overallAgg[name].sum += m.value; overallAgg[name].count += 1; }
    }
  }
  const sitesWithRum = rows.filter(r => r.source === 'rum').length;
  const needsKey = rows.some(r => r.needsKey);
  const guideParam = Array.isArray(params.guide) ? params.guide[0] : params.guide;
  const guideOpen = guideParam === '1' || (rows.length > 0 && rows.every(r => r.source === 'none'));

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

  const tableRows = rows.map((row) => {
    const badge = SOURCE_BADGE[row.source];

    return [
      <div key="site">
        <Link href={`/performance/${encodeURIComponent(row.id)}`} className="text-white hover:underline">{row.name}</Link>
        <div className="text-xs text-neutral-500 font-mono">{row.domain}</div>
      </div>,
      <Badge key="source" title={badge.tip} shape="rounded" uppercase className={badge.cls}>
        {badge.label}
      </Badge>,
      ...CWV_METRIC_ORDER.map((name) => {
        const m = row.metrics[name];
        return <CwvCell key={name} name={name} value={m?.value} rating={m?.rating} />;
      }),
      row.perfScore == null
        ? <span key="psi" className="text-neutral-600">—</span>
        : <span key="psi" className={row.perfScore >= 90 ? 'text-emerald-400' : row.perfScore >= 50 ? 'text-amber-400' : 'text-red-400'}>{row.perfScore}</span>,
    ];
  });

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

      {needsKey && (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-4 py-2 text-sm text-amber-200">
          PageSpeed Insights rate-limited. Add a free API key in{' '}
          <Link href="/config" className="underline">Config</Link> to lift the per-IP cap.
        </div>
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
          <DataTable
            columns={columns}
            rows={tableRows}
            rowKeys={rows.map((row) => row.id)}
            monospaceCells={false}
            containerClassName="overflow-hidden rounded border border-neutral-800"
            tableClassName="w-full text-sm"
            headRowClassName="border-b border-neutral-800 text-neutral-500"
            rowClassName="hover:bg-neutral-800/30"
          />
        ) : (
          <NoSitesNotice />
        )}
      </div>

      <CwvSetupGuide defaultOpen={guideOpen} />
    </div>
  );
}
