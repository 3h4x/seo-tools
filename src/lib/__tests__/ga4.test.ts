import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockListAccountSummaries = vi.fn();
const mockRunReport = vi.fn();

vi.mock('../google-auth', () => ({ getAuth: () => ({}) }));
vi.mock('@google-analytics/admin', () => ({
  AnalyticsAdminServiceClient: class {
    listAccountSummaries = mockListAccountSummaries;
  },
}));
vi.mock('@google-analytics/data', () => ({
  BetaAnalyticsDataClient: class {
    runReport = mockRunReport;
  },
}));
vi.mock('../db', () => ({
  withCache: vi.fn((_key: string, _id: string, fn: () => unknown) => fn()),
}));
vi.mock('../sites', () => ({
  getManagedSites: vi.fn(),
}));

import { discoverPropertyIds, cachedGetAnalytics } from '../ga4';
import { getManagedSites } from '../sites';

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// discoverPropertyIds
// ---------------------------------------------------------------------------

describe('discoverPropertyIds', () => {
  it('matches property by domain name substring', async () => {
    vi.mocked(getManagedSites).mockResolvedValue([
      { id: 's1', name: 'Site1', domain: 'example.com', testPages: [] },
    ] as never);
    mockListAccountSummaries.mockResolvedValue([
      [{ propertySummaries: [{ displayName: 'example.com', property: 'properties/12345' }] }],
    ]);

    const result = await discoverPropertyIds();
    expect(result[0].ga4PropertyId).toBe('12345');
  });

  it('keeps existing ga4PropertyId if already set', async () => {
    vi.mocked(getManagedSites).mockResolvedValue([
      { id: 's1', name: 'Site1', domain: 'example.com', ga4PropertyId: '99999', testPages: [] },
    ] as never);
    mockListAccountSummaries.mockResolvedValue([
      [{ propertySummaries: [{ displayName: 'example.com', property: 'properties/12345' }] }],
    ]);

    const result = await discoverPropertyIds();
    expect(result[0].ga4PropertyId).toBe('99999');
  });

  it('leaves ga4PropertyId undefined when no match found', async () => {
    vi.mocked(getManagedSites).mockResolvedValue([
      { id: 's1', name: 'Site1', domain: 'example.com', testPages: [] },
    ] as never);
    mockListAccountSummaries.mockResolvedValue([
      [{ propertySummaries: [{ displayName: 'other-site.io', property: 'properties/77777' }] }],
    ]);

    const result = await discoverPropertyIds();
    expect(result[0].ga4PropertyId).toBeUndefined();
  });

  it('returns sites unchanged when admin API throws', async () => {
    const sites = [{ id: 's1', name: 'Site1', domain: 'example.com', testPages: [] }];
    vi.mocked(getManagedSites).mockResolvedValue(sites as never);
    mockListAccountSummaries.mockRejectedValue(new Error('Auth failure'));

    const result = await discoverPropertyIds();
    expect(result).toEqual(sites);
  });

  it('handles accounts with no propertySummaries', async () => {
    vi.mocked(getManagedSites).mockResolvedValue([
      { id: 's1', name: 'Site1', domain: 'example.com', testPages: [] },
    ] as never);
    mockListAccountSummaries.mockResolvedValue([[{ propertySummaries: [] }]]);

    const result = await discoverPropertyIds();
    expect(result[0].ga4PropertyId).toBeUndefined();
  });

  it('matches when property displayName contains the domain', async () => {
    vi.mocked(getManagedSites).mockResolvedValue([
      { id: 's1', name: 'Site1', domain: 'bonker.wtf', testPages: [] },
    ] as never);
    mockListAccountSummaries.mockResolvedValue([
      [{ propertySummaries: [{ displayName: 'bonker.wtf - Main', property: 'properties/55555' }] }],
    ]);

    const result = await discoverPropertyIds();
    expect(result[0].ga4PropertyId).toBe('55555');
  });
});

// ---------------------------------------------------------------------------
// cachedGetAnalytics
// ---------------------------------------------------------------------------

function makeReportRow(values: string[]) {
  return { metricValues: values.map(v => ({ value: v })) };
}

function makePageRow(path: string, views: string, users: string) {
  return {
    dimensionValues: [{ value: path }],
    metricValues: [{ value: views }, { value: users }],
  };
}

function makeSourceRow(source: string, medium: string, sessions: string, users: string) {
  return {
    dimensionValues: [{ value: source }, { value: medium }],
    metricValues: [{ value: sessions }, { value: users }],
  };
}

describe('cachedGetAnalytics', () => {
  it('returns null for empty propertyId', async () => {
    const result = await cachedGetAnalytics('');
    expect(result).toBeNull();
    expect(mockRunReport).not.toHaveBeenCalled();
  });

  it('parses metrics, top pages, and traffic sources', async () => {
    const metricsRes = {
      rows: [
        makeReportRow(['100', '80', '300', '0.4', '120.5']),
        makeReportRow(['70', '60', '200', '0.5', '90.0']),
      ],
    };
    const topPagesRes = {
      rows: [makePageRow('/home', '150', '90'), makePageRow('/about', '50', '30')],
    };
    const trafficRes = {
      rows: [makeSourceRow('google', 'organic', '60', '50')],
    };

    mockRunReport
      .mockResolvedValueOnce([metricsRes])
      .mockResolvedValueOnce([topPagesRes])
      .mockResolvedValueOnce([trafficRes]);

    const result = await cachedGetAnalytics('12345', 7);
    expect(result).not.toBeNull();
    expect(result!.current.users).toBe(100);
    expect(result!.current.sessions).toBe(80);
    expect(result!.current.views).toBe(300);
    expect(result!.current.bounceRate).toBeCloseTo(0.4);
    expect(result!.current.avgSessionDuration).toBeCloseTo(120.5);
    expect(result!.topPages).toHaveLength(2);
    expect(result!.topPages[0]).toEqual({ path: '/home', views: 150, users: 90 });
    expect(result!.trafficSources[0]).toEqual({ source: 'google', medium: 'organic', sessions: 60, users: 50 });
  });

  it('parses previous period from second row', async () => {
    const metricsRes = {
      rows: [
        makeReportRow(['100', '80', '300', '0.4', '120']),
        makeReportRow(['70', '60', '200', '0.5', '90']),
      ],
    };
    mockRunReport
      .mockResolvedValueOnce([metricsRes])
      .mockResolvedValueOnce([{ rows: [] }])
      .mockResolvedValueOnce([{ rows: [] }]);

    const result = await cachedGetAnalytics('12345', 7);
    expect(result!.previous.users).toBe(70);
    expect(result!.previous.sessions).toBe(60);
  });

  it('returns zeros when metrics rows are empty', async () => {
    mockRunReport
      .mockResolvedValueOnce([{ rows: [] }])
      .mockResolvedValueOnce([{ rows: [] }])
      .mockResolvedValueOnce([{ rows: [] }]);

    const result = await cachedGetAnalytics('12345');
    expect(result!.current).toEqual({ users: 0, sessions: 0, views: 0, bounceRate: 0, avgSessionDuration: 0 });
    expect(result!.topPages).toEqual([]);
    expect(result!.trafficSources).toEqual([]);
  });

  it('returns null on API error', async () => {
    mockRunReport.mockRejectedValue(new Error('Quota exceeded'));

    const result = await cachedGetAnalytics('12345');
    expect(result).toBeNull();
  });

  it('uses default path for top pages when dimensionValues missing', async () => {
    mockRunReport
      .mockResolvedValueOnce([{ rows: [] }])
      .mockResolvedValueOnce([{ rows: [{ dimensionValues: [], metricValues: [{ value: '5' }, { value: '3' }] }] }])
      .mockResolvedValueOnce([{ rows: [] }]);

    const result = await cachedGetAnalytics('12345');
    expect(result!.topPages[0].path).toBe('/');
  });

  it('passes correct property format in API call', async () => {
    mockRunReport
      .mockResolvedValueOnce([{ rows: [] }])
      .mockResolvedValueOnce([{ rows: [] }])
      .mockResolvedValueOnce([{ rows: [] }]);

    await cachedGetAnalytics('99999');

    expect(mockRunReport).toHaveBeenCalledWith(
      expect.objectContaining({ property: 'properties/99999' }),
    );
  });
});
