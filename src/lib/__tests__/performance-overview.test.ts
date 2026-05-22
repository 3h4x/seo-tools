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
}));

import { discoverPropertyIds } from '../ga4';
import { cachedGetPagespeed } from '../pagespeed';
import { cachedGetCwvEventCount, cachedGetRumCoreWebVitals } from '../performance';
import { getPerformanceOverviewRows } from '../performance-overview';

const rumSite = {
  id: 'rum-site',
  name: 'RUM Site',
  domain: 'rum.example.com',
  ga4PropertyId: 'ga4-rum',
};

const psiSite = {
  id: 'psi-site',
  name: 'PSI Site',
  domain: 'psi.example.com',
  ga4PropertyId: 'ga4-psi',
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(discoverPropertyIds).mockResolvedValue([rumSite, psiSite] as Awaited<ReturnType<typeof discoverPropertyIds>>);
  vi.mocked(cachedGetCwvEventCount).mockResolvedValue(0);
  vi.mocked(cachedGetRumCoreWebVitals).mockImplementation(async (propertyId) => {
    if (propertyId === 'ga4-rum') {
      return {
        hasData: true,
        overall: {
          LCP: { value: 1200, rating: 'good', sampleCount: 12 },
        },
        byDevice: { mobile: {}, desktop: {}, tablet: {} },
      };
    }

    return null;
  });
  vi.mocked(cachedGetPagespeed).mockImplementation(async (url) => ({
    url,
    strategy: 'mobile',
    performanceScore: 84,
    field: {
      LCP: { value: 2300, rating: 'good' },
    },
    lab: {},
    fetchedAt: 123,
  }));
});

describe('getPerformanceOverviewRows', () => {
  it('does not fetch PSI for rows that already have usable RUM data', async () => {
    const rows = await getPerformanceOverviewRows(7);

    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      id: 'rum-site',
      source: 'rum',
      perfScore: null,
      metrics: {
        LCP: { value: 1200, rating: 'good' },
      },
    });
    expect(vi.mocked(cachedGetPagespeed)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(cachedGetPagespeed)).toHaveBeenCalledWith('https://psi.example.com', 'mobile');
  });

  it('still fetches PSI fallback when RUM is unavailable', async () => {
    const rows = await getPerformanceOverviewRows(28);

    expect(rows[1]).toMatchObject({
      id: 'psi-site',
      source: 'psi-field',
      perfScore: 84,
      metrics: {
        LCP: { value: 2300, rating: 'good' },
      },
    });
    expect(vi.mocked(cachedGetRumCoreWebVitals)).toHaveBeenCalledWith('ga4-rum', 28);
    expect(vi.mocked(cachedGetRumCoreWebVitals)).toHaveBeenCalledWith('ga4-psi', 28);
  });

  it('does not label empty PSI payloads as lab data', async () => {
    vi.mocked(cachedGetRumCoreWebVitals).mockResolvedValue(null);
    vi.mocked(cachedGetPagespeed).mockResolvedValue({
      url: 'https://psi.example.com',
      strategy: 'mobile',
      performanceScore: 91,
      field: {},
      lab: {},
      fetchedAt: 123,
    });

    const rows = await getPerformanceOverviewRows(7);

    expect(rows[0]).toMatchObject({
      source: 'none',
      metrics: {},
      perfScore: 91,
    });
    expect(rows[1]).toMatchObject({
      source: 'none',
      metrics: {},
      perfScore: 91,
    });
  });

  it('returns neutral rows when individual providers throw', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.mocked(cachedGetRumCoreWebVitals).mockImplementation(async (propertyId) => {
      if (propertyId === 'ga4-rum') throw new Error('rum unavailable');
      return null;
    });
    vi.mocked(cachedGetCwvEventCount).mockImplementation(async (propertyId) => {
      if (propertyId === 'ga4-psi') throw new Error('event count unavailable');
      return 4;
    });
    vi.mocked(cachedGetPagespeed).mockImplementation(async (url) => {
      if (url === 'https://psi.example.com') throw new Error('psi unavailable');
      return {
        url,
        strategy: 'mobile',
        performanceScore: 78,
        field: {
          LCP: { value: 2500, rating: 'ni' },
        },
        lab: {},
        fetchedAt: 123,
      };
    });

    const rows = await getPerformanceOverviewRows(7);

    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      id: 'rum-site',
      source: 'rum-pending',
      cwvEventCount: 4,
      perfScore: 78,
    });
    expect(rows[1]).toMatchObject({
      id: 'psi-site',
      source: 'none',
      metrics: {},
      perfScore: null,
      cwvEventCount: 0,
    });
    expect(consoleError).toHaveBeenCalledWith('[PerformanceOverview] RUM rum-site:', expect.any(Error));
    expect(consoleError).toHaveBeenCalledWith('[PerformanceOverview] CWV event count psi-site:', expect.any(Error));
    expect(consoleError).toHaveBeenCalledWith('[PerformanceOverview] PSI psi-site:', expect.any(Error));
    consoleError.mockRestore();
  });

  it('returns no rows when site discovery throws', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.mocked(discoverPropertyIds).mockRejectedValueOnce(new Error('db unavailable'));

    const rows = await getPerformanceOverviewRows(7);

    expect(rows).toEqual([]);
    expect(consoleError).toHaveBeenCalledWith(
      '[PerformanceOverview discoverPropertyIds]',
      expect.any(Error),
    );
    consoleError.mockRestore();
  });
});
