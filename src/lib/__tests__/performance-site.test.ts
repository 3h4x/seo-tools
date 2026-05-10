import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../ga4', () => ({
  discoverPropertyIds: vi.fn(),
}));

vi.mock('../pagespeed', () => ({
  cachedGetPagespeed: vi.fn(),
}));

vi.mock('../performance', () => ({
  cachedGetCwvEventCount: vi.fn(),
  cachedGetRumCoreWebVitals: vi.fn(),
  cachedGetRumCwvByPage: vi.fn(),
  cachedGetRumCwvTrend: vi.fn(),
}));

vi.mock('../sites', () => ({
  getManagedSite: vi.fn(),
}));

import { discoverPropertyIds } from '../ga4';
import { cachedGetPagespeed } from '../pagespeed';
import {
  cachedGetCwvEventCount,
  cachedGetRumCoreWebVitals,
  cachedGetRumCwvByPage,
  cachedGetRumCwvTrend,
} from '../performance';
import { getPerformanceSiteData } from '../performance-site';
import { getManagedSite } from '../sites';

const site = {
  id: 'borged-io',
  name: 'Borged',
  domain: 'borged.io',
  ga4PropertyId: 'site-prop',
  testPages: [],
  skipChecks: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getManagedSite).mockResolvedValue(site);
  vi.mocked(discoverPropertyIds).mockResolvedValue([{ ...site, ga4PropertyId: 'discovered-prop' }]);
  vi.mocked(cachedGetRumCoreWebVitals).mockResolvedValue(null);
  vi.mocked(cachedGetRumCwvByPage).mockResolvedValue([]);
  vi.mocked(cachedGetRumCwvTrend).mockResolvedValue([]);
  vi.mocked(cachedGetCwvEventCount).mockResolvedValue(0);
  vi.mocked(cachedGetPagespeed).mockImplementation(async (_url, strategy) => ({
    url: 'https://borged.io',
    strategy,
    performanceScore: null,
    field: null,
    lab: {},
    fetchedAt: 123,
  }));
});

describe('getPerformanceSiteData', () => {
  it('normalizes invalid days and uses the discovered property id', async () => {
    const result = await getPerformanceSiteData('borged-io', Number.NaN);

    expect(result).not.toBeNull();
    expect(result!.days).toBe(7);
    expect(vi.mocked(cachedGetRumCoreWebVitals)).toHaveBeenCalledWith('discovered-prop', 7);
    expect(vi.mocked(cachedGetRumCwvTrend)).toHaveBeenCalledWith('discovered-prop', 30);
  });

  it('prefers RUM metrics over PSI fallback when RUM data exists', async () => {
    vi.mocked(cachedGetRumCoreWebVitals).mockResolvedValueOnce({
      hasData: true,
      overall: {
        LCP: { value: 1200, rating: 'good', sampleCount: 10 },
      },
      byDevice: {
        mobile: { LCP: { value: 1300, rating: 'good', sampleCount: 6 } },
        desktop: { LCP: { value: 1100, rating: 'good', sampleCount: 4 } },
        tablet: {},
      },
    });
    vi.mocked(cachedGetPagespeed).mockImplementation(async (_url, strategy) => ({
      url: 'https://borged.io',
      strategy,
      performanceScore: 42,
      field: {
        LCP: { value: 4000, rating: 'poor' },
      },
      lab: {
        LCP: 3500,
      },
      fetchedAt: 123,
    }));

    const result = await getPerformanceSiteData('borged-io', 28);

    expect(result).not.toBeNull();
    expect(result!.days).toBe(28);
    expect(result!.source).toBe('rum');
    expect(result!.heroSource).toBe('RUM (GA4)');
    expect(result!.overall.LCP).toEqual({ value: 1200, rating: 'good', sampleCount: 10 });
    expect(result!.byDevice?.mobile.LCP).toEqual({ value: 1300, rating: 'good', sampleCount: 6 });
  });

  it('returns rum-pending with PSI fallback when events exist but RUM is unavailable', async () => {
    vi.mocked(cachedGetRumCoreWebVitals).mockResolvedValueOnce({ hasData: false, overall: {}, byDevice: { mobile: {}, desktop: {}, tablet: {} } });
    vi.mocked(cachedGetCwvEventCount).mockResolvedValueOnce(12);
    vi.mocked(cachedGetPagespeed).mockImplementation(async (_url, strategy) => ({
      url: 'https://borged.io',
      strategy,
      performanceScore: 88,
      field: {
        LCP: { value: 2200, rating: 'good' },
      },
      lab: {
        LCP: 2500,
      },
      fetchedAt: 123,
    }));

    const result = await getPerformanceSiteData('borged-io', 7);

    expect(result).not.toBeNull();
    expect(result!.source).toBe('rum-pending');
    expect(result!.heroSource).toBe('CrUX field (mobile)');
    expect(result!.propagating).toBe(true);
    expect(result!.eventCount).toBe(12);
    expect(result!.overall.LCP).toEqual({ value: 2200, rating: 'good', sampleCount: 0 });
    expect(result!.byDevice).toBeNull();
  });

  it('normalizes trend dates to yyyy-mm-dd', async () => {
    vi.mocked(cachedGetRumCwvTrend).mockResolvedValueOnce([
      { date: '20260508', metrics: { LCP: { value: 1200, rating: 'good', sampleCount: 2 } } },
      { date: '2026-05-09', metrics: { INP: { value: 180, rating: 'good', sampleCount: 3 } } },
    ]);

    const result = await getPerformanceSiteData('borged-io', 7);

    expect(result).not.toBeNull();
    expect(result!.trend).toEqual([
      { date: '2026-05-08', metrics: { LCP: { value: 1200, rating: 'good', sampleCount: 2 } } },
      { date: '2026-05-09', metrics: { INP: { value: 180, rating: 'good', sampleCount: 3 } } },
    ]);
  });
});
