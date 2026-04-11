'use client';

import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
} from 'recharts';
import ClientChart from './client-chart';

const COLORS = ['#10b981', '#3b82f6', '#8b5cf6', '#f59e0b', '#06b6d4', '#f43f5e'];
const TOOLTIP_STYLE = { backgroundColor: '#171717', border: '1px solid #262626', borderRadius: '8px', fontSize: '12px' };
const ITEM_STYLE = { color: '#d4d4d4' };

interface SiteTraffic {
  name: string;
  users: number;
  prevUsers: number;
  sessions: number;
  prevSessions: number;
  views: number;
  prevViews: number;
  bounceRate: number;
  avgDuration: number;
  clicks: number;
  prevClicks: number;
  impressions: number;
  prevImpressions: number;
  position: number;
}

export function UsersComparisonChart({ data }: { data: SiteTraffic[] }) {
  return (
    <div className="bg-neutral-900 rounded-lg border border-neutral-800 p-5">
      <h2 className="text-xs uppercase tracking-wider text-neutral-500 mb-4 font-semibold">Users: Current vs Previous</h2>
      <div className="h-64">
        <ClientChart><ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
          <BarChart data={data} barGap={2} barCategoryGap="20%">
            <CartesianGrid strokeDasharray="3 3" stroke="#262626" />
            <XAxis dataKey="name" tick={{ fill: '#737373', fontSize: 11 }} axisLine={{ stroke: '#262626' }} tickLine={false} />
            <YAxis tick={{ fill: '#737373', fontSize: 11 }} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={TOOLTIP_STYLE} itemStyle={ITEM_STYLE} />
            <Bar dataKey="prevUsers" name="Previous" fill="#404040" radius={[4, 4, 0, 0]} />
            <Bar dataKey="users" name="Current" fill="#10b981" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer></ClientChart>
      </div>
    </div>
  );
}

export function UserDistributionChart({ data }: { data: SiteTraffic[] }) {
  const filtered = data.filter(d => d.users > 0);
  const total = filtered.reduce((s, d) => s + d.users, 0);

  return (
    <div className="bg-neutral-900 rounded-lg border border-neutral-800 p-5">
      <h2 className="text-xs uppercase tracking-wider text-neutral-500 mb-4 font-semibold">User Distribution</h2>
      <div className="flex items-center gap-6">
        <div className="w-52 h-52 shrink-0">
          <ClientChart><ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
            <PieChart>
              <Pie
                data={filtered}
                dataKey="users"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius={50}
                outerRadius={85}
                strokeWidth={0}
              >
                {filtered.map((_, idx) => (
                  <Cell key={idx} fill={COLORS[idx % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
                itemStyle={ITEM_STYLE}
                formatter={(value) => [`${Number(value).toLocaleString()} users (${total > 0 ? ((Number(value) / total) * 100).toFixed(0) : 0}%)`, '']}
              />
            </PieChart>
          </ResponsiveContainer></ClientChart>
        </div>
        <div className="flex-1 space-y-2">
          {filtered.map((d, i) => (
            <div key={d.name} className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <div className="size-2 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                <span className="text-neutral-400">{d.name}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-neutral-300 font-mono">{d.users.toLocaleString()}</span>
                <span className="text-neutral-600 font-mono w-10 text-right">{total > 0 ? ((d.users / total) * 100).toFixed(0) : 0}%</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function BounceRateChart({ data }: { data: SiteTraffic[] }) {
  const filtered = data.filter(d => d.users > 0);
  return (
    <div className="bg-neutral-900 rounded-lg border border-neutral-800 p-5">
      <h2 className="text-xs uppercase tracking-wider text-neutral-500 mb-4 font-semibold">Bounce Rate by Site</h2>
      <div className="h-64">
        <ClientChart><ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
          <BarChart data={filtered} barCategoryGap="20%">
            <CartesianGrid strokeDasharray="3 3" stroke="#262626" />
            <XAxis dataKey="name" tick={{ fill: '#737373', fontSize: 11 }} axisLine={{ stroke: '#262626' }} tickLine={false} />
            <YAxis tick={{ fill: '#737373', fontSize: 11 }} axisLine={false} tickLine={false} domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
            <Tooltip contentStyle={TOOLTIP_STYLE} itemStyle={ITEM_STYLE} formatter={(v) => [`${v}%`, 'Bounce Rate']} />
            <Bar dataKey="bounceRate" name="Bounce Rate" radius={[4, 4, 0, 0]}>
              {filtered.map((entry, idx) => (
                <Cell key={idx} fill={entry.bounceRate > 70 ? '#ef4444' : entry.bounceRate > 50 ? '#f59e0b' : '#10b981'} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer></ClientChart>
      </div>
      <p className="text-neutral-600 text-xs mt-2">Green &lt;50% · Yellow 50-70% · Red &gt;70%</p>
    </div>
  );
}

export function SearchConsoleChart({ data }: { data: SiteTraffic[] }) {
  return (
    <div className="bg-neutral-900 rounded-lg border border-neutral-800 p-5">
      <h2 className="text-xs uppercase tracking-wider text-neutral-500 mb-4 font-semibold">Search Console: Clicks vs Impressions</h2>
      <div className="h-64">
        <ClientChart><ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
          <BarChart data={data} barGap={2} barCategoryGap="20%">
            <CartesianGrid strokeDasharray="3 3" stroke="#262626" />
            <XAxis dataKey="name" tick={{ fill: '#737373', fontSize: 11 }} axisLine={{ stroke: '#262626' }} tickLine={false} />
            <YAxis tick={{ fill: '#737373', fontSize: 11 }} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={TOOLTIP_STYLE} itemStyle={ITEM_STYLE} />
            <Bar dataKey="clicks" name="Clicks" fill="#10b981" radius={[4, 4, 0, 0]} />
            <Bar dataKey="impressions" name="Impressions" fill="#06b6d4" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer></ClientChart>
      </div>
    </div>
  );
}

export function PositionChart({ data }: { data: SiteTraffic[] }) {
  const filtered = data.filter(d => d.position > 0);
  return (
    <div className="bg-neutral-900 rounded-lg border border-neutral-800 p-5">
      <h2 className="text-xs uppercase tracking-wider text-neutral-500 mb-4 font-semibold">Avg Search Position</h2>
      <div className="h-64">
        <ClientChart><ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
          <BarChart data={filtered} barCategoryGap="20%">
            <CartesianGrid strokeDasharray="3 3" stroke="#262626" />
            <XAxis dataKey="name" tick={{ fill: '#737373', fontSize: 11 }} axisLine={{ stroke: '#262626' }} tickLine={false} />
            <YAxis tick={{ fill: '#737373', fontSize: 11 }} axisLine={false} tickLine={false} reversed domain={[0, 'auto']} />
            <Tooltip contentStyle={TOOLTIP_STYLE} itemStyle={ITEM_STYLE} formatter={(v) => [Number(v).toFixed(1), 'Avg Position']} />
            <Bar dataKey="position" name="Avg Position" radius={[4, 4, 0, 0]}>
              {filtered.map((entry, idx) => (
                <Cell key={idx} fill={entry.position <= 10 ? '#10b981' : entry.position <= 30 ? '#f59e0b' : '#ef4444'} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer></ClientChart>
      </div>
      <p className="text-neutral-600 text-xs mt-2">Lower is better. Green: page 1 · Yellow: page 2-3 · Red: page 4+</p>
    </div>
  );
}

export function GrowthRadarChart({ data }: { data: SiteTraffic[] }) {
  const filtered = data.filter(d => d.users > 0);
  const radarData = filtered.map(d => {
    const userGrowth = d.prevUsers > 0 ? Math.min(200, Math.max(0, ((d.users - d.prevUsers) / d.prevUsers) * 100 + 100)) : 100;
    const sessionGrowth = d.prevSessions > 0 ? Math.min(200, Math.max(0, ((d.sessions - d.prevSessions) / d.prevSessions) * 100 + 100)) : 100;
    const viewGrowth = d.prevViews > 0 ? Math.min(200, Math.max(0, ((d.views - d.prevViews) / d.prevViews) * 100 + 100)) : 100;
    const clickGrowth = d.prevClicks > 0 ? Math.min(200, Math.max(0, ((d.clicks - d.prevClicks) / d.prevClicks) * 100 + 100)) : 100;
    const engagement = Math.min(200, Math.max(0, (1 - d.bounceRate / 100) * 200));
    return { name: d.name, userGrowth, sessionGrowth, viewGrowth, clickGrowth, engagement };
  });

  // Transpose for radar: each metric is a spoke, each site is a series
  const metrics = ['Users', 'Sessions', 'Views', 'SC Clicks', 'Engagement'];
  const keys = ['userGrowth', 'sessionGrowth', 'viewGrowth', 'clickGrowth', 'engagement'] as const;
  const spokes = metrics.map((metric, i) => {
    const entry: Record<string, string | number> = { metric };
    radarData.forEach(d => { entry[d.name] = d[keys[i]]; });
    return entry;
  });

  return (
    <div className="bg-neutral-900 rounded-lg border border-neutral-800 p-5">
      <h2 className="text-xs uppercase tracking-wider text-neutral-500 mb-4 font-semibold">Growth Radar (100 = no change)</h2>
      <div className="h-72">
        <ClientChart><ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
          <RadarChart data={spokes}>
            <PolarGrid stroke="#262626" />
            <PolarAngleAxis dataKey="metric" tick={{ fill: '#737373', fontSize: 11 }} />
            <PolarRadiusAxis tick={{ fill: '#525252', fontSize: 10 }} domain={[0, 200]} tickCount={5} />
            {radarData.map((d, i) => (
              <Radar key={d.name} name={d.name} dataKey={d.name} stroke={COLORS[i % COLORS.length]} fill={COLORS[i % COLORS.length]} fillOpacity={0.1} />
            ))}
            <Tooltip contentStyle={TOOLTIP_STYLE} itemStyle={ITEM_STYLE} />
          </RadarChart>
        </ResponsiveContainer></ClientChart>
      </div>
      <div className="flex flex-wrap gap-4 mt-2">
        {radarData.map((d, i) => (
          <div key={d.name} className="flex items-center gap-2 text-xs">
            <div className="size-2 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
            <span className="text-neutral-400">{d.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

