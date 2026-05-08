import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockRunReport = vi.fn();

vi.mock('../google-auth', () => ({ getAuth: () => ({}) }));
vi.mock('@google-analytics/data', () => ({
  BetaAnalyticsDataClient: class {
    runReport = mockRunReport;
  },
}));
vi.mock('../db', () => ({
  withCache: vi.fn((_key: string, _id: string, fn: () => unknown) => fn()),
}));

import {
  cachedGetRumCoreWebVitals,
  cachedGetRumCwvByPage,
  cachedGetRumCwvTrend,
} from '../performance';

beforeEach(() => {
  vi.clearAllMocks();
});

function row(name: string, device: string, count: string, sumValue: string) {
  return {
    dimensionValues: [{ value: name }, { value: device }],
    metricValues: [{ value: count }, { value: sumValue }],
  };
}

describe('cachedGetRumCoreWebVitals', () => {
  it('returns null for empty propertyId without calling API', async () => {
    const result = await cachedGetRumCoreWebVitals('', 7);
    expect(result).toBeNull();
    expect(mockRunReport).not.toHaveBeenCalled();
  });

  it('returns hasData=false when no rows', async () => {
    mockRunReport.mockResolvedValueOnce([{ rows: [] }]);
    const result = await cachedGetRumCoreWebVitals('123', 7);
    expect(result).not.toBeNull();
    expect(result!.hasData).toBe(false);
    expect(result!.overall).toEqual({});
  });

  it('aggregates samples and rates each metric', async () => {
    mockRunReport.mockResolvedValueOnce([{
      rows: [
        // 100 samples, sum 200000ms → avg 2000ms (good)
        row('LCP', 'mobile', '100', '200000'),
        // 100 samples, sum 30000ms → avg 300ms (needs improvement)
        row('INP', 'mobile', '100', '30000'),
        // 100 samples, sum 5 → avg 0.05 (good)
        row('CLS', 'desktop', '100', '5'),
      ],
    }]);

    const result = await cachedGetRumCoreWebVitals('123', 7);
    expect(result!.hasData).toBe(true);
    expect(result!.overall.LCP).toEqual({ value: 2000, rating: 'good', sampleCount: 100 });
    expect(result!.overall.INP).toEqual({ value: 300, rating: 'ni', sampleCount: 100 });
    expect(result!.overall.CLS).toEqual({ value: 0.05, rating: 'good', sampleCount: 100 });
    expect(result!.byDevice.mobile.LCP?.sampleCount).toBe(100);
    expect(result!.byDevice.desktop.CLS?.sampleCount).toBe(100);
    expect(result!.byDevice.desktop.LCP).toBeUndefined();
  });

  it('rates poor when value exceeds poor threshold', async () => {
    mockRunReport.mockResolvedValueOnce([{
      rows: [row('LCP', 'mobile', '10', '50000')], // avg 5000ms → poor
    }]);
    const result = await cachedGetRumCoreWebVitals('123', 7);
    expect(result!.overall.LCP!.rating).toBe('poor');
  });

  it('skips unknown metric names', async () => {
    mockRunReport.mockResolvedValueOnce([{
      rows: [row('NOT_A_METRIC', 'mobile', '100', '999')],
    }]);
    const result = await cachedGetRumCoreWebVitals('123', 7);
    expect(result!.hasData).toBe(false);
  });

  it('returns null on transient API error', async () => {
    mockRunReport.mockRejectedValueOnce(new Error('UNAVAILABLE: backend down'));
    const result = await cachedGetRumCoreWebVitals('123', 7);
    expect(result).toBeNull();
  });

  it('returns hasData=false (not error) when property lacks CWV custom dimensions', async () => {
    mockRunReport.mockRejectedValueOnce(new Error('3 INVALID_ARGUMENT: customEvent:metric_name not found'));
    const result = await cachedGetRumCoreWebVitals('123', 7);
    expect(result).not.toBeNull();
    expect(result!.hasData).toBe(false);
    expect(result!.overall).toEqual({});
  });

  it('passes a dimensionFilter for eventName=core_web_vitals', async () => {
    mockRunReport.mockResolvedValueOnce([{ rows: [] }]);
    await cachedGetRumCoreWebVitals('555', 28);
    expect(mockRunReport).toHaveBeenCalledWith(
      expect.objectContaining({
        property: 'properties/555',
        dimensionFilter: expect.objectContaining({
          filter: expect.objectContaining({ fieldName: 'eventName' }),
        }),
      }),
    );
  });
});

describe('cachedGetRumCwvByPage', () => {
  it('aggregates by page and sorts by total samples desc', async () => {
    mockRunReport.mockResolvedValueOnce([{
      rows: [
        { dimensionValues: [{ value: '/a' }, { value: 'LCP' }], metricValues: [{ value: '50' }, { value: '100000' }] },
        { dimensionValues: [{ value: '/b' }, { value: 'LCP' }], metricValues: [{ value: '200' }, { value: '500000' }] },
        { dimensionValues: [{ value: '/b' }, { value: 'CLS' }], metricValues: [{ value: '50' }, { value: '5' }] },
      ],
    }]);
    const result = await cachedGetRumCwvByPage('123', 7, 10);
    expect(result).toHaveLength(2);
    expect(result![0].path).toBe('/b');
    expect(result![0].totalSamples).toBe(250);
    expect(result![0].metrics.LCP!.value).toBe(2500);
    expect(result![1].path).toBe('/a');
  });

  it('returns null for empty propertyId', async () => {
    expect(await cachedGetRumCwvByPage('', 7)).toBeNull();
  });
});

describe('cachedGetRumCwvTrend', () => {
  it('groups by date and sorts ascending', async () => {
    mockRunReport.mockResolvedValueOnce([{
      rows: [
        { dimensionValues: [{ value: '20260301' }, { value: 'LCP' }], metricValues: [{ value: '10' }, { value: '20000' }] },
        { dimensionValues: [{ value: '20260302' }, { value: 'LCP' }], metricValues: [{ value: '10' }, { value: '30000' }] },
      ],
    }]);
    const result = await cachedGetRumCwvTrend('123', 30);
    expect(result).toHaveLength(2);
    expect(result![0].date).toBe('20260301');
    expect(result![0].metrics.LCP!.value).toBe(2000);
    expect(result![1].metrics.LCP!.value).toBe(3000);
  });
});
