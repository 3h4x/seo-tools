import { describe, expect, it } from 'vitest';

import { CHART_COLORS, METRIC_COLORS, VALID_DAYS } from '../constants';

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
});
