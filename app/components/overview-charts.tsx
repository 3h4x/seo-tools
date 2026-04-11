'use client';

import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from 'recharts';
import ClientChart from './client-chart';

const COLORS = ['#10b981', '#3b82f6', '#8b5cf6', '#f59e0b', '#06b6d4', '#f43f5e', '#64748b', '#a855f7'];

interface SourceData {
  name: string;
  sessions: number;
}

interface SiteMetric {
  name: string;
  bounceRate: number;
  avgDuration: number;
  users: number;
}

export function TrafficSourcesChart({ data }: { data: SourceData[] }) {
  const total = data.reduce((s, d) => s + d.sessions, 0);

  return (
    <div className="bg-neutral-900 rounded-lg border border-neutral-800 p-5">
      <h2 className="text-xs uppercase tracking-wider text-neutral-500 mb-4 font-semibold">Traffic Sources</h2>
      <div className="flex items-center gap-6">
        <div className="w-48 h-48 shrink-0">
          <ClientChart><ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
            <PieChart>
              <Pie
                data={data}
                dataKey="sessions"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius={45}
                outerRadius={75}
                strokeWidth={0}
              >
                {data.map((_, idx) => (
                  <Cell key={idx} fill={COLORS[idx % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{ backgroundColor: '#171717', border: '1px solid #262626', borderRadius: '8px', fontSize: '12px' }}
                itemStyle={{ color: '#d4d4d4' }}
                formatter={(value) => [`${value} sessions (${total > 0 ? ((Number(value) / total) * 100).toFixed(0) : 0}%)`, '']}
              />
            </PieChart>
          </ResponsiveContainer></ClientChart>
        </div>
        <div className="flex-1 space-y-2">
          {data.map((d, i) => (
            <div key={d.name} className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <div className="size-2 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                <span className="text-neutral-400">{d.name}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-neutral-300 font-mono">{d.sessions}</span>
                <span className="text-neutral-600 font-mono w-10 text-right">{total > 0 ? ((d.sessions / total) * 100).toFixed(0) : 0}%</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function SiteMetricsChart({ data }: { data: SiteMetric[] }) {
  return (
    <div className="bg-neutral-900 rounded-lg border border-neutral-800 p-5">
      <h2 className="text-xs uppercase tracking-wider text-neutral-500 mb-4 font-semibold">Site Quality Comparison</h2>
      <div className="h-56">
        <ClientChart><ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
          <BarChart data={data} barGap={4} barCategoryGap="20%">
            <CartesianGrid strokeDasharray="3 3" stroke="#262626" />
            <XAxis
              dataKey="name"
              tick={{ fill: '#737373', fontSize: 11 }}
              axisLine={{ stroke: '#262626' }}
              tickLine={false}
            />
            <YAxis
              tick={{ fill: '#737373', fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              domain={[0, 100]}
              tickFormatter={(v) => `${v}%`}
            />
            <Tooltip
              contentStyle={{ backgroundColor: '#171717', border: '1px solid #262626', borderRadius: '8px', fontSize: '12px' }}
              itemStyle={{ color: '#d4d4d4' }}
              formatter={(value, name) => {
                if (name === 'bounceRate') return [`${value}%`, 'Bounce Rate'];
                return [`${value}`, String(name)];
              }}
            />
            <Bar dataKey="bounceRate" name="Bounce Rate" fill="#f59e0b" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer></ClientChart>
      </div>
      <p className="text-neutral-600 text-xs mt-2">Lower bounce rate = better engagement. Target: under 60%.</p>
    </div>
  );
}
