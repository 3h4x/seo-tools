import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockListAccountSummaries = vi.fn();
const mockRunReport = vi.fn();
const mockListCustomDimensions = vi.fn();
const mockCreateCustomDimension = vi.fn();
const mockListCustomMetrics = vi.fn();
const mockCreateCustomMetric = vi.fn();

const mockHasGoogleCredentials = vi.fn(() => true);
vi.mock('../google-auth', () => ({ getAuth: () => ({}), hasGoogleCredentials: () => mockHasGoogleCredentials() }));
vi.mock('@google-analytics/admin', () => ({
  AnalyticsAdminServiceClient: class {
    listAccountSummaries = mockListAccountSummaries;
    listCustomDimensions = mockListCustomDimensions;
    createCustomDimension = mockCreateCustomDimension;
    listCustomMetrics = mockListCustomMetrics;
    createCustomMetric = mockCreateCustomMetric;
  },
}));
vi.mock('@google-analytics/data', () => ({
  BetaAnalyticsDataClient: class {
    runReport = mockRunReport;
  },
}));
vi.mock('../db', () => ({
  clearCacheEntry: vi.fn(),
  withCache: vi.fn((_key: string, _id: string, fn: () => unknown) => fn()),
}));
vi.mock('../sites', () => ({
  getManagedSites: vi.fn(),
}));

import { clearCacheEntry, withCache } from '../db';
import { cachedGetDiscoveredGa4Properties, clearGa4DiscoveryCache, discoverPropertyIds, discoverPropertyIdsWithStatus, cachedGetAnalytics, registerCwvCustomDefinitions } from '../ga4';
import { getManagedSites } from '../sites';

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// discoverPropertyIds
// ---------------------------------------------------------------------------

describe('cachedGetDiscoveredGa4Properties', () => {
  it('uses the dedicated discovery cache key', async () => {
    mockListAccountSummaries.mockResolvedValue([
      [{ propertySummaries: [{ displayName: 'example.com', property: 'properties/12345' }] }],
    ]);

    await cachedGetDiscoveredGa4Properties();

    expect(withCache).toHaveBeenCalledWith(
      'ga4-discovery',
      'managed-sites',
      expect.any(Function),
    );
  });

  it('returns null without calling the admin API when credentials are absent', async () => {
    mockHasGoogleCredentials.mockReturnValueOnce(false);

    const result = await cachedGetDiscoveredGa4Properties();

    expect(result).toBeNull();
    expect(mockListAccountSummaries).not.toHaveBeenCalled();
  });
});

describe('discoverPropertyIds', () => {
  it('matches property by domain name substring', async () => {
    vi.mocked(getManagedSites).mockResolvedValue([
      { id: 's1', name: 'Site1', domain: 'example.com', testPages: [] },
    ] as never);
    mockListAccountSummaries.mockResolvedValue([
      [{ propertySummaries: [{ displayName: 'example.com', property: 'properties/12345' }] }],
    ]);

    const result = await discoverPropertyIds();
    expect(result[0].ga4PropertyId).toBe('properties/12345');
  });

  it('does not auto-assign GA4 when multiple exact-domain properties match the same site', async () => {
    vi.mocked(getManagedSites).mockResolvedValue([
      { id: 's1', name: 'Site1', domain: 'example.com', testPages: [] },
    ] as never);
    mockListAccountSummaries.mockResolvedValue([
      [{
        propertySummaries: [
          { displayName: 'example.com', property: 'properties/12345' },
          { displayName: 'example.com', property: 'properties/67890' },
        ],
      }],
    ]);

    const result = await discoverPropertyIds();
    expect(result[0].ga4PropertyId).toBeUndefined();
  });

  it('keeps existing ga4PropertyId if already set', async () => {
    vi.mocked(getManagedSites).mockResolvedValue([
      { id: 's1', name: 'Site1', domain: 'example.com', ga4PropertyId: 'properties/99999', testPages: [] },
    ] as never);
    mockListAccountSummaries.mockResolvedValue([
      [{ propertySummaries: [{ displayName: 'example.com', property: 'properties/12345' }] }],
    ]);

    const result = await discoverPropertyIds();
    expect(result[0].ga4PropertyId).toBe('properties/99999');
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

  it('flags admin API failures while keeping configured sites available', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const sites = [{ id: 's1', name: 'Site1', domain: 'example.com', ga4PropertyId: 'properties/999', testPages: [] }];
    vi.mocked(getManagedSites).mockResolvedValue(sites as never);
    mockListAccountSummaries.mockRejectedValue(new Error('Auth failure'));

    const result = await discoverPropertyIdsWithStatus();

    expect(result).toEqual({ sites, failed: true });
    expect(consoleError).toHaveBeenCalledWith('Error discovering GA4 properties:', expect.any(Error));
    consoleError.mockRestore();
  });

  it('returns sites unchanged when cached property discovery misses', async () => {
    const sites = [{ id: 's1', name: 'Site1', domain: 'example.com', testPages: [] }];
    vi.mocked(getManagedSites).mockResolvedValue(sites as never);
    vi.mocked(withCache).mockResolvedValueOnce(null as never);

    const result = await discoverPropertyIds();

    expect(result).toEqual(sites);
    expect(mockListAccountSummaries).not.toHaveBeenCalled();
  });

  it('returns sites unchanged when cached property discovery throws', async () => {
    const sites = [{ id: 's1', name: 'Site1', domain: 'example.com', testPages: [] }];
    vi.mocked(getManagedSites).mockResolvedValue(sites as never);
    vi.mocked(withCache).mockRejectedValueOnce(new Error('cache failure') as never);

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

  it('does not match unsupported descriptive display names that only contain the domain as a substring', async () => {
    vi.mocked(getManagedSites).mockResolvedValue([
      { id: 's1', name: 'Site1', domain: 'bonker.wtf', testPages: [] },
    ] as never);
    mockListAccountSummaries.mockResolvedValue([
      [{ propertySummaries: [{ displayName: 'bonker.wtf - Main', property: 'properties/55555' }] }],
    ]);

    const result = await discoverPropertyIds();
    expect(result[0].ga4PropertyId).toBeUndefined();
  });

  it('matches when the only difference is a safe www host variant', async () => {
    vi.mocked(getManagedSites).mockResolvedValue([
      { id: 's1', name: 'Site1', domain: 'www.bonker.wtf', testPages: [] },
    ] as never);
    mockListAccountSummaries.mockResolvedValue([
      [{ propertySummaries: [{ displayName: 'bonker.wtf', property: 'properties/22222' }] }],
    ]);

    const result = await discoverPropertyIds();
    expect(result[0].ga4PropertyId).toBe('properties/22222');
  });

  it('ignores properties without a displayName match', async () => {
    vi.mocked(getManagedSites).mockResolvedValue([
      { id: 's1', name: 'Site1', domain: 'example.com', testPages: [] },
    ] as never);
    mockListAccountSummaries.mockResolvedValue([
      [{ propertySummaries: [{ property: 'properties/12345' }] }],
    ]);

    const result = await discoverPropertyIds();
    expect(result[0].ga4PropertyId).toBeUndefined();
  });
});

describe('clearGa4DiscoveryCache', () => {
  it('clears the dedicated GA4 discovery cache entry', () => {
    clearGa4DiscoveryCache();
    expect(clearCacheEntry).toHaveBeenCalledWith('ga4-discovery', 'managed-sites');
  });
});

// ---------------------------------------------------------------------------
// cachedGetAnalytics
// ---------------------------------------------------------------------------

function makeReportRow(values: string[]) {
  return { metricValues: values.map(v => ({ value: v })) };
}

function makePageRow(
  path: string,
  views: string,
  users: string,
  engagementRate: string = '0',
  avgSessionDuration: string = '0',
) {
  return {
    dimensionValues: [{ value: path }],
    metricValues: [
      { value: views },
      { value: users },
      { value: engagementRate },
      { value: avgSessionDuration },
    ],
  };
}

function makeSourceRow(source: string, medium: string, sessions: string, users: string) {
  return {
    dimensionValues: [{ value: source }, { value: medium }],
    metricValues: [{ value: sessions }, { value: users }],
  };
}

describe('cachedGetAnalytics', () => {
  it('returns no-error result with null data for empty propertyId (not configured)', async () => {
    const result = await cachedGetAnalytics('');
    expect(result).toEqual({ data: null, error: false });
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
      rows: [
        makePageRow('/home', '150', '90', '0.62', '135'),
        makePageRow('/about', '50', '30', '0.38', '45'),
      ],
    };
    const trafficRes = {
      rows: [makeSourceRow('google', 'organic', '60', '50')],
    };

    mockRunReport
      .mockResolvedValueOnce([metricsRes])
      .mockResolvedValueOnce([topPagesRes])
      .mockResolvedValueOnce([trafficRes]);

    const result = await cachedGetAnalytics('12345', 7);
    expect(result.error).toBe(false);
    expect(result.data).not.toBeNull();
    expect(result.data!.current.users).toBe(100);
    expect(result.data!.current.sessions).toBe(80);
    expect(result.data!.current.views).toBe(300);
    expect(result.data!.current.bounceRate).toBeCloseTo(0.4);
    expect(result.data!.current.avgSessionDuration).toBeCloseTo(120.5);
    expect(result.data!.topPages).toHaveLength(2);
    expect(result.data!.topPages[0]).toEqual({
      path: '/home',
      views: 150,
      users: 90,
      engagementRate: 0.62,
      avgSessionDuration: 135,
    });
    expect(result.data!.trafficSources[0]).toEqual({ source: 'google', medium: 'organic', sessions: 60, users: 50 });
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
    expect(result.data!.previous.users).toBe(70);
    expect(result.data!.previous.sessions).toBe(60);
  });

  it('returns zeros (not an error) when metrics rows are empty', async () => {
    mockRunReport
      .mockResolvedValueOnce([{ rows: [] }])
      .mockResolvedValueOnce([{ rows: [] }])
      .mockResolvedValueOnce([{ rows: [] }]);

    const result = await cachedGetAnalytics('12345');
    expect(result.error).toBe(false);
    expect(result.data!.current).toEqual({ users: 0, sessions: 0, views: 0, bounceRate: 0, avgSessionDuration: 0 });
    expect(result.data!.topPages).toEqual([]);
    expect(result.data!.trafficSources).toEqual([]);
  });

  it('skips malformed rows without collapsing current and previous periods', async () => {
    const metricsRes = {
      rows: [
        { metricValues: [{}, { value: '999' }] },
        makeReportRow(['100', '80', '300', '0.4', '120']),
        makeReportRow(['70', '60', '200', '0.5', '90']),
      ],
    };
    mockRunReport
      .mockResolvedValueOnce([metricsRes])
      .mockResolvedValueOnce([{ rows: [] }])
      .mockResolvedValueOnce([{ rows: [] }]);

    const result = await cachedGetAnalytics('12345', 7);
    expect(result.data!.current).toEqual({
      users: 100,
      sessions: 80,
      views: 300,
      bounceRate: 0.4,
      avgSessionDuration: 120,
    });
    expect(result.data!.previous).toEqual({
      users: 70,
      sessions: 60,
      views: 200,
      bounceRate: 0.5,
      avgSessionDuration: 90,
    });
    expect(result.data!.current).not.toEqual(result.data!.previous);
  });

  it('uses zeroed previous metrics when only one valid metrics row remains', async () => {
    const metricsRes = {
      rows: [
        { metricValues: [{}, { value: '999' }] },
        makeReportRow(['100', '80', '300', '0.4', '120']),
      ],
    };
    mockRunReport
      .mockResolvedValueOnce([metricsRes])
      .mockResolvedValueOnce([{ rows: [] }])
      .mockResolvedValueOnce([{ rows: [] }]);

    const result = await cachedGetAnalytics('12345', 7);
    expect(result.data!.current).toEqual({
      users: 100,
      sessions: 80,
      views: 300,
      bounceRate: 0.4,
      avgSessionDuration: 120,
    });
    expect(result.data!.previous).toEqual({
      users: 0,
      sessions: 0,
      views: 0,
      bounceRate: 0,
      avgSessionDuration: 0,
    });
  });

  it('returns error state on API failure, distinct from real zero data', async () => {
    mockRunReport.mockRejectedValue(new Error('Quota exceeded'));

    const result = await cachedGetAnalytics('12345');
    expect(result.error).toBe(true);
    expect(result.data).toBeNull();
  });

  it('uses default path for top pages when dimensionValues missing', async () => {
    mockRunReport
      .mockResolvedValueOnce([{ rows: [] }])
      .mockResolvedValueOnce([{ rows: [{ dimensionValues: [], metricValues: [{ value: '5' }, { value: '3' }, { value: '0.5' }, { value: '25' }] }] }])
      .mockResolvedValueOnce([{ rows: [] }]);

    const result = await cachedGetAnalytics('12345');
    expect(result.data!.topPages[0].path).toBe('/');
  });

  it('uses default source and medium when traffic dimensions are missing', async () => {
    mockRunReport
      .mockResolvedValueOnce([{ rows: [] }])
      .mockResolvedValueOnce([{ rows: [] }])
      .mockResolvedValueOnce([{ rows: [{ dimensionValues: [], metricValues: [{ value: '5' }, { value: '3' }] }] }]);

    const result = await cachedGetAnalytics('12345');
    expect(result.data!.trafficSources[0]).toEqual({
      source: '(direct)',
      medium: '(none)',
      sessions: 5,
      users: 3,
    });
  });

  it('falls back to zero metrics for top pages and traffic rows with missing metricValues', async () => {
    mockRunReport
      .mockResolvedValueOnce([{ rows: [] }])
      .mockResolvedValueOnce([{ rows: [{ dimensionValues: [{ value: '/pricing' }] }] }])
      .mockResolvedValueOnce([{ rows: [{ dimensionValues: [{ value: 'newsletter' }, { value: 'email' }] }] }]);

    const result = await cachedGetAnalytics('12345');
    expect(result.data!.topPages[0]).toEqual({
      path: '/pricing',
      views: 0,
      users: 0,
      engagementRate: 0,
      avgSessionDuration: 0,
    });
    expect(result.data!.trafficSources[0]).toEqual({
      source: 'newsletter',
      medium: 'email',
      sessions: 0,
      users: 0,
    });
  });

  it('passes correct property format in API call', async () => {
    mockRunReport
      .mockResolvedValueOnce([{ rows: [] }])
      .mockResolvedValueOnce([{ rows: [] }])
      .mockResolvedValueOnce([{ rows: [] }]);

    await cachedGetAnalytics('99999');

    expect(mockRunReport).toHaveBeenCalledWith(
      expect.objectContaining({ property: 'properties/99999' }),
      { timeout: 30000 },
    );
  });

  it('reuses the normalized cache key for prefixed property ids', async () => {
    mockRunReport
      .mockResolvedValueOnce([{ rows: [] }])
      .mockResolvedValueOnce([{ rows: [] }])
      .mockResolvedValueOnce([{ rows: [] }]);

    await cachedGetAnalytics('properties/99999');

    expect(withCache).toHaveBeenCalledWith(
      'ga4-7',
      'properties/99999',
      expect.any(Function),
    );
    expect(mockRunReport).toHaveBeenCalledWith(
      expect.objectContaining({ property: 'properties/99999' }),
      { timeout: 30000 },
    );
  });
});

describe('registerCwvCustomDefinitions', () => {
  it('creates both dimensions and the metric when none exist', async () => {
    mockListCustomDimensions.mockResolvedValue([[]]);
    mockCreateCustomDimension.mockResolvedValue([{}]);
    mockListCustomMetrics.mockResolvedValue([[]]);
    mockCreateCustomMetric.mockResolvedValue([{}]);

    const result = await registerCwvCustomDefinitions('properties/12345');

    expect(result.created).toEqual(['metric_name', 'metric_rating', 'metric_value']);
    expect(result.alreadyExists).toEqual([]);
    expect(mockCreateCustomDimension).toHaveBeenCalledWith({
      parent: 'properties/12345',
      customDimension: { parameterName: 'metric_name', displayName: 'Metric Name', description: expect.any(String), scope: 'EVENT' },
    });
    expect(mockCreateCustomMetric).toHaveBeenCalledWith({
      parent: 'properties/12345',
      customMetric: {
        parameterName: 'metric_value',
        displayName: 'Metric Value',
        description: expect.any(String),
        measurementUnit: 'MILLISECONDS',
        scope: 'EVENT',
      },
    });
  });

  it('skips definitions that already exist', async () => {
    mockListCustomDimensions.mockResolvedValue([[
      { parameterName: 'metric_name' },
      { parameterName: 'metric_rating' },
    ]]);
    mockListCustomMetrics.mockResolvedValue([[{ parameterName: 'metric_value' }]]);

    const result = await registerCwvCustomDefinitions('properties/12345');

    expect(result.created).toEqual([]);
    expect(result.alreadyExists).toEqual(['metric_name', 'metric_rating', 'metric_value']);
    expect(mockCreateCustomDimension).not.toHaveBeenCalled();
    expect(mockCreateCustomMetric).not.toHaveBeenCalled();
  });

  it('normalizes a bare property id into the properties/ path', async () => {
    mockListCustomDimensions.mockResolvedValue([[]]);
    mockCreateCustomDimension.mockResolvedValue([{}]);
    mockListCustomMetrics.mockResolvedValue([[]]);
    mockCreateCustomMetric.mockResolvedValue([{}]);

    await registerCwvCustomDefinitions('12345');

    expect(mockListCustomDimensions).toHaveBeenCalledWith({ parent: 'properties/12345' });
  });
});
