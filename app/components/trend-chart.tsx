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
import { CHART_NEUTRALS } from '@/lib/constants';
import { Notice, NoticeCenteredContent } from '@/components/ui';

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
  valueFormat?: 'default' | 'integer' | 'fixed1';
  formatDate?: (date: string) => string;
  xDataKey?: string;
  yAxisWidth?: number;
  yAxisReversed?: boolean;
}

function formatTrendValue(value: number, valueFormat: NonNullable<TrendChartProps['valueFormat']>): string {
  switch (valueFormat) {
    case 'integer':
      return value.toLocaleString(undefined, { maximumFractionDigits: 0 });
    case 'fixed1':
      return value.toFixed(1);
    default:
      return value.toLocaleString();
  }
}

export default function TrendChart({
  data,
  lines,
  height = 200,
  valueFormat = 'default',
  formatDate = formatDateShort,
  xDataKey,
  yAxisWidth = 40,
  yAxisReversed = false,
}: TrendChartProps) {
  if (data.length < 2) {
    return (
      <Notice
        size="none"
        className="rounded border-neutral-800 bg-transparent text-xs text-neutral-600"
        style={{ height }}
      >
        <NoticeCenteredContent height="full">
          Need 2+ snapshots for charts
        </NoticeCenteredContent>
      </Notice>
    );
  }

  const xKey = xDataKey ?? '_label';
  const chartData = xKey === '_label'
    ? data.map((d) => ({ ...d, _label: formatDate(d.date as string) }))
    : data;
  const lineLabels = new Map(lines.map((line) => [line.key, line.label]));

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
        <CartesianGrid strokeDasharray="3 3" stroke={CHART_NEUTRALS.grid} />
        <XAxis
          dataKey={xKey}
          tick={{ fill: CHART_NEUTRALS.tick, fontSize: 10 }}
          axisLine={{ stroke: CHART_NEUTRALS.axis }}
          tickLine={false}
        />
        <YAxis
          tick={{ fill: CHART_NEUTRALS.tick, fontSize: 10 }}
          axisLine={false}
          tickLine={false}
          width={yAxisWidth}
          reversed={yAxisReversed}
          tickFormatter={(v) => {
            if (v >= 1000) return `${(v / 1000).toFixed(1)}k`;
            return String(v);
          }}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: CHART_NEUTRALS.tooltipBg,
            border: `1px solid ${CHART_NEUTRALS.axis}`,
            borderRadius: '8px',
            fontSize: '12px',
          }}
          labelStyle={{ color: CHART_NEUTRALS.tooltipLabel, marginBottom: 4 }}
          itemStyle={{ padding: 0 }}
          formatter={(value, name) => {
            const label = lineLabels.get(String(name));
            return [formatTrendValue(Number(value), valueFormat), label || String(name)];
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
            activeDot={{ r: 3, fill: line.color, stroke: CHART_NEUTRALS.dotStroke, strokeWidth: 2 }}
          />
        ))}
      </AreaChart>
    </ResponsiveContainer></ClientChart>
  );
}
