import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getPerformanceSiteData } from '@/lib/performance-site';
import {
  CWV_METRIC_ORDER,
  PERF_VALID_DAYS,
  CWV_THRESHOLDS,
  rateCwv,
} from '@/lib/constants';
import { parseAllowedIntegerParam, type QueryParamValue } from '@/lib/days';
import TimeRange from '../../components/time-range';
import TrendChart from '../../components/trend-chart';
import CwvSetupGuide from '../../components/cwv-setup-guide';
import { CwvCell } from '../../components/cwv-cell';
import { CwvMetricsCards } from '../../components/cwv-metrics-cards';

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

  const { site, days, hasRum, propagating, eventCount, heroSource, overall, byDevice, slowestPages, trend, psi } = perf;
  const trendData = trend.map((point) => ({
    date: point.date,
    LCP: point.metrics.LCP?.value ?? null,
    INP: point.metrics.INP?.value ?? null,
    CLS: point.metrics.CLS ? point.metrics.CLS.value * 1000 : null,
  }));
  const psiNeedsKey = perf.needsKey;
  const psiMobile = psi.mobile;
  const psiDesktop = psi.desktop;

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
        <TimeRange options={[{ value: '7', label: '7d' }, { value: '28', label: '28d' }]} defaultValue="7" />
      </div>

      {psiNeedsKey && (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-4 py-2 text-sm text-amber-200">
          PageSpeed Insights rate-limited. Add a free API key in{' '}
          <Link href="/config" className="underline">Config</Link> to lift the per-IP cap.
        </div>
      )}

      {propagating && (
        <div className="rounded-md border border-blue-500/40 bg-blue-500/10 px-4 py-3 text-sm text-blue-200 space-y-1">
          <div className="font-semibold">GTM wired · RUM data propagating</div>
          <div className="text-blue-300/80 text-xs">
            {eventCount.toLocaleString()} <span className="font-mono">core_web_vitals</span> events received
            in the last {days} days, but custom dimensions/metrics are still propagating to the GA4 Data API.
            This typically takes 24–48 hours after registering them. Showing PSI fallback until then.
          </div>
        </div>
      )}

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xs uppercase tracking-wider text-neutral-500 font-semibold">Overall ({heroSource})</h2>
          {psiMobile?.performanceScore != null && (
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
          <div className="overflow-hidden rounded border border-neutral-800">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-neutral-800 text-neutral-500">
                  <th className="px-3 py-2 text-left font-semibold">Path</th>
                  <th className="px-3 py-2 text-right font-semibold">Samples</th>
                  {CWV_METRIC_ORDER.map(n => (
                    <th key={n} className="px-3 py-2 text-right font-semibold">{n}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800">
                {slowestPages.map((row) => (
                  <tr key={row.path} className="hover:bg-neutral-800/30">
                    <td className="px-3 py-2 font-mono text-xs text-neutral-300">{row.path}</td>
                    <td className="px-3 py-2 text-right font-mono text-neutral-400">{row.totalSamples.toLocaleString()}</td>
                    {CWV_METRIC_ORDER.map((name) => {
                      const m = row.metrics[name];
                      return (
                        <td key={name} className="px-3 py-2 text-right">
                          <CwvCell name={name} value={m?.value} rating={m?.rating} />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {trendData.length >= 2 && (
        <section className="space-y-3">
          <h2 className="text-xs uppercase tracking-wider text-neutral-500 font-semibold">Trend (RUM)</h2>
          <p className="text-xs text-neutral-500">CLS is scaled ×1000 for comparable axis. LCP/INP shown in ms.</p>
          <TrendChart
            data={trendData}
            lines={[
              { key: 'LCP', color: '#3b82f6', label: `LCP (good ≤${CWV_THRESHOLDS.LCP.good}ms)` },
              { key: 'INP', color: '#8b5cf6', label: `INP (good ≤${CWV_THRESHOLDS.INP.good}ms)` },
              { key: 'CLS', color: '#f59e0b', label: 'CLS ×1000' },
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
