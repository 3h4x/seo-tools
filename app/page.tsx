import { discoverPropertyIds, cachedGetAnalytics } from '@/lib/ga4';
import { cachedGetSearchConsoleData } from '@/lib/search-console';
import { getSCUrl } from '@/lib/sites';
import { formatSource } from '@/lib/format';
import { VALID_DAYS } from '@/lib/constants';
import { parseAllowedIntegerParam, type QueryParamValue } from '@/lib/days';
import { loadOrFallback } from '@/lib/page-helpers';
import TimeRange from './components/time-range';
import { MetricCard } from './components/metric-card';
import { Icons } from './components/icons';
import { TrafficSourcesChart } from './components/overview-charts';
import DailyTrafficChart from './components/daily-traffic-chart';
import { SortablePerformanceTable, type PerformanceRow } from './components/sortable-performance-table';

export const revalidate = 300;

async function getSiteData(days: number) {
  const sites = await loadOrFallback('OverviewPage discoverPropertyIds', discoverPropertyIds(), []);

  const enrichedSites = await Promise.all(
    sites.map(async (site) => {
      const [scResult, ga4Result] = await Promise.all([
        site.searchConsole !== false
          ? cachedGetSearchConsoleData(getSCUrl(site), days).catch((error) => {
              console.error(`[OverviewPage] Search Console ${site.id}:`, error);
              return { data: null, error: true };
            })
          : null,
        cachedGetAnalytics(site.ga4PropertyId || '', days).catch((error) => {
          console.error(`[OverviewPage] GA4 ${site.id}:`, error);
          return { data: null, error: true };
        }),
      ]);

      return {
        ...site,
        sc: scResult,
        ga4: ga4Result,
      };
    })
  );

  return enrichedSites.sort((a, b) => (b.ga4?.data?.current.users ?? 0) - (a.ga4?.data?.current.users ?? 0));
}

export default async function Overview({ searchParams }: { searchParams: Promise<{ days?: QueryParamValue }> }) {
  const params = await searchParams;
  const days = parseAllowedIntegerParam(params.days, VALID_DAYS, 7);
  const sites = await getSiteData(days);

  const totals = sites.reduce(
    (acc, s) => {
      if (s.ga4?.data) {
        acc.users += s.ga4.data.current.users;
        acc.sessions += s.ga4.data.current.sessions;
        acc.views += s.ga4.data.current.views;
        acc.prevUsers += s.ga4.data.previous.users;
        acc.prevSessions += s.ga4.data.previous.sessions;
        acc.prevViews += s.ga4.data.previous.views;
      }
      if (s.sc?.data) {
        acc.clicks += Number(s.sc.data.clicks);
        acc.impressions += Number(s.sc.data.impressions);
      }
      return acc;
    },
    { users: 0, sessions: 0, views: 0, clicks: 0, impressions: 0, prevUsers: 0, prevSessions: 0, prevViews: 0 }
  );

  const performanceRows: PerformanceRow[] = sites.map((site) => ({
    id: site.id,
    name: site.name,
    domain: site.domain,
    users: site.ga4?.data?.current.users ?? 0,
    prevUsers: site.ga4?.data?.previous.users ?? 0,
    sessions: site.ga4?.data?.current.sessions ?? 0,
    views: site.ga4?.data?.current.views ?? 0,
    bounceRate: site.ga4?.data ? site.ga4.data.current.bounceRate : null,
    avgSessionDuration: site.ga4?.data ? site.ga4.data.current.avgSessionDuration : null,
    scClicks: site.sc === null ? 0 : site.sc.error ? null : Number(site.sc.data?.clicks ?? 0),
    scPosition: site.sc === null ? 0 : site.sc.error ? null : Number(site.sc.data?.position ?? 0),
    hasData: !!(site.ga4?.data && site.ga4.data.current.users > 0),
  }));

  const sourceMap = new Map<string, number>();
  for (const site of sites) {
    if (site.ga4?.data?.trafficSources) {
      for (const src of site.ga4.data.trafficSources) {
        const name = formatSource(src.source, src.medium);
        sourceMap.set(name, (sourceMap.get(name) || 0) + src.sessions);
      }
    }
  }
  const sourceData = [...sourceMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([name, sessions]) => ({ name, sessions }));

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Overview</h1>
          <p className="text-neutral-500 text-sm mt-1">Last {days} days · {sites.length} sites</p>
        </div>
        <TimeRange />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        <MetricCard icon={Icons.users} label="Users" current={totals.users} previous={totals.prevUsers} accent="border-blue-500" />
        <MetricCard icon={Icons.sessions} label="Sessions" current={totals.sessions} previous={totals.prevSessions} accent="border-violet-500" />
        <MetricCard icon={Icons.views} label="Page Views" current={totals.views} previous={totals.prevViews} accent="border-amber-500" />
        <MetricCard icon={Icons.clicks} label="SC Clicks" current={totals.clicks} accent="border-emerald-500" />
        <MetricCard icon={Icons.impressions} label="SC Impressions" current={totals.impressions} accent="border-cyan-500" />
      </div>
      <DailyTrafficChart days={days} />
      <TrafficSourcesChart data={sourceData} />
      <div>
        <h2 className="text-xs uppercase tracking-wider text-neutral-500 mb-3 font-semibold">Site Performance</h2>
        <SortablePerformanceTable rows={performanceRows} />
      </div>
    </div>
  );
}
