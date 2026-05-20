import { createElement } from './react';
import type { ReactNode } from './react';

function ChartShim({ children }: { children?: ReactNode }) {
  return createElement('div', {}, children);
}

export const Area = ChartShim;
export const AreaChart = ChartShim;
export const Bar = ChartShim;
export const BarChart = ChartShim;
export const CartesianGrid = ChartShim;
export const Legend = ChartShim;
export const Line = ChartShim;
export const LineChart = ChartShim;
export const ResponsiveContainer = ChartShim;
export const Tooltip = ChartShim;
export const XAxis = ChartShim;
export const YAxis = ChartShim;
