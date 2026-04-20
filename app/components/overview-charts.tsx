'use client';

import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
} from 'recharts';
import ClientChart from './client-chart';
import { CHART_COLORS } from '@/lib/constants';

interface SourceData {
  name: string;
  sessions: number;
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
                  <Cell key={idx} fill={CHART_COLORS[idx % CHART_COLORS.length]} />
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
                <div className="size-2 rounded-full" style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }} />
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

