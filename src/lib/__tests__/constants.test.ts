import { describe, expect, it } from 'vitest';

import {
  ACTION_KIND_STYLES,
  ACTION_PRIORITY_STYLES,
  CHART_COLORS,
  CHART_NEUTRALS,
  CROSS_LINK_CELL_STYLES,
  CROSS_LINK_SUMMARY_STYLES,
  CWV_METRIC_ORDER,
  CWV_THRESHOLDS,
  CWV_TREND_COLORS,
  GAP_SEVERITY_STYLES,
  METRIC_COLORS,
  STATUS_COLORS,
  TREND_COLORS,
  VALID_DAYS,
  rateCwv,
  ratePerformanceScore,
} from '../constants';

describe('constants', () => {
  it('exports the supported day windows in ascending order', () => {
    expect(VALID_DAYS).toEqual([1, 7, 30, 90, 180, 365]);
  });

  it('exports a stable chart color palette', () => {
    expect(CHART_COLORS).toHaveLength(8);
    expect(new Set(CHART_COLORS).size).toBe(CHART_COLORS.length);
    expect(CHART_COLORS[0]).toBe('#10b981');
    expect(CHART_COLORS.at(-1)).toBe('#a855f7');
  });

  it('maps the supported metrics to colors', () => {
    expect(METRIC_COLORS).toEqual({
      users: '#3b82f6',
      sessions: '#8b5cf6',
      views: '#f59e0b',
      clicks: '#10b981',
      impressions: '#06b6d4',
      position: '#f59e0b',
    });
  });

  it('exports a shared neutral palette for recharts elements', () => {
    expect(CHART_NEUTRALS).toEqual({
      grid: '#262626',
      axis: '#404040',
      tick: '#737373',
      tooltipBg: '#171717',
      tooltipLabel: '#a3a3a3',
      tooltipItem: '#d4d4d4',
      dotStroke: '#0a0a0a',
      inactive: '#525252',
    });
  });

  it('exports semantic status colors for non-Tailwind chart surfaces', () => {
    expect(STATUS_COLORS).toEqual({
      pass: { chart: '#10b981', text: 'text-emerald-400', dot: 'bg-emerald-500' },
      warn: { chart: '#f59e0b', text: 'text-amber-400', dot: 'bg-amber-500' },
      fail: { chart: '#ef4444', text: 'text-red-400', dot: 'bg-red-500' },
      error: { chart: '#737373', text: 'text-neutral-400', dot: 'bg-neutral-500' },
    });
  });

  it('exports action queue badge styles', () => {
    expect(ACTION_PRIORITY_STYLES).toEqual({
      critical: 'text-red-300 bg-red-500/10 border-red-500/20',
      high: 'text-red-400 bg-red-500/10 border-red-500/20',
      medium: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
      low: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
    });
    expect(ACTION_KIND_STYLES).toEqual({
      gap: 'text-violet-300 bg-violet-500/10 border-violet-500/20',
      decay: 'text-cyan-300 bg-cyan-500/10 border-cyan-500/20',
      keyword: 'text-emerald-300 bg-emerald-500/10 border-emerald-500/20',
    });
  });

  it('exports shared gap severity styles', () => {
    expect(GAP_SEVERITY_STYLES).toEqual({
      high: {
        label: 'High',
        bg: 'bg-red-500/10',
        text: STATUS_COLORS.fail.text,
        dot: STATUS_COLORS.fail.dot,
        border: 'border-red-500/20',
        accentBorder: 'border-l-red-500',
      },
      medium: {
        label: 'Medium',
        bg: 'bg-amber-500/10',
        text: STATUS_COLORS.warn.text,
        dot: STATUS_COLORS.warn.dot,
        border: 'border-amber-500/20',
        accentBorder: 'border-l-amber-500',
      },
      low: {
        label: 'Low',
        bg: 'bg-blue-500/10',
        text: 'text-blue-400',
        dot: 'bg-blue-500',
        border: 'border-blue-500/20',
        accentBorder: 'border-l-blue-500',
      },
    });
  });

  it('exports cross-site link status styles', () => {
    expect(CROSS_LINK_SUMMARY_STYLES).toEqual({
      sources: { accent: 'border-l-blue-500', value: 'text-blue-400' },
      linked: { accent: 'border-l-emerald-500', value: STATUS_COLORS.pass.text },
      gaps: { accent: 'border-l-red-500', value: STATUS_COLORS.fail.text },
      unavailable: { accent: 'border-l-neutral-600', value: 'text-neutral-300' },
    });
    expect(CROSS_LINK_CELL_STYLES).toEqual({
      linked: `${STATUS_COLORS.pass.text} font-semibold`,
      gap: `${STATUS_COLORS.fail.text} font-semibold`,
      unavailable: 'text-neutral-500 font-semibold',
      sourceUnavailable: 'text-neutral-400 font-medium',
      fetchFailure: `${STATUS_COLORS.warn.text} text-[10px]`,
    });
  });

  it('exports semantic trend colors used by dashboard charts', () => {
    expect(TREND_COLORS).toEqual({
      ttfb: '#f97316',
      coverage: '#38bdf8',
    });
    expect(CWV_TREND_COLORS).toEqual({
      LCP: METRIC_COLORS.users,
      INP: METRIC_COLORS.sessions,
      CLS: METRIC_COLORS.views,
    });
  });
});

describe('rateCwv', () => {
  it('covers all metrics in CWV_METRIC_ORDER', () => {
    expect(CWV_METRIC_ORDER).toEqual(['LCP', 'INP', 'CLS', 'FCP', 'TTFB']);
  });

  it('rates LCP at boundary values', () => {
    const { good, poor } = CWV_THRESHOLDS.LCP;
    expect(rateCwv('LCP', good)).toBe('good');
    expect(rateCwv('LCP', good + 1)).toBe('ni');
    expect(rateCwv('LCP', poor)).toBe('ni');
    expect(rateCwv('LCP', poor + 1)).toBe('poor');
  });

  it('rates INP at boundary values', () => {
    const { good, poor } = CWV_THRESHOLDS.INP;
    expect(rateCwv('INP', good)).toBe('good');
    expect(rateCwv('INP', good + 1)).toBe('ni');
    expect(rateCwv('INP', poor)).toBe('ni');
    expect(rateCwv('INP', poor + 1)).toBe('poor');
  });

  it('rates CLS at boundary values', () => {
    const { good, poor } = CWV_THRESHOLDS.CLS;
    expect(rateCwv('CLS', good)).toBe('good');
    expect(rateCwv('CLS', good + 0.01)).toBe('ni');
    expect(rateCwv('CLS', poor)).toBe('ni');
    expect(rateCwv('CLS', poor + 0.01)).toBe('poor');
  });

  it('rates FCP at boundary values', () => {
    const { good, poor } = CWV_THRESHOLDS.FCP;
    expect(rateCwv('FCP', good)).toBe('good');
    expect(rateCwv('FCP', good + 1)).toBe('ni');
    expect(rateCwv('FCP', poor)).toBe('ni');
    expect(rateCwv('FCP', poor + 1)).toBe('poor');
  });

  it('rates TTFB at boundary values', () => {
    const { good, poor } = CWV_THRESHOLDS.TTFB;
    expect(rateCwv('TTFB', good)).toBe('good');
    expect(rateCwv('TTFB', good + 1)).toBe('ni');
    expect(rateCwv('TTFB', poor)).toBe('ni');
    expect(rateCwv('TTFB', poor + 1)).toBe('poor');
  });

  it('rates zero as good for all metrics', () => {
    for (const name of CWV_METRIC_ORDER) {
      expect(rateCwv(name, 0)).toBe('good');
    }
  });
});

describe('ratePerformanceScore', () => {
  it('rates Lighthouse/PageSpeed score boundary values', () => {
    expect(ratePerformanceScore(90)).toBe('good');
    expect(ratePerformanceScore(89)).toBe('ni');
    expect(ratePerformanceScore(50)).toBe('ni');
    expect(ratePerformanceScore(49)).toBe('poor');
  });
});
