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
import { getPerformanceSiteData, getCwvAuditSummary } from '../performance-site';
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

  it('uses desktop PSI for overall fallback when mobile has no metrics', async () => {
    vi.mocked(cachedGetRumCoreWebVitals).mockResolvedValueOnce(null);
    vi.mocked(cachedGetPagespeed).mockImplementation(async (_url, strategy) => {
      if (strategy === 'mobile') {
        return {
          url: 'https://borged.io',
          strategy,
          performanceScore: 91,
          field: null,
          lab: {},
          fetchedAt: 123,
        };
      }

      return {
        url: 'https://borged.io',
        strategy,
        performanceScore: 96,
        field: {
          INP: { value: 180, rating: 'good' },
        },
        lab: {},
        fetchedAt: 123,
      };
    });

    const result = await getPerformanceSiteData('borged-io', 7);

    expect(result).not.toBeNull();
    expect(result!.source).toBe('psi-field');
    expect(result!.heroSource).toBe('CrUX field (desktop)');
    expect(result!.overall.INP).toEqual({ value: 180, rating: 'good', sampleCount: 0 });
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

  it('keeps the detail payload usable when individual providers throw', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.mocked(cachedGetRumCoreWebVitals).mockRejectedValueOnce(new Error('rum unavailable'));
    vi.mocked(cachedGetRumCwvByPage).mockRejectedValueOnce(new Error('pages unavailable'));
    vi.mocked(cachedGetRumCwvTrend).mockRejectedValueOnce(new Error('trend unavailable'));
    vi.mocked(cachedGetCwvEventCount).mockResolvedValueOnce(8);
    vi.mocked(cachedGetPagespeed).mockImplementation(async (_url, strategy) => {
      if (strategy === 'desktop') throw new Error('desktop PSI unavailable');
      return {
        url: 'https://borged.io',
        strategy,
        performanceScore: 82,
        field: {
          LCP: { value: 2400, rating: 'good' },
        },
        lab: {},
        fetchedAt: 123,
      };
    });

    const result = await getPerformanceSiteData('borged-io', 7);

    expect(result).not.toBeNull();
    expect(result!.source).toBe('rum-pending');
    expect(result!.propagating).toBe(true);
    expect(result!.eventCount).toBe(8);
    expect(result!.overall.LCP).toEqual({ value: 2400, rating: 'good', sampleCount: 0 });
    expect(result!.slowestPages).toEqual([]);
    expect(result!.trend).toEqual([]);
    expect(result!.psi.desktop).toBeNull();
    expect(consoleError).toHaveBeenCalledWith('[PerformanceSite] RUM borged-io:', expect.any(Error));
    expect(consoleError).toHaveBeenCalledWith('[PerformanceSite] RUM pages borged-io:', expect.any(Error));
    expect(consoleError).toHaveBeenCalledWith('[PerformanceSite] RUM trend borged-io:', expect.any(Error));
    expect(consoleError).toHaveBeenCalledWith('[PerformanceSite] PSI desktop borged-io:', expect.any(Error));
    consoleError.mockRestore();
  });

  it('falls back to the configured property id when GA4 discovery fails', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.mocked(discoverPropertyIds).mockRejectedValueOnce(new Error('discovery unavailable'));
    vi.mocked(cachedGetRumCoreWebVitals).mockResolvedValueOnce({
      hasData: true,
      overall: {
        LCP: { value: 1400, rating: 'good', sampleCount: 9 },
      },
      byDevice: {
        mobile: {},
        desktop: {},
        tablet: {},
      },
    });

    const result = await getPerformanceSiteData('borged-io', 7);

    expect(result).not.toBeNull();
    expect(result!.propertyId).toBe('site-prop');
    expect(result!.source).toBe('rum');
    expect(vi.mocked(cachedGetRumCoreWebVitals)).toHaveBeenCalledWith('site-prop', 7);
    expect(consoleError).toHaveBeenCalledWith('[PerformanceSite] GA4 discovery borged-io:', expect.any(Error));
    consoleError.mockRestore();
  });
});

describe('getCwvAuditSummary', () => {
  it('returns RUM overall metrics when RUM data exists', async () => {
    vi.mocked(cachedGetRumCoreWebVitals).mockResolvedValueOnce({
      hasData: true,
      overall: {
        LCP: { value: 1500, rating: 'good', sampleCount: 20 },
        INP: { value: 210, rating: 'ni', sampleCount: 20 },
        CLS: { value: 0.05, rating: 'good', sampleCount: 20 },
      },
      byDevice: { mobile: {}, desktop: {}, tablet: {} },
    });

    const result = await getCwvAuditSummary('borged-io');

    expect(result).not.toBeNull();
    expect(result!.source).toBe('rum');
    expect(result!.metrics.LCP).toEqual({ value: 1500, rating: 'good', sampleCount: 20 });
    expect(result!.metrics.INP).toEqual({ value: 210, rating: 'ni', sampleCount: 20 });
    expect(vi.mocked(cachedGetRumCwvByPage)).not.toHaveBeenCalled();
    expect(vi.mocked(cachedGetRumCwvTrend)).not.toHaveBeenCalled();
  });

  it('falls back to PSI field data when no RUM', async () => {
    vi.mocked(cachedGetRumCoreWebVitals).mockResolvedValueOnce(null);
    vi.mocked(cachedGetPagespeed).mockImplementation(async (_url, strategy) => ({
      url: 'https://borged.io',
      strategy,
      performanceScore: null,
      field: {
        LCP: { value: 3200, rating: 'poor' },
        CLS: { value: 0.08, rating: 'good' },
      },
      lab: {},
      fetchedAt: 123,
    }));

    const result = await getCwvAuditSummary('borged-io');

    expect(result).not.toBeNull();
    expect(result!.source).toBe('psi-field');
    expect(result!.metrics.LCP).toEqual({ value: 3200, rating: 'poor', sampleCount: 0 });
    expect(result!.metrics.CLS).toEqual({ value: 0.08, rating: 'good', sampleCount: 0 });
    expect(vi.mocked(cachedGetPagespeed)).toHaveBeenCalledWith('https://borged.io', 'mobile');
    expect(vi.mocked(cachedGetPagespeed)).toHaveBeenCalledTimes(1);
  });

  it('falls back to desktop PSI in the audit summary when mobile has no metrics', async () => {
    vi.mocked(cachedGetRumCoreWebVitals).mockResolvedValueOnce(null);
    vi.mocked(cachedGetPagespeed).mockImplementation(async (_url, strategy) => {
      if (strategy === 'mobile') {
        return {
          url: 'https://borged.io',
          strategy,
          performanceScore: null,
          field: null,
          lab: {},
          fetchedAt: 123,
        };
      }

      return {
        url: 'https://borged.io',
        strategy,
        performanceScore: 89,
        field: null,
        lab: {
          LCP: 2100,
        },
        fetchedAt: 123,
      };
    });

    const result = await getCwvAuditSummary('borged-io');

    expect(result).not.toBeNull();
    expect(result!.source).toBe('psi-lab');
    expect(result!.metrics.LCP).toEqual({ value: 2100, rating: 'good', sampleCount: 0 });
    expect(vi.mocked(cachedGetPagespeed)).toHaveBeenCalledWith('https://borged.io', 'mobile');
    expect(vi.mocked(cachedGetPagespeed)).toHaveBeenCalledWith('https://borged.io', 'desktop');
  });

  it('falls back to PSI when audit RUM throws', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.mocked(cachedGetRumCoreWebVitals).mockRejectedValueOnce(new Error('audit rum unavailable'));
    vi.mocked(cachedGetPagespeed).mockImplementation(async (_url, strategy) => ({
      url: 'https://borged.io',
      strategy,
      performanceScore: null,
      field: null,
      lab: {
        LCP: 2800,
      },
      fetchedAt: 123,
    }));

    const result = await getCwvAuditSummary('borged-io');

    expect(result).not.toBeNull();
    expect(result!.source).toBe('psi-lab');
    expect(result!.metrics.LCP).toEqual({ value: 2800, rating: 'ni', sampleCount: 0 });
    expect(consoleError).toHaveBeenCalledWith('[PerformanceSite] audit RUM borged-io:', expect.any(Error));
    consoleError.mockRestore();
  });

  it('keeps the audit summary available when GA4 discovery fails', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.mocked(discoverPropertyIds).mockRejectedValueOnce(new Error('discovery unavailable'));
    vi.mocked(cachedGetRumCoreWebVitals).mockResolvedValueOnce({
      hasData: true,
      overall: {
        INP: { value: 180, rating: 'good', sampleCount: 11 },
      },
      byDevice: {
        mobile: {},
        desktop: {},
        tablet: {},
      },
    });

    const result = await getCwvAuditSummary('borged-io');

    expect(result).not.toBeNull();
    expect(result!.source).toBe('rum');
    expect(result!.metrics.INP).toEqual({ value: 180, rating: 'good', sampleCount: 11 });
    expect(vi.mocked(cachedGetRumCoreWebVitals)).toHaveBeenCalledWith('site-prop', 7);
    expect(consoleError).toHaveBeenCalledWith('[PerformanceSite] audit GA4 discovery borged-io:', expect.any(Error));
    consoleError.mockRestore();
  });

  it('returns null for unknown site', async () => {
    vi.mocked(getManagedSite).mockResolvedValueOnce(null);
    const result = await getCwvAuditSummary('nonexistent');
    expect(result).toBeNull();
  });
});
