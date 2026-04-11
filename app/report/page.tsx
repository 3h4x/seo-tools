import { discoverPropertyIds, cachedGetAnalytics } from '@/lib/ga4';
import { cachedGetSearchConsoleDataWithComparison } from '@/lib/search-console';
import { getSCUrl } from '@/lib/sites';
import { formatDuration, formatBounce } from '@/lib/format';
import TimeRange from '../components/time-range';
import { TrendBadge } from '../components/trend-badge';
import { SummaryCard } from '../components/summary-card';
import { Icons } from '../components/icons';
import { CopyButton } from '../components/copy-button';
import Link from 'next/link';

export const revalidate = 300;

const VALID_DAYS = [1, 7, 30, 90, 180, 365];

async function getReportData(days: number) {
  const sites = await discoverPropertyIds();

  const enrichedSites = await Promise.all(
    sites.map(async (site) => {
      const [scData, ga4Data] = await Promise.all([
        site.searchConsole ? cachedGetSearchConsoleDataWithComparison(getSCUrl(site), days) : null,
        cachedGetAnalytics(site.ga4PropertyId || '', days),
      ]);

      return { ...site, sc: scData, ga4: ga4Data };
    }),
  );

  return enrichedSites.sort((a, b) => (b.sc?.current.clicks ?? 0) - (a.sc?.current.clicks ?? 0));
}

export default async function ReportPage({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  const params = await searchParams;
  const rawDays = parseInt(params.days || '7');
  const days = VALID_DAYS.includes(rawDays) ? rawDays : 7;
  const sites = await getReportData(days);

  const totals = sites.reduce(
    (acc, s) => {
      if (s.sc) {
        acc.clicks += s.sc.current.clicks;
        acc.impressions += s.sc.current.impressions;
        acc.prevClicks += s.sc.previous.clicks;
        acc.prevImpressions += s.sc.previous.impressions;
        acc.totalCtr += s.sc.current.ctr * s.sc.current.impressions;
        acc.totalPos += s.sc.current.position * s.sc.current.impressions;
        acc.prevTotalCtr += s.sc.previous.ctr * s.sc.previous.impressions;
        acc.prevTotalPos += s.sc.previous.position * s.sc.previous.impressions;
      }
      if (s.ga4) {
        acc.users += s.ga4.current.users;
        acc.sessions += s.ga4.current.sessions;
        acc.prevUsers += s.ga4.previous.users;
        acc.prevSessions += s.ga4.previous.sessions;
      }
      return acc;
    },
    { clicks: 0, impressions: 0, prevClicks: 0, prevImpressions: 0, totalCtr: 0, totalPos: 0, prevTotalCtr: 0, prevTotalPos: 0, users: 0, sessions: 0, prevUsers: 0, prevSessions: 0 },
  );

  const avgCtr = totals.impressions > 0 ? (totals.totalCtr / totals.impressions) * 100 : 0;
  const avgPos = totals.impressions > 0 ? totals.totalPos / totals.impressions : 0;
  const prevAvgCtr = totals.prevImpressions > 0 ? (totals.prevTotalCtr / totals.prevImpressions) * 100 : 0;
  const prevAvgPos = totals.prevImpressions > 0 ? totals.prevTotalPos / totals.prevImpressions : 0;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Analytics Report</h1>
          <p className="text-neutral-500 text-sm mt-1">Last {days} days &middot; Search Console + GA4</p>
        </div>
        <TimeRange />
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <SummaryCard icon={Icons.clicks} label="SC Clicks" value={totals.clicks} previous={totals.prevClicks} accent="border-emerald-500" />
        <SummaryCard icon={Icons.impressions} label="SC Impressions" value={totals.impressions} previous={totals.prevImpressions} accent="border-cyan-500" />
        <MetricCard label="Avg CTR" value={`${avgCtr.toFixed(2)}%`} current={avgCtr} previous={prevAvgCtr} accent="border-violet-500" icon={Icons.ctr} />
        <MetricCard label="Avg Position" value={avgPos.toFixed(1)} current={avgPos} previous={prevAvgPos} accent="border-amber-500" icon={Icons.position} invert />
        <SummaryCard icon={Icons.users} label="GA4 Users" value={totals.users} previous={totals.prevUsers} accent="border-blue-500" />
        <SummaryCard icon={Icons.sessions} label="GA4 Sessions" value={totals.sessions} previous={totals.prevSessions} accent="border-pink-500" />
      </div>

      {/* Per-site cards */}
      <div>
        <h2 className="text-xs uppercase tracking-wider text-neutral-500 mb-3 font-semibold">Per-Site Breakdown</h2>
        <div className="space-y-3">
          {sites.map((site) => {
            const hasSc = site.sc && site.sc.current.clicks > 0;
            const hasGa4 = site.ga4 && site.ga4.current.users > 0;

            return (
              <Link
                key={site.id}
                href={`/${site.id}?days=${days}`}
                className="block bg-neutral-900 rounded-lg border border-neutral-800 p-5 hover:border-neutral-700 transition-colors"
              >
                {/* Site header */}
                <div className="flex items-center gap-3 mb-4 flex-wrap">
                  <span className="text-white font-semibold">{site.name}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-neutral-600 text-xs">{site.domain}</span>
                    <CopyButton text={`https://${site.domain}`} label="domain" className="text-[10px] px-1.5 py-0.5" />
                  </div>
                </div>

                {/* Metrics grid */}
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-4 text-sm">
                  {/* SC metrics */}
                  <Metric label="SC Clicks" value={site.sc?.current.clicks ?? 0} previous={site.sc?.previous.clicks} />
                  <Metric label="Impressions" value={site.sc?.current.impressions ?? 0} previous={site.sc?.previous.impressions} />
                  <div>
                    <div className="text-neutral-500 text-xs mb-1">CTR</div>
                    <div className="text-neutral-300 font-mono">{hasSc ? `${(site.sc!.current.ctr * 100).toFixed(2)}%` : '\u2014'}</div>
                  </div>
                  <div>
                    <div className="text-neutral-500 text-xs mb-1">Position</div>
                    <div className="text-neutral-300 font-mono">{hasSc ? site.sc!.current.position.toFixed(1) : '\u2014'}</div>
                  </div>

                  {/* GA4 metrics */}
                  <Metric label="Users" value={site.ga4?.current.users ?? 0} previous={site.ga4?.previous.users} />
                  <Metric label="Sessions" value={site.ga4?.current.sessions ?? 0} previous={site.ga4?.previous.sessions} />
                  <div>
                    <div className="text-neutral-500 text-xs mb-1">Bounce</div>
                    <div className="text-neutral-300 font-mono">{hasGa4 ? formatBounce(site.ga4!.current.bounceRate) : '\u2014'}</div>
                  </div>
                  <div>
                    <div className="text-neutral-500 text-xs mb-1">Avg Duration</div>
                    <div className="text-neutral-300 font-mono">{hasGa4 ? formatDuration(site.ga4!.current.avgSessionDuration) : '\u2014'}</div>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value, previous }: { label: string; value: number; previous?: number }) {
  return (
    <div>
      <div className="text-neutral-500 text-xs mb-1">{label}</div>
      <div className="text-neutral-300 font-mono">
        {value > 0 ? value.toLocaleString() : '\u2014'}
        {previous !== undefined && value > 0 && <TrendBadge current={value} previous={previous} />}
      </div>
    </div>
  );
}

function MetricCard({ label, value, current, previous, accent, icon, invert }: {
  label: string;
  value: string;
  current: number;
  previous: number;
  accent: string;
  icon: React.ReactNode;
  invert?: boolean;
}) {
  const diff = previous > 0 ? ((current - previous) / previous) * 100 : 0;
  const show = Math.abs(diff) >= 1;
  // For position, lower is better
  const up = invert ? diff < 0 : diff > 0;
  return (
    <div className={`bg-neutral-900 rounded-lg border border-neutral-800 border-l-4 ${accent} p-4`}>
      <div className="flex items-center gap-2 text-neutral-500 mb-2">
        {icon}
        <span className="text-xs uppercase tracking-wider">{label}</span>
      </div>
      <div className="flex items-baseline gap-2">
        <span className="text-white text-2xl font-mono font-bold">{value}</span>
        {show && (
          <span className={`text-[10px] font-medium ${up ? 'text-emerald-400' : 'text-red-400'}`}>
            {diff > 0 ? '\u2191' : '\u2193'}{Math.abs(diff).toFixed(0)}%
          </span>
        )}
      </div>
    </div>
  );
}
