'use client';

import { useEffect, useState } from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  BarChart,
  Area,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import ClientChart from './client-chart';
import { formatDateShort } from '@/lib/format';

const METRIC_COLORS: Record<string, string> = {
  users: '#3b82f6',
  views: '#f59e0b',
  clicks: '#10b981',
  impressions: '#06b6d4',
};

const METRICS = ['views', 'users', 'clicks', 'impressions'] as const;
type Metric = (typeof METRICS)[number];
type ChartType = 'area' | 'bar';
type ViewMode = 'persite' | 'cumulative';

const TOOLTIP_STYLE = { backgroundColor: '#171717', border: '1px solid #404040', borderRadius: '8px', fontSize: '12px' };

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

export default function DailyTrafficChart({ days }: { days: number }) {
  const [data, setData] = useState<DailyData | null>(null);
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
    fetch(`/api/daily?days=${days}`)
      .then(r => r.json())
      .then(d => {
        setData(d.data);
        const map = new Map<string, SiteMeta>();
        for (const s of (d.sites ?? []) as SiteMeta[]) map.set(s.id, s);
        setSitesMap(map);
      })
      .catch(() => {});
  }, [days]);

  if (!data) {
    return (
      <div className="bg-neutral-900 rounded-lg border border-neutral-800 p-5">
        <div className="h-80 flex items-center justify-center text-neutral-600 text-sm">Loading daily data...</div>
      </div>
    );
  }

  const dates = Object.keys(data).sort();
  if (dates.length < 2) {
    return (
      <div className="bg-neutral-900 rounded-lg border border-neutral-800 p-5">
        <div className="h-40 flex items-center justify-center text-neutral-600 text-sm">
          Need 2+ days of collected data. Run the daily collector first.
        </div>
      </div>
    );
  }

  const allSiteIds = [...new Set(dates.flatMap(d => Object.keys(data[d])))].sort();
  const siteIds = allSiteIds.filter(id => !hiddenSites.has(id));

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
          color: sitesMap.get(siteId)?.color ?? '#737373',
          label: `${sitesMap.get(siteId)?.name ?? siteId} — ${metric}`,
        });
      }
    }
  }

  const ChartComponent = chartType === 'area' ? AreaChart : BarChart;

  return (
    <div className="bg-neutral-900 rounded-lg border border-neutral-800 p-5">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <h2 className="text-xs uppercase tracking-wider text-neutral-500 font-semibold mr-auto">Daily Traffic</h2>

        {/* Metric toggles */}
        <div className="flex gap-1 bg-neutral-800 rounded-md p-0.5">
          {METRICS.map(m => (
            <button
              key={m}
              onClick={() => toggleMetric(m)}
              className={`px-2.5 py-1 text-xs rounded transition-colors ${
                activeMetrics.has(m)
                  ? 'bg-neutral-700 text-white'
                  : 'text-neutral-500 hover:text-neutral-300'
              }`}
            >
              <span className="inline-block size-1.5 rounded-full mr-1.5" style={{ backgroundColor: activeMetrics.has(m) ? METRIC_COLORS[m] : '#525252' }} />
              {m.charAt(0).toUpperCase() + m.slice(1)}
            </button>
          ))}
        </div>

        {/* Chart type */}
        <div className="flex gap-1 bg-neutral-800 rounded-md p-0.5">
          {(['area', 'bar'] as const).map(t => (
            <button
              key={t}
              onClick={() => setChartType(t)}
              className={`px-2.5 py-1 text-xs rounded transition-colors ${
                chartType === t ? 'bg-neutral-700 text-white' : 'text-neutral-500 hover:text-neutral-300'
              }`}
            >
              {t === 'area' ? 'Area' : 'Bar'}
            </button>
          ))}
        </div>

        {/* View mode */}
        <div className="flex gap-1 bg-neutral-800 rounded-md p-0.5">
          {([['cumulative', 'Cumulative'], ['persite', 'Per Site']] as const).map(([v, label]) => (
            <button
              key={v}
              onClick={() => setViewMode(v)}
              className={`px-2.5 py-1 text-xs rounded transition-colors ${
                viewMode === v ? 'bg-neutral-700 text-white' : 'text-neutral-500 hover:text-neutral-300'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Chart */}
      <div className="h-80">
        <ClientChart><ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
          {chartType === 'area' ? (
            <AreaChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
              <defs>
                {seriesKeys.map(s => (
                  <linearGradient key={s.key} id={`grad-daily-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={s.color} stopOpacity={0.3} />
                    <stop offset="100%" stopColor={s.color} stopOpacity={0} />
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#262626" />
              <XAxis dataKey="date" tick={{ fill: '#737373', fontSize: 10 }} axisLine={{ stroke: '#404040' }} tickLine={false} />
              <YAxis tick={{ fill: '#737373', fontSize: 10 }} axisLine={false} tickLine={false} width={50} tickFormatter={v => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v)} />
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
                labelStyle={{ color: '#a3a3a3', marginBottom: 4 }}
                formatter={(value, name) => {
                  const s = seriesKeys.find(k => k.key === name);
                  return [Number(value).toLocaleString(), s?.label || String(name)];
                }}
              />
              {seriesKeys.map(s => (
                <Area
                  key={s.key}
                  type="monotone"
                  dataKey={s.key}
                  stroke={s.color}
                  strokeWidth={2}
                  fill={`url(#grad-daily-${s.key})`}
                  dot={false}
                  activeDot={{ r: 3, fill: s.color, stroke: '#0a0a0a', strokeWidth: 2 }}
                />
              ))}
            </AreaChart>
          ) : (
            <BarChart data={chartData} barGap={1} barCategoryGap="15%">
              <CartesianGrid strokeDasharray="3 3" stroke="#262626" />
              <XAxis dataKey="date" tick={{ fill: '#737373', fontSize: 10 }} axisLine={{ stroke: '#404040' }} tickLine={false} />
              <YAxis tick={{ fill: '#737373', fontSize: 10 }} axisLine={false} tickLine={false} width={50} tickFormatter={v => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v)} />
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
                labelStyle={{ color: '#a3a3a3', marginBottom: 4 }}
                formatter={(value, name) => {
                  const s = seriesKeys.find(k => k.key === name);
                  return [Number(value).toLocaleString(), s?.label || String(name)];
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
          )}
        </ResponsiveContainer></ClientChart>
      </div>

      {/* Clickable site legend */}
      {viewMode === 'persite' && (
        <div className="flex flex-wrap gap-3 mt-3">
          {allSiteIds.filter(id => dates.some(d => {
            const sd = data[d]?.[id];
            return sd && [...activeMetrics].some(m => (sd[m] ?? 0) > 0);
          })).map(id => {
            const hidden = hiddenSites.has(id);
            return (
              <button
                key={id}
                onClick={() => toggleSite(id)}
                className={`flex items-center gap-2 text-xs px-2 py-1 rounded transition-colors ${
                  hidden ? 'opacity-40 hover:opacity-60' : 'hover:bg-neutral-800'
                }`}
              >
                <div
                  className="size-2 rounded-full"
                  style={{ backgroundColor: hidden ? '#525252' : (sitesMap.get(id)?.color ?? '#737373') }}
                />
                <span className={hidden ? 'text-neutral-600 line-through' : 'text-neutral-400'}>
                  {sitesMap.get(id)?.name ?? id}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
