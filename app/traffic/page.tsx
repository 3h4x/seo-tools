import Link from 'next/link';
import { discoverPropertyIds, cachedGetAnalytics } from '@/lib/ga4';
import { cachedGetSearchConsoleDataWithComparison } from '@/lib/search-console';
import { getSCUrl } from '@/lib/sites';
import { formatDuration, formatBounce } from '@/lib/format';
import TimeRange from '../components/time-range';
import {
  UsersComparisonChart,
  UserDistributionChart,
  BounceRateChart,
  SearchConsoleChart,
  PositionChart,
  GrowthRadarChart,
} from '../components/traffic-charts';

export const revalidate = 300;

const VALID_DAYS = [1, 7, 30, 90, 180, 365];

type TrafficStatus = 'up' | 'down' | 'flat' | 'none';

const statusDots: Record<TrafficStatus, string> = {
  up: 'bg-emerald-500',
  down: 'bg-red-500',
  flat: 'bg-neutral-500',
  none: 'bg-neutral-700',
};

const accentBorder: Record<TrafficStatus, string> = {
  up: 'border-l-emerald-500',
  down: 'border-l-red-500',
  flat: 'border-l-neutral-600',
  none: 'border-l-neutral-700',
};

function trendStatus(current: number, previous: number): TrafficStatus {
  if (current === 0 && previous === 0) return 'none';
  if (previous === 0) return current > 0 ? 'up' : 'none';
  const pct = ((current - previous) / previous) * 100;
  if (pct >= 5) return 'up';
  if (pct <= -5) return 'down';
  return 'flat';
}

function trendPct(current: number, previous: number): string {
  if (previous === 0 && current === 0) return '';
  if (previous === 0) return 'NEW';
  const pct = ((current - previous) / previous) * 100;
  if (Math.abs(pct) < 1) return '';
  return `${pct > 0 ? '+' : ''}${pct.toFixed(0)}%`;
}

const trendColors: Record<TrafficStatus, string> = {
  up: 'text-emerald-400',
  down: 'text-red-400',
  flat: 'text-neutral-500',
  none: 'text-neutral-600',
};

async function getTrafficData(days: number) {
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

  return enrichedSites.sort((a, b) => (b.ga4?.current.users ?? 0) - (a.ga4?.current.users ?? 0));
}

export default async function TrafficPage({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  const params = await searchParams;
  const rawDays = parseInt(params.days || '7');
  const days = VALID_DAYS.includes(rawDays) ? rawDays : 7;
  const sites = await getTrafficData(days);

  const totals = sites.reduce(
    (acc, s) => {
      if (s.ga4) {
        acc.users += s.ga4.current.users;
        acc.prevUsers += s.ga4.previous.users;
        acc.sessions += s.ga4.current.sessions;
        acc.prevSessions += s.ga4.previous.sessions;
        acc.views += s.ga4.current.views;
        acc.prevViews += s.ga4.previous.views;
      }
      if (s.sc) {
        acc.clicks += s.sc.current.clicks;
        acc.prevClicks += s.sc.previous.clicks;
        acc.impressions += s.sc.current.impressions;
        acc.prevImpressions += s.sc.previous.impressions;
      }
      return acc;
    },
    { users: 0, prevUsers: 0, sessions: 0, prevSessions: 0, views: 0, prevViews: 0, clicks: 0, prevClicks: 0, impressions: 0, prevImpressions: 0 },
  );

  const overallStatus = trendStatus(totals.users, totals.prevUsers);
  const growingSites = sites.filter(s => s.ga4 && trendStatus(s.ga4.current.users, s.ga4.previous.users) === 'up').length;
  const decliningSites = sites.filter(s => s.ga4 && trendStatus(s.ga4.current.users, s.ga4.previous.users) === 'down').length;

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Traffic Comparison</h1>
          <p className="text-neutral-500 text-sm mt-1">Last {days} days vs previous {days} days · {sites.length} sites</p>
        </div>
        <TimeRange />
      </div>

      {/* Summary */}
      <div className="flex gap-6 items-center">
        <div className="bg-neutral-900 rounded-lg border border-neutral-800 p-5 flex items-center gap-5 shrink-0">
          <div className="relative size-24">
            <svg viewBox="0 0 100 100" className="size-24 -rotate-90">
              <circle cx="50" cy="50" r="42" fill="none" stroke="#262626" strokeWidth="8" />
              <circle
                cx="50" cy="50" r="42" fill="none"
                stroke={overallStatus === 'up' ? '#10b981' : overallStatus === 'down' ? '#ef4444' : '#737373'}
                strokeWidth="8" strokeLinecap="round"
                strokeDasharray={`${Math.min(100, totals.prevUsers > 0 ? (totals.users / totals.prevUsers) * 100 : 100) * 2.64} 264`}
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className={`text-lg font-bold font-mono ${trendColors[overallStatus]}`}>
                {trendPct(totals.users, totals.prevUsers) || '0%'}
              </span>
            </div>
          </div>
          <div className="space-y-1">
            <div className="text-white font-semibold text-sm">User Growth</div>
            <div className="text-neutral-500 text-xs">{totals.users.toLocaleString()} users total</div>
            {growingSites > 0 && <div className="text-emerald-500 text-xs">{growingSites} site{growingSites > 1 ? 's' : ''} growing</div>}
            {decliningSites > 0 && <div className="text-red-500 text-xs">{decliningSites} site{decliningSites > 1 ? 's' : ''} declining</div>}
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 flex-1">
          <StatCard label="Sessions" current={totals.sessions} previous={totals.prevSessions} />
          <StatCard label="Page Views" current={totals.views} previous={totals.prevViews} />
          <StatCard label="SC Clicks" current={totals.clicks} previous={totals.prevClicks} />
          <StatCard label="SC Impressions" current={totals.impressions} previous={totals.prevImpressions} />
        </div>
      </div>

      {/* Charts */}
      {(() => {
        const chartData = sites.map(s => ({
          name: s.name,
          users: s.ga4?.current.users ?? 0,
          prevUsers: s.ga4?.previous.users ?? 0,
          sessions: s.ga4?.current.sessions ?? 0,
          prevSessions: s.ga4?.previous.sessions ?? 0,
          views: s.ga4?.current.views ?? 0,
          prevViews: s.ga4?.previous.views ?? 0,
          bounceRate: s.ga4 && s.ga4.current.users > 0 ? Math.round(s.ga4.current.bounceRate * 100) : 0,
          avgDuration: s.ga4 && s.ga4.current.users > 0 ? Math.round(s.ga4.current.avgSessionDuration) : 0,
          clicks: s.sc?.current.clicks ?? 0,
          prevClicks: s.sc?.previous.clicks ?? 0,
          impressions: s.sc?.current.impressions ?? 0,
          prevImpressions: s.sc?.previous.impressions ?? 0,
          position: s.sc ? s.sc.current.position : 0,
        }));

        return (
          <>
            <div>
              <h2 className="text-xs uppercase tracking-wider text-neutral-500 mb-3 font-semibold">Global Charts</h2>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <UsersComparisonChart data={chartData} />
                <UserDistributionChart data={chartData} />
                <SearchConsoleChart data={chartData} />
                <BounceRateChart data={chartData} />
                <PositionChart data={chartData} />
                <GrowthRadarChart data={chartData} />
              </div>
            </div>
          </>
        );
      })()}

      {/* Site cards */}
      <div className="space-y-4">
        {sites.map((site) => {
          const userStatus = site.ga4 ? trendStatus(site.ga4.current.users, site.ga4.previous.users) : 'none';

          return (
            <Link
              key={site.id}
              href={`/${site.id}?days=${days}`}
              className={`block bg-neutral-900 rounded-lg border border-neutral-800 border-l-4 ${accentBorder[userStatus]} p-5 hover:bg-neutral-800/50 transition-colors`}
            >
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <span className="text-white font-semibold">{site.name}</span>
                  <span className="text-neutral-600 text-xs">{site.domain}</span>
                  {site.ga4 && site.ga4.current.users > 0 && (
                    <TrendBadge status={userStatus} label={trendPct(site.ga4.current.users, site.ga4.previous.users)} />
                  )}
                </div>
                <span className="text-neutral-600 text-xs">View details &rarr;</span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-8 gap-3">
                <MetricItem
                  label="Users"
                  value={site.ga4?.current.users ?? 0}
                  status={site.ga4 ? trendStatus(site.ga4.current.users, site.ga4.previous.users) : 'none'}
                />
                <MetricItem
                  label="Sessions"
                  value={site.ga4?.current.sessions ?? 0}
                  status={site.ga4 ? trendStatus(site.ga4.current.sessions, site.ga4.previous.sessions) : 'none'}
                />
                <MetricItem
                  label="Page Views"
                  value={site.ga4?.current.views ?? 0}
                  status={site.ga4 ? trendStatus(site.ga4.current.views, site.ga4.previous.views) : 'none'}
                />
                <MetricItem
                  label="Bounce"
                  value={site.ga4 && site.ga4.current.users > 0 ? formatBounce(site.ga4.current.bounceRate) : null}
                  status={site.ga4 && site.ga4.current.users > 0
                    ? trendStatus(site.ga4.previous.bounceRate, site.ga4.current.bounceRate) // inverted: lower bounce = better
                    : 'none'}
                />
                <MetricItem
                  label="Avg Duration"
                  value={site.ga4 && site.ga4.current.users > 0 ? formatDuration(site.ga4.current.avgSessionDuration) : null}
                  status={site.ga4 && site.ga4.current.users > 0
                    ? trendStatus(site.ga4.current.avgSessionDuration, site.ga4.previous.avgSessionDuration)
                    : 'none'}
                />
                <MetricItem
                  label="SC Clicks"
                  value={site.sc?.current.clicks ?? 0}
                  status={site.sc ? trendStatus(site.sc.current.clicks, site.sc.previous.clicks) : 'none'}
                />
                <MetricItem
                  label="Impressions"
                  value={site.sc?.current.impressions ?? 0}
                  status={site.sc ? trendStatus(site.sc.current.impressions, site.sc.previous.impressions) : 'none'}
                />
                <MetricItem
                  label="SC Position"
                  value={site.sc && site.sc.current.position > 0 ? site.sc.current.position.toFixed(1) : null}
                  status={site.sc && site.sc.current.position > 0
                    ? trendStatus(site.sc.previous.position, site.sc.current.position) // inverted: lower position = better
                    : 'none'}
                />
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function MetricItem({ label, value, status }: { label: string; value: number | string | null; status: TrafficStatus }) {
  return (
    <div className="flex items-center gap-2">
      <div className={`size-2 rounded-full shrink-0 ${statusDots[status]}`} />
      <div>
        <div className="text-neutral-300 text-xs font-medium">{label}</div>
        <div className="text-neutral-500 text-[10px] font-mono">
          {value === null || value === 0 ? '\u2014' : typeof value === 'number' ? value.toLocaleString() : value}
        </div>
      </div>
    </div>
  );
}

function TrendBadge({ status, label }: { status: TrafficStatus; label: string }) {
  if (!label) return null;
  const colors: Record<TrafficStatus, string> = {
    up: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    down: 'bg-red-500/10 text-red-400 border-red-500/20',
    flat: 'bg-neutral-500/10 text-neutral-400 border-neutral-500/20',
    none: 'bg-neutral-500/10 text-neutral-400 border-neutral-500/20',
  };
  return (
    <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${colors[status]}`}>
      {label}
    </span>
  );
}

function StatCard({ label, current, previous }: { label: string; current: number; previous: number }) {
  const status = trendStatus(current, previous);
  const pct = trendPct(current, previous);
  const borderColors: Record<TrafficStatus, string> = {
    up: 'border-l-emerald-500',
    down: 'border-l-red-500',
    flat: 'border-l-neutral-600',
    none: 'border-l-neutral-700',
  };
  return (
    <div className={`bg-neutral-900 rounded-lg border border-neutral-800 border-l-4 ${borderColors[status]} p-4`}>
      <div className="text-neutral-500 text-xs uppercase tracking-wider mb-1">{label}</div>
      <div className="flex items-baseline gap-2">
        <span className={`text-2xl font-mono font-bold ${trendColors[status]}`}>
          {current > 0 ? current.toLocaleString() : '\u2014'}
        </span>
        {pct && <span className={`text-[10px] font-medium ${trendColors[status]}`}>{pct}</span>}
      </div>
    </div>
  );
}
