import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockScSitesGet,
  mockGa4RunReport,
  mockGetManagedSites,
  mockGetSCUrl,
} = vi.hoisted(() => ({
  mockScSitesGet: vi.fn(),
  mockGa4RunReport: vi.fn(),
  mockGetManagedSites: vi.fn(),
  mockGetSCUrl: vi.fn((site: { scUrl?: string; domain: string }) => site.scUrl ?? `sc-domain:${site.domain}`),
}));

vi.mock('../google-auth', () => ({ getAuth: () => ({}) }));
vi.mock('@googleapis/searchconsole', () => ({
  searchconsole_v1: {
    Searchconsole: class {
      sites = { get: mockScSitesGet };
    },
  },
}));
vi.mock('@google-analytics/data', () => ({
  BetaAnalyticsDataClient: class {
    runReport = mockGa4RunReport;
  },
}));
vi.mock('../sites', () => ({
  getManagedSites: mockGetManagedSites,
  getSCUrl: mockGetSCUrl,
}));

import { getSiteDiagnostics } from '../site-diagnostics';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('getSiteDiagnostics', () => {
  it('returns ok statuses when both providers are accessible', async () => {
    mockGetManagedSites.mockResolvedValue([
      {
        id: 'site-a',
        name: 'Site A',
        domain: 'example.com',
        searchConsole: true,
        ga4PropertyId: 'properties/123',
        testPages: ['/'],
      },
    ]);
    mockScSitesGet.mockResolvedValue({});
    mockGa4RunReport.mockResolvedValue([{}]);

    const result = await getSiteDiagnostics();

    expect(result).toEqual([
      {
        siteId: 'site-a',
        searchConsole: { status: 'ok', message: 'Accessible' },
        ga4: { status: 'ok', message: 'Accessible' },
      },
    ]);
    expect(mockScSitesGet).toHaveBeenCalledWith(
      { siteUrl: 'sc-domain:example.com' },
      { timeout: 30000 },
    );
    expect(mockGa4RunReport).toHaveBeenCalledWith(
      expect.objectContaining({ property: 'properties/123' }),
      { timeout: 30000 },
    );
  });

  it('returns missing-config when provider config is absent', async () => {
    mockGetManagedSites.mockResolvedValue([
      {
        id: 'site-b',
        name: 'Site B',
        domain: 'missing.com',
        searchConsole: false,
        testPages: ['/'],
      },
    ]);

    const result = await getSiteDiagnostics();

    expect(result).toEqual([
      {
        siteId: 'site-b',
        searchConsole: { status: 'missing-config', message: 'Disabled for this site' },
        ga4: { status: 'missing-config', message: 'No GA4 property ID' },
      },
    ]);
    expect(mockScSitesGet).not.toHaveBeenCalled();
    expect(mockGa4RunReport).not.toHaveBeenCalled();
  });

  it('classifies permission and not-found provider failures', async () => {
    mockGetManagedSites.mockResolvedValue([
      {
        id: 'site-c',
        name: 'Site C',
        domain: 'broken.com',
        searchConsole: true,
        ga4PropertyId: 'properties/999',
        testPages: ['/'],
      },
    ]);
    mockScSitesGet.mockRejectedValue({ code: 403, message: 'The caller does not have permission' });
    mockGa4RunReport.mockRejectedValue({ code: 404, message: 'Requested entity was not found' });

    const result = await getSiteDiagnostics();

    expect(result).toEqual([
      {
        siteId: 'site-c',
        searchConsole: { status: 'permission-error', message: 'Permission error' },
        ga4: { status: 'not-found', message: 'Not found' },
      },
    ]);
  });

  it('classifies string-based provider statuses from Google clients', async () => {
    mockGetManagedSites.mockResolvedValue([
      {
        id: 'site-d',
        name: 'Site D',
        domain: 'strings.test',
        searchConsole: true,
        ga4PropertyId: 'properties/321',
        testPages: ['/'],
      },
    ]);
    mockScSitesGet.mockRejectedValue({ status: 'PERMISSION_DENIED', message: 'insufficient permissions' });
    mockGa4RunReport.mockRejectedValue({ code: 'NOT_FOUND', message: 'resource missing' });

    const result = await getSiteDiagnostics();

    expect(result).toEqual([
      {
        siteId: 'site-d',
        searchConsole: { status: 'permission-error', message: 'Permission error' },
        ga4: { status: 'not-found', message: 'Not found' },
      },
    ]);
  });
});

describe('classifyProviderError — message-based and fallback paths', () => {
  const site = {
    id: 'site-x',
    name: 'Site X',
    domain: 'x.example.com',
    searchConsole: true,
    ga4PropertyId: 'properties/1',
    testPages: ['/'],
  };

  beforeEach(() => {
    mockGetManagedSites.mockResolvedValue([site]);
    mockGa4RunReport.mockResolvedValue([{}]);
  });

  it.each([
    [{ code: 'FORBIDDEN' }, 'permission-error'],
    [{ code: 'forbidden' }, 'permission-error'],
    [{ message: 'Forbidden: request lacks scopes' }, 'permission-error'],
    [{ message: 'Not Authorized to access this resource' }, 'permission-error'],
    [{ message: 'Access Denied by policy' }, 'permission-error'],
    [{ message: 'Resource Not Found in the system' }, 'not-found'],
    [{ message: 'Requested entity was not found' }, 'not-found'],
    [{ message: 'Generic transport failure' }, 'provider-error'],
    [{ code: 999 }, 'provider-error'],
  ])('classifies %o via SC error → status %s', async (error, expectedStatus) => {
    mockScSitesGet.mockRejectedValue(error);

    const result = await getSiteDiagnostics();

    expect(result[0].searchConsole.status).toBe(expectedStatus);
  });

  it('extracts message from Error instances for classification', async () => {
    mockScSitesGet.mockRejectedValue(new Error('access denied by IAM policy'));

    const result = await getSiteDiagnostics();

    expect(result[0].searchConsole.status).toBe('permission-error');
  });

  it('falls back to provider-error when Error has unrecognized message', async () => {
    mockScSitesGet.mockRejectedValue(new Error('unexpected quota exceeded'));

    const result = await getSiteDiagnostics();

    expect(result[0].searchConsole.status).toBe('provider-error');
  });

  it('uses Unknown provider error when error has no message property and is not an Error', async () => {
    mockScSitesGet.mockRejectedValue({ code: 999 });

    const result = await getSiteDiagnostics();

    expect(result[0].searchConsole.status).toBe('provider-error');
  });

  it('normalizes numeric string code "403" the same as numeric 403', async () => {
    mockScSitesGet.mockRejectedValue({ code: '403', message: '' });

    const result = await getSiteDiagnostics();

    expect(result[0].searchConsole.status).toBe('permission-error');
  });

  it('normalizes numeric string code "404" the same as numeric 404', async () => {
    mockScSitesGet.mockRejectedValue({ code: '404', message: '' });

    const result = await getSiteDiagnostics();

    expect(result[0].searchConsole.status).toBe('not-found');
  });
});
