import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockQuery = vi.fn();
const mockSitemapsList = vi.fn();

vi.mock('../google-auth', () => ({ getAuth: () => ({}) }));
vi.mock('@googleapis/searchconsole', () => ({
  searchconsole_v1: {
    Searchconsole: class {
      searchanalytics = { query: mockQuery };
      sitemaps = { list: mockSitemapsList };
    },
  },
}));
vi.mock('../db', () => ({
  withCache: vi.fn((_key: string, _id: string, fn: () => unknown) => fn()),
}));

import {
  getSearchConsolePagesForPeriod,
  cachedGetSearchConsoleData,
  cachedGetSearchConsoleDataWithComparison,
  cachedGetSearchConsoleQueries,
  cachedGetSearchConsolePages,
  cachedGetSitemapSubmissions,
} from '../search-console';

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// getSearchConsolePagesForPeriod
// ---------------------------------------------------------------------------

describe('getSearchConsolePagesForPeriod', () => {
  it('returns mapped page rows on success', async () => {
    mockQuery.mockResolvedValue({
      data: {
        rows: [
          { keys: ['/page-a'], clicks: 10, impressions: 200, ctr: 0.05, position: 3.2 },
          { keys: ['/page-b'], clicks: 5, impressions: 100, ctr: 0.05, position: 5.0 },
        ],
      },
    });

    const result = await getSearchConsolePagesForPeriod('example.com', '2024-01-01', '2024-01-07');
    expect(result).toHaveLength(2);
    expect(result![0]).toEqual({ page: '/page-a', clicks: 10, impressions: 200, ctr: 0.05, position: 3.2 });
    expect(result![1]).toEqual({ page: '/page-b', clicks: 5, impressions: 100, ctr: 0.05, position: 5.0 });
  });

  it('auto-prefixes domain with sc-domain:', async () => {
    mockQuery.mockResolvedValue({ data: { rows: [] } });

    await getSearchConsolePagesForPeriod('example.com', '2024-01-01', '2024-01-07');

    expect(mockQuery).toHaveBeenCalledWith(
      expect.objectContaining({ siteUrl: 'sc-domain:example.com' }),
    );
  });

  it('preserves existing sc-domain: prefix', async () => {
    mockQuery.mockResolvedValue({ data: { rows: [] } });

    await getSearchConsolePagesForPeriod('sc-domain:example.com', '2024-01-01', '2024-01-07');

    expect(mockQuery).toHaveBeenCalledWith(
      expect.objectContaining({ siteUrl: 'sc-domain:example.com' }),
    );
  });

  it('preserves http:// prefixed URLs unchanged', async () => {
    mockQuery.mockResolvedValue({ data: { rows: [] } });

    await getSearchConsolePagesForPeriod('https://example.com/', '2024-01-01', '2024-01-07');

    expect(mockQuery).toHaveBeenCalledWith(
      expect.objectContaining({ siteUrl: 'https://example.com/' }),
    );
  });

  it('returns empty array when rows is missing', async () => {
    mockQuery.mockResolvedValue({ data: {} });

    const result = await getSearchConsolePagesForPeriod('example.com', '2024-01-01', '2024-01-07');
    expect(result).toEqual([]);
  });

  it('returns null on API error', async () => {
    mockQuery.mockRejectedValue(new Error('API quota exceeded'));

    const result = await getSearchConsolePagesForPeriod('example.com', '2024-01-01', '2024-01-07');
    expect(result).toBeNull();
  });

  it('uses custom rowLimit in request', async () => {
    mockQuery.mockResolvedValue({ data: { rows: [] } });

    await getSearchConsolePagesForPeriod('example.com', '2024-01-01', '2024-01-07', 500);

    expect(mockQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        requestBody: expect.objectContaining({ rowLimit: 500 }),
      }),
    );
  });

  it('falls back to 0 for missing metric values', async () => {
    mockQuery.mockResolvedValue({
      data: { rows: [{ keys: ['/page'] }] },
    });

    const result = await getSearchConsolePagesForPeriod('example.com', '2024-01-01', '2024-01-07');
    expect(result![0]).toEqual({ page: '/page', clicks: 0, impressions: 0, ctr: 0, position: 0 });
  });
});

// ---------------------------------------------------------------------------
// cachedGetSearchConsoleData
// ---------------------------------------------------------------------------

describe('cachedGetSearchConsoleData', () => {
  it('returns formatted data with ctr as percent string and position as string', async () => {
    mockQuery.mockResolvedValue({
      data: { rows: [{ clicks: 20, impressions: 400, ctr: 0.05, position: 4.567 }] },
    });

    const result = await cachedGetSearchConsoleData('example.com', 7);
    expect(result).toEqual({
      clicks: 20,
      impressions: 400,
      ctr: '5.00%',
      position: '4.6',
    });
  });

  it('returns zeros when rows is empty', async () => {
    mockQuery.mockResolvedValue({ data: { rows: [] } });

    const result = await cachedGetSearchConsoleData('example.com');
    expect(result).toEqual({ clicks: 0, impressions: 0, ctr: '0.00%', position: '0.0' });
  });

  it('returns null on API error', async () => {
    mockQuery.mockRejectedValue(new Error('Network failure'));

    const result = await cachedGetSearchConsoleData('example.com');
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// cachedGetSearchConsoleDataWithComparison
// ---------------------------------------------------------------------------

describe('cachedGetSearchConsoleDataWithComparison', () => {
  it('returns current and previous period aggregates', async () => {
    mockQuery
      .mockResolvedValueOnce({
        data: { rows: [{ clicks: 100, impressions: 2000, ctr: 0.05, position: 3.0 }] },
      })
      .mockResolvedValueOnce({
        data: { rows: [{ clicks: 80, impressions: 1600, ctr: 0.05, position: 3.5 }] },
      });

    const result = await cachedGetSearchConsoleDataWithComparison('example.com', 7);
    expect(result?.current).toEqual({ clicks: 100, impressions: 2000, ctr: 0.05, position: 3.0 });
    expect(result?.previous).toEqual({ clicks: 80, impressions: 1600, ctr: 0.05, position: 3.5 });
  });

  it('returns zero aggregates when rows are missing', async () => {
    mockQuery.mockResolvedValue({ data: {} });

    const result = await cachedGetSearchConsoleDataWithComparison('example.com', 7);
    expect(result?.current).toEqual({ clicks: 0, impressions: 0, ctr: 0, position: 0 });
    expect(result?.previous).toEqual({ clicks: 0, impressions: 0, ctr: 0, position: 0 });
  });

  it('returns null on API error', async () => {
    mockQuery.mockRejectedValue(new Error('Auth failed'));

    const result = await cachedGetSearchConsoleDataWithComparison('example.com');
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// cachedGetSearchConsoleQueries
// ---------------------------------------------------------------------------

describe('cachedGetSearchConsoleQueries', () => {
  it('returns mapped query rows', async () => {
    mockQuery.mockResolvedValue({
      data: {
        rows: [
          { keys: ['token factory'], clicks: 50, impressions: 1000, ctr: 0.05, position: 2.1 },
        ],
      },
    });

    const result = await cachedGetSearchConsoleQueries('example.com', 7);
    expect(result).toHaveLength(1);
    expect(result![0]).toMatchObject({ query: 'token factory', clicks: 50, impressions: 1000 });
  });

  it('returns empty array when no rows', async () => {
    mockQuery.mockResolvedValue({ data: { rows: [] } });

    const result = await cachedGetSearchConsoleQueries('example.com');
    expect(result).toEqual([]);
  });

  it('returns null on error', async () => {
    mockQuery.mockRejectedValue(new Error('500'));

    const result = await cachedGetSearchConsoleQueries('example.com');
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// cachedGetSearchConsolePages
// ---------------------------------------------------------------------------

describe('cachedGetSearchConsolePages', () => {
  it('returns mapped page rows', async () => {
    mockQuery.mockResolvedValue({
      data: {
        rows: [
          { keys: ['/home'], clicks: 30, impressions: 600, ctr: 0.05, position: 1.5 },
        ],
      },
    });

    const result = await cachedGetSearchConsolePages('example.com', 7);
    expect(result).toHaveLength(1);
    expect(result![0]).toMatchObject({ page: '/home', clicks: 30 });
  });

  it('returns null on error', async () => {
    mockQuery.mockRejectedValue(new Error('error'));

    const result = await cachedGetSearchConsolePages('example.com');
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// cachedGetSitemapSubmissions
// ---------------------------------------------------------------------------

describe('cachedGetSitemapSubmissions', () => {
  it('returns mapped sitemap submissions', async () => {
    mockSitemapsList.mockResolvedValue({
      data: {
        sitemap: [
          {
            path: 'https://example.com/sitemap.xml',
            lastSubmitted: '2024-01-10T00:00:00Z',
            lastDownloaded: '2024-01-11T00:00:00Z',
            isPending: false,
            warnings: 0,
            errors: 0,
          },
        ],
      },
    });

    const result = await cachedGetSitemapSubmissions('example.com');
    expect(result).toHaveLength(1);
    expect(result![0]).toMatchObject({
      path: 'https://example.com/sitemap.xml',
      isPending: false,
      warnings: 0,
      errors: 0,
    });
  });

  it('returns empty array on API error', async () => {
    mockSitemapsList.mockRejectedValue(new Error('Unauthorized'));

    const result = await cachedGetSitemapSubmissions('example.com');
    expect(result).toEqual([]);
  });

  it('returns empty array when no sitemaps submitted', async () => {
    mockSitemapsList.mockResolvedValue({ data: { sitemap: [] } });

    const result = await cachedGetSitemapSubmissions('example.com');
    expect(result).toEqual([]);
  });

  it('coerces warnings and errors to numbers', async () => {
    mockSitemapsList.mockResolvedValue({
      data: {
        sitemap: [
          {
            path: '/sitemap.xml',
            lastSubmitted: null,
            lastDownloaded: null,
            isPending: true,
            warnings: '3',
            errors: '1',
          },
        ],
      },
    });

    const result = await cachedGetSitemapSubmissions('example.com');
    expect(typeof result![0].warnings).toBe('number');
    expect(result![0].warnings).toBe(3);
    expect(result![0].errors).toBe(1);
  });
});
