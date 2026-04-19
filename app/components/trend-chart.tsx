'use client';

import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import ClientChart from './client-chart';
import { formatDateShort } from '@/lib/format';

interface TrendDataPoint {
  date: string;
}

interface TrendChartProps {
  data: TrendDataPoint[];
  lines: Array<{
    key: string;
    color: string;
    label: string;
  }>;
  height?: number;
  formatValue?: (value: number) => string;
  formatDate?: (date: string) => string;
  xDataKey?: string;
  yAxisWidth?: number;
}

export default function TrendChart({
  data,
  lines,
  height = 200,
  formatValue = (v) => v.toLocaleString(),
  formatDate = formatDateShort,
  xDataKey,
  yAxisWidth = 40,
}: TrendChartProps) {
  if (data.length < 2) {
    return (
      <div
        className="flex items-center justify-center text-neutral-600 text-xs border border-neutral-800 rounded"
        style={{ height }}
      >
        Need 2+ snapshots for charts
      </div>
    );
  }

  const xKey = xDataKey ?? '_label';
  const chartData = xKey === '_label'
    ? data.map((d) => ({ ...d, _label: formatDate(d.date as string) }))
    : data;

  return (
    <ClientChart height={height}><ResponsiveContainer width="100%" height={height} minWidth={0} minHeight={0}>
      <AreaChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
        <defs>
          {lines.map((line) => (
            <linearGradient key={line.key} id={`grad-${line.key}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={line.color} stopOpacity={0.3} />
              <stop offset="100%" stopColor={line.color} stopOpacity={0} />
            </linearGradient>
          ))}
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#262626" />
        <XAxis
          dataKey={xKey}
          tick={{ fill: '#737373', fontSize: 10 }}
          axisLine={{ stroke: '#404040' }}
          tickLine={false}
        />
        <YAxis
          tick={{ fill: '#737373', fontSize: 10 }}
          axisLine={false}
          tickLine={false}
          width={yAxisWidth}
          tickFormatter={(v) => {
            if (v >= 1000) return `${(v / 1000).toFixed(1)}k`;
            return String(v);
          }}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: '#171717',
            border: '1px solid #404040',
            borderRadius: '8px',
            fontSize: '12px',
          }}
          labelStyle={{ color: '#a3a3a3', marginBottom: 4 }}
          itemStyle={{ padding: 0 }}
          formatter={(value, name) => {
            const line = lines.find((l) => l.key === name);
            return [formatValue(Number(value)), line?.label || String(name)];
          }}
        />
        {lines.map((line) => (
          <Area
            key={line.key}
            type="monotone"
            dataKey={line.key}
            stroke={line.color}
            strokeWidth={2}
            fill={`url(#grad-${line.key})`}
            dot={false}
            activeDot={{ r: 3, fill: line.color, stroke: '#0a0a0a', strokeWidth: 2 }}
          />
        ))}
      </AreaChart>
    </ResponsiveContainer></ClientChart>
  );
}
