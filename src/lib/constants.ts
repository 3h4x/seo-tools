export const VALID_DAYS = [1, 7, 30, 90, 180, 365];

export const CHART_COLORS = ['#10b981', '#3b82f6', '#8b5cf6', '#f59e0b', '#06b6d4', '#f43f5e', '#64748b', '#a855f7'];

export const METRIC_COLORS: Record<string, string> = {
  users: '#3b82f6',
  sessions: '#8b5cf6',
  views: '#f59e0b',
  clicks: '#10b981',
  impressions: '#06b6d4',
  position: '#f59e0b',
};

export const TREND_COLORS = {
  ttfb: '#f97316',
  coverage: '#38bdf8',
} as const;

// Shared neutral palette for recharts elements. Hex values match Tailwind neutral-* tokens
// so chart styling stays in sync with the rest of the dark dashboard.
export const CHART_NEUTRALS = {
  grid: '#262626',         // neutral-800
  axis: '#404040',         // neutral-700
  tick: '#737373',         // neutral-500
  tooltipBg: '#171717',    // neutral-900
  tooltipLabel: '#a3a3a3', // neutral-400
  tooltipItem: '#d4d4d4',  // neutral-300
  dotStroke: '#0a0a0a',    // neutral-950
  inactive: '#525252',     // neutral-600
} as const;

export const STATUS_COLORS = {
  pass: { chart: '#10b981', text: 'text-emerald-400', dot: 'bg-emerald-500' },
  warn: { chart: '#f59e0b', text: 'text-amber-400', dot: 'bg-amber-500' },
  fail: { chart: '#ef4444', text: 'text-red-400', dot: 'bg-red-500' },
  error: { chart: '#737373', text: 'text-neutral-400', dot: 'bg-neutral-500' },
} as const;

export type CwvMetricName = 'LCP' | 'INP' | 'CLS' | 'FCP' | 'TTFB';
export type CwvRating = 'good' | 'ni' | 'poor';

// Standard web-vitals thresholds. `good` is the upper bound for the good range,
// `poor` is the lower bound for the poor range. Values between are "needs improvement".
export const CWV_THRESHOLDS: Record<CwvMetricName, { good: number; poor: number; unit: 'ms' | 'score' }> = {
  LCP:  { good: 2500, poor: 4000, unit: 'ms' },
  INP:  { good: 200,  poor: 500,  unit: 'ms' },
  CLS:  { good: 0.1,  poor: 0.25, unit: 'score' },
  FCP:  { good: 1800, poor: 3000, unit: 'ms' },
  TTFB: { good: 800,  poor: 1800, unit: 'ms' },
};

export const CWV_METRIC_ORDER: CwvMetricName[] = ['LCP', 'INP', 'CLS', 'FCP', 'TTFB'];

export const CWV_TREND_COLORS: Record<Extract<CwvMetricName, 'LCP' | 'INP' | 'CLS'>, string> = {
  LCP: METRIC_COLORS.users,
  INP: METRIC_COLORS.sessions,
  CLS: METRIC_COLORS.views,
};

export const PERF_VALID_DAYS = [7, 28] as const;

export const CWV_RATING_COLORS: Record<CwvRating, { text: string; bg: string; border: string; label: string }> = {
  good: { text: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500', label: 'Good' },
  ni:   { text: 'text-amber-400',   bg: 'bg-amber-500/10',   border: 'border-amber-500',   label: 'Needs improvement' },
  poor: { text: 'text-red-400',     bg: 'bg-red-500/10',     border: 'border-red-500',     label: 'Poor' },
};

export function rateCwv(name: CwvMetricName, value: number): CwvRating {
  const t = CWV_THRESHOLDS[name];
  if (value <= t.good) return 'good';
  if (value <= t.poor) return 'ni';
  return 'poor';
}

export function ratePerformanceScore(score: number): CwvRating {
  if (score >= 90) return 'good';
  if (score >= 50) return 'ni';
  return 'poor';
}
