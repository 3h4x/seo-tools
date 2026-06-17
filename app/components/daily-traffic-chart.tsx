'use client';

import { useEffect, useState } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import ClientChart from './client-chart';
import TrendChart from './trend-chart';
import { formatDateShort } from '@/lib/format';
import { CHART_NEUTRALS, METRIC_COLORS } from '@/lib/constants';
import { todayDateOnly } from '@/lib/date-only';
import { Notice, NoticeCenteredContent, SegmentedControl, Skeleton, Surface, ToggleButtonGroup } from '@/components/ui';
import { SkeletonChipRow } from './skeletons';

const METRICS = ['views', 'users', 'clicks', 'impressions'] as const;
const METRIC_OPTIONS = METRICS.map(metric => ({
  value: metric,
  label: metric.charAt(0).toUpperCase() + metric.slice(1),
}));
type Metric = (typeof METRICS)[number];
type ChartType = 'area' | 'bar';
type ViewMode = 'persite' | 'cumulative';

const TOOLTIP_STYLE = { backgroundColor: CHART_NEUTRALS.tooltipBg, border: `1px solid ${CHART_NEUTRALS.axis}`, borderRadius: '8px', fontSize: '12px' };

interface DailyData {
  [date: string]: {
    [siteId: string]: { users: number; views: number; clicks: number; impressions: number };
  };
}

interface SiteMeta {
  id: string;
  name: string;
  color: string;
}

interface DailyApiResponse {
  data?: DailyData;
  sites?: SiteMeta[];
  error?: string;
}

function DailyTrafficSkeleton() {
  return (
    <Surface className="space-y-4" aria-label="Loading daily traffic data">
      <div className="flex flex-wrap items-center gap-3">
        <div className="mr-auto space-y-2">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-3 w-56" />
        </div>
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-8 w-24" />
      </div>
      <Skeleton className="h-80 w-full" />
      <SkeletonChipRow className="flex-wrap gap-2" count={4} itemClassName="h-5 w-24 rounded-full" />
    </Surface>
  );
}

function DailyTrafficError({ message }: { message: string }) {
  return (
    <Notice tone="danger" size="panel" role="alert">
      <NoticeCenteredContent height="md">
        <h2 className="text-xs uppercase tracking-wider text-red-300 font-semibold">Daily Traffic Unavailable</h2>
        <p className="mt-2 max-w-md text-sm text-neutral-400">{message}</p>
      </NoticeCenteredContent>
    </Notice>
  );
}

export default function DailyTrafficChart({ days }: { days: number }) {
  const [data, setData] = useState<DailyData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sitesMap, setSitesMap] = useState<Map<string, SiteMeta>>(new Map());
  const [activeMetrics, setActiveMetrics] = useState<Set<Metric>>(new Set(['views', 'clicks']));
  const [chartType, setChartType] = useState<ChartType>('area');
  const [viewMode, setViewMode] = useState<ViewMode>('persite');
  const [hiddenSites, setHiddenSites] = useState<Set<string>>(new Set());

  const toggleSite = (siteId: string) => {
    setHiddenSites(prev => {
      const next = new Set(prev);
      if (next.has(siteId)) next.delete(siteId);
      else next.add(siteId);
      return next;
    });
  };

  useEffect(() => {
    let cancelled = false;
    setData(null);
    setLoadError(null);

    fetch(`/api/daily?days=${days}`)
      .then(async r => {
        const payload = await r.json() as DailyApiResponse;
        if (!r.ok) {
          throw new Error(payload.error ?? `Daily traffic request failed with status ${r.status}`);
        }
        return payload;
      })
      .then(d => {
        if (cancelled) return;
        setData(d.data ?? {});
        const map = new Map<string, SiteMeta>();
        for (const s of d.sites ?? []) map.set(s.id, s);
        setSitesMap(map);
      })
      .catch(error => {
        if (cancelled) return;
        console.error('[DailyTrafficChart]', error);
        setLoadError('Daily traffic data could not be loaded. Refresh the dashboard to try again.');
      });

    return () => {
      cancelled = true;
    };
  }, [days]);

  if (loadError) {
    return <DailyTrafficError message={loadError} />;
  }

  if (!data) {
    return <DailyTrafficSkeleton />;
  }

  const collectedDates = Object.keys(data).sort();
  const today = todayDateOnly();
  const latestCollected = collectedDates[collectedDates.length - 1];
  const dates = collectedDates.includes(today) ? collectedDates : [...collectedDates, today];
  if (collectedDates.length < 2) {
    return (
      <Notice size="panel">
        <NoticeCenteredContent textTone="muted">
          Need 2+ days of collected data. Run the daily collector first.
        </NoticeCenteredContent>
      </Notice>
    );
  }

  const allSiteIds = [...new Set(dates.flatMap(d => Object.keys(data[d] ?? {})))].sort();
  const siteIds = allSiteIds.filter(id => !hiddenSites.has(id));
  const siteToggleOptions = allSiteIds
    .filter(id => dates.some(d => {
      const sd = data[d]?.[id];
      if (!sd) return false;
      for (const m of activeMetrics) {
        if ((sd[m] ?? 0) > 0) return true;
      }
      return false;
    }))
    .map(id => ({
      value: id,
      label: sitesMap.get(id)?.name ?? id,
    }));
  const visibleSiteIds = new Set(siteToggleOptions
    .filter(option => !hiddenSites.has(option.value))
    .map(option => option.value));

  const toggleMetric = (m: Metric) => {
    setActiveMetrics(prev => {
      const next = new Set(prev);
      if (next.has(m)) {
        if (next.size > 1) next.delete(m);
      } else {
        next.add(m);
      }
      return next;
    });
  };

  // Build chart data
  let chartData: Record<string, string | number>[];
  let seriesKeys: { key: string; color: string; label: string }[];

  if (viewMode === 'cumulative') {
    chartData = dates.map(date => {
      const entry: Record<string, string | number> = { date: formatDateShort(date) };
      for (const metric of METRICS) {
        if (!activeMetrics.has(metric)) continue;
        let total = 0;
        for (const siteId of siteIds) {
          total += data[date]?.[siteId]?.[metric] ?? 0;
        }
        entry[metric] = total;
      }
      return entry;
    });
    seriesKeys = [...activeMetrics].map(m => ({
      key: m,
      color: METRIC_COLORS[m],
      label: m.charAt(0).toUpperCase() + m.slice(1),
    }));
  } else {
    // Per-site mode: one series per site per metric
    chartData = dates.map(date => {
      const entry: Record<string, string | number> = { date: formatDateShort(date) };
      for (const metric of METRICS) {
        if (!activeMetrics.has(metric)) continue;
        for (const siteId of siteIds) {
          entry[`${siteId}_${metric}`] = data[date]?.[siteId]?.[metric] ?? 0;
        }
      }
      return entry;
    });
    seriesKeys = [];
    for (const metric of METRICS) {
      if (!activeMetrics.has(metric)) continue;
      for (const siteId of siteIds) {
        const hasData = dates.some(d => (data[d]?.[siteId]?.[metric] ?? 0) > 0);
        if (!hasData) continue;
        seriesKeys.push({
          key: `${siteId}_${metric}`,
          color: sitesMap.get(siteId)?.color ?? CHART_NEUTRALS.tick,
          label: `${sitesMap.get(siteId)?.name ?? siteId} — ${metric}`,
        });
      }
    }
  }
  const seriesLabels = new Map(seriesKeys.map((series) => [series.key, series.label]));

  return (
    <Surface>
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="mr-auto">
          <h2 className="text-xs uppercase tracking-wider text-neutral-500 font-semibold">Daily Traffic</h2>
          {latestCollected && latestCollected < today && (
            <p className="text-[10px] text-neutral-600 mt-0.5">
              Today's data still collecting · GA4 latest: {latestCollected} · SC lags ~2 days
            </p>
          )}
        </div>
        <ToggleButtonGroup
          ariaLabel="Metrics"
          options={METRIC_OPTIONS}
          activeValues={activeMetrics}
          onToggle={toggleMetric}
          renderLabel={(option, active) => (
            <>
              <span
                className="inline-block size-1.5 rounded-full mr-1.5"
                style={{ backgroundColor: active ? METRIC_COLORS[option.value] : CHART_NEUTRALS.inactive }}
              />
              {option.label}
            </>
          )}
        />
        <SegmentedControl
          ariaLabel="Chart type"
          options={[
            { value: 'area', label: 'Area' },
            { value: 'bar', label: 'Bar' },
          ]}
          value={chartType}
          onChange={setChartType}
        />
        <SegmentedControl
          ariaLabel="View mode"
          options={[
            { value: 'cumulative', label: 'Cumulative' },
            { value: 'persite', label: 'Per Site' },
          ]}
          value={viewMode}
          onChange={setViewMode}
        />
      </div>
      {chartType === 'area' ? (
        <TrendChart
          data={chartData as { date: string }[]}
          lines={seriesKeys}
          xDataKey="date"
          yAxisWidth={50}
          height={320}
        />
      ) : (
        <div className="h-80">
          <ClientChart><ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
            <BarChart data={chartData} barGap={1} barCategoryGap="15%">
              <CartesianGrid strokeDasharray="3 3" stroke={CHART_NEUTRALS.grid} />
              <XAxis dataKey="date" tick={{ fill: CHART_NEUTRALS.tick, fontSize: 10 }} axisLine={{ stroke: CHART_NEUTRALS.axis }} tickLine={false} />
              <YAxis tick={{ fill: CHART_NEUTRALS.tick, fontSize: 10 }} axisLine={false} tickLine={false} width={50} tickFormatter={v => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v)} />
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
                labelStyle={{ color: CHART_NEUTRALS.tooltipLabel, marginBottom: 4 }}
                formatter={(value, name) => {
                  const label = seriesLabels.get(String(name));
                  return [Number(value).toLocaleString(), label || String(name)];
                }}
              />
              {seriesKeys.map(s => (
                <Bar
                  key={s.key}
                  dataKey={s.key}
                  fill={s.color}
                  radius={[2, 2, 0, 0]}
                  stackId={viewMode === 'persite' ? s.key.split('_').pop() : undefined}
                />
              ))}
            </BarChart>
          </ResponsiveContainer></ClientChart>
        </div>
      )}
      {viewMode === 'persite' && (
        <ToggleButtonGroup
          ariaLabel="Visible sites"
          options={siteToggleOptions}
          activeValues={visibleSiteIds}
          onToggle={toggleSite}
          className="flex flex-wrap gap-3 mt-3"
          buttonVariant="legend"
          renderLabel={(option, active) => (
            <>
              <div
                className="size-2 rounded-full"
                style={{ backgroundColor: active ? (sitesMap.get(option.value)?.color ?? CHART_NEUTRALS.tick) : CHART_NEUTRALS.inactive }}
              />
              <span className={active ? 'text-neutral-400' : 'text-neutral-600 line-through'}>
                {option.label}
              </span>
            </>
          )}
        />
      )}
    </Surface>
  );
}
