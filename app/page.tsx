import { discoverPropertyIds, cachedGetAnalytics } from '@/lib/ga4';
import { cachedGetSearchConsoleData } from '@/lib/search-console';
import { getSCUrl } from '@/lib/sites';
import { formatSource } from '@/lib/format';
import { VALID_DAYS } from '@/lib/constants';
import TimeRange from './components/time-range';
import { MetricCard } from './components/metric-card';
import { Icons } from './components/icons';
import { TrafficSourcesChart, SiteMetricsChart } from './components/overview-charts';
import DailyTrafficChart from './components/daily-traffic-chart';
import { SortablePerformanceTable, type PerformanceRow } from './components/sortable-performance-table';

export const revalidate = 300;

async function getSiteData(days: number) {
  const sites = await discoverPropertyIds();

  const enrichedSites = await Promise.all(
    sites.map(async (site) => {
      const [scData, ga4Data] = await Promise.all([
        site.searchConsole ? cachedGetSearchConsoleData(getSCUrl(site), days) : null,
        cachedGetAnalytics(site.ga4PropertyId || '', days),
      ]);

      return {
        ...site,
        sc: scData || { clicks: 0, impressions: 0, ctr: '0%', position: '0' },
        ga4: ga4Data,
      };
    })
  );

  return enrichedSites.sort((a, b) => (b.ga4?.current.users ?? 0) - (a.ga4?.current.users ?? 0));
}

export default async function Overview({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  const params = await searchParams;
  const rawDays = parseInt(params.days || '7');
  const days = VALID_DAYS.includes(rawDays) ? rawDays : 7;
  const sites = await getSiteData(days);

  const totals = sites.reduce(
    (acc, s) => {
      if (s.ga4) {
        acc.users += s.ga4.current.users;
        acc.sessions += s.ga4.current.sessions;
        acc.views += s.ga4.current.views;
        acc.prevUsers += s.ga4.previous.users;
        acc.prevSessions += s.ga4.previous.sessions;
        acc.prevViews += s.ga4.previous.views;
      }
      acc.clicks += Number(s.sc.clicks);
      acc.impressions += Number(s.sc.impressions);
      return acc;
    },
    { users: 0, sessions: 0, views: 0, clicks: 0, impressions: 0, prevUsers: 0, prevSessions: 0, prevViews: 0 }
  );

  const performanceRows: PerformanceRow[] = sites.map((site) => ({
    id: site.id,
    name: site.name,
    domain: site.domain,
    users: site.ga4?.current.users ?? 0,
    prevUsers: site.ga4?.previous.users ?? 0,
    sessions: site.ga4?.current.sessions ?? 0,
    views: site.ga4?.current.views ?? 0,
    bounceRate: site.ga4 ? site.ga4.current.bounceRate : null,
    avgSessionDuration: site.ga4 ? site.ga4.current.avgSessionDuration : null,
    scClicks: Number(site.sc.clicks),
    scPosition: Number(site.sc.position),
    hasData: !!(site.ga4 && site.ga4.current.users > 0),
  }));

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Overview</h1>
          <p className="text-neutral-500 text-sm mt-1">Last {days} days · {sites.length} sites</p>
        </div>
        <TimeRange />
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        <MetricCard icon={Icons.users} label="Users" current={totals.users} previous={totals.prevUsers} accent="border-blue-500" />
        <MetricCard icon={Icons.sessions} label="Sessions" current={totals.sessions} previous={totals.prevSessions} accent="border-violet-500" />
        <MetricCard icon={Icons.views} label="Page Views" current={totals.views} previous={totals.prevViews} accent="border-amber-500" />
        <MetricCard icon={Icons.clicks} label="SC Clicks" current={totals.clicks} accent="border-emerald-500" />
        <MetricCard icon={Icons.impressions} label="SC Impressions" current={totals.impressions} accent="border-cyan-500" />
      </div>

      {/* Daily Traffic Chart */}
      <DailyTrafficChart days={days} />

      {/* Traffic Distribution */}
      <div>
        <h2 className="text-xs uppercase tracking-wider text-neutral-500 mb-3 font-semibold">Traffic Distribution</h2>
        <div className="bg-neutral-900 rounded-lg border border-neutral-800 p-5">
          {(() => {
            const fallbackColors = ['#10b981', '#3b82f6', '#8b5cf6', '#f59e0b', '#06b6d4', '#f43f5e', '#a78bfa'];
            const activeSites = sites.filter(s => (s.ga4?.current.users ?? 0) > 0);
            return (
              <>
                <div className="flex h-4 rounded-full overflow-hidden bg-neutral-800">
                  {activeSites.map((site, idx) => {
                    const pct = ((site.ga4?.current.users ?? 0) / totals.users) * 100;
                    const color = site.color ?? fallbackColors[idx % fallbackColors.length];
                    return (
                      <div
                        key={site.id}
                        className="h-full transition-all"
                        style={{ width: `${pct}%`, backgroundColor: color }}
                        title={`${site.name}: ${site.ga4?.current.users ?? 0} users (${pct.toFixed(0)}%)`}
                      />
                    );
                  })}
                </div>
                <div className="flex flex-wrap gap-4 mt-3">
                  {activeSites.map((site, idx) => {
                    const pct = ((site.ga4?.current.users ?? 0) / totals.users) * 100;
                    const color = site.color ?? fallbackColors[idx % fallbackColors.length];
                    return (
                      <div key={site.id} className="flex items-center gap-2 text-xs">
                        <div className="size-2 rounded-full" style={{ backgroundColor: color }} />
                        <span className="text-neutral-400">{site.name}</span>
                        <span className="text-neutral-600 font-mono">{pct.toFixed(0)}%</span>
                      </div>
                    );
                  })}
                </div>
              </>
            );
          })()}
        </div>
      </div>

      {/* Charts row */}
      {(() => {
        const sourceMap = new Map<string, number>();
        for (const site of sites) {
          if (site.ga4?.trafficSources) {
            for (const src of site.ga4.trafficSources) {
              const name = formatSource(src.source, src.medium);
              sourceMap.set(name, (sourceMap.get(name) || 0) + src.sessions);
            }
          }
        }
        const sourceData = [...sourceMap.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 8)
          .map(([name, sessions]) => ({ name, sessions }));

        const metricsData = sites
          .filter(s => s.ga4 && s.ga4.current.users > 0)
          .map(s => ({
            name: s.name,
            bounceRate: Math.round(s.ga4!.current.bounceRate * 100),
            avgDuration: Math.round(s.ga4!.current.avgSessionDuration),
            users: s.ga4!.current.users,
          }));

        return (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <TrafficSourcesChart data={sourceData} />
            <SiteMetricsChart data={metricsData} />
          </div>
        );
      })()}

      {/* Site Performance */}
      <div>
        <h2 className="text-xs uppercase tracking-wider text-neutral-500 mb-3 font-semibold">Site Performance</h2>
        <SortablePerformanceTable rows={performanceRows} />
      </div>
    </div>
  );
}
