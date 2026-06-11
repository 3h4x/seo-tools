import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockQuery, mockWithCache } = vi.hoisted(() => ({
  mockQuery: vi.fn(),
  mockWithCache: vi.fn((_key: string, _id: string, fn: () => unknown) => fn()),
}));

vi.mock('../google-auth', () => ({ getAuth: () => ({}) }));
vi.mock('@googleapis/searchconsole', () => ({
  searchconsole_v1: {
    Searchconsole: class {
      searchanalytics = { query: mockQuery };
    },
  },
}));
vi.mock('../db', () => ({ withCache: mockWithCache }));
vi.mock('../format', () => ({
  daysAgo: (n: number) => `2024-01-${String(n).padStart(2, '0')}`,
}));

import {
  OPPORTUNITIES_DEFAULT_DAYS,
  OPPORTUNITIES_VALID_DAYS,
  OPPORTUNITIES_TIME_RANGE_OPTIONS,
  cachedGetKeywordOpportunities,
} from '../opportunities';

beforeEach(() => {
  vi.clearAllMocks();
  mockWithCache.mockImplementation((_key: string, _id: string, fn: () => unknown) => fn());
});

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

describe('OPPORTUNITIES constants', () => {
  it('exports valid days tuple [7, 28, 90]', () => {
    expect(OPPORTUNITIES_VALID_DAYS).toEqual([7, 28, 90]);
  });

  it('exports default days of 28', () => {
    expect(OPPORTUNITIES_DEFAULT_DAYS).toBe(28);
  });

  it('exports three time-range options aligned with valid days', () => {
    expect(OPPORTUNITIES_TIME_RANGE_OPTIONS).toHaveLength(3);
    const values = OPPORTUNITIES_TIME_RANGE_OPTIONS.map((o) => Number(o.value));
    expect(values).toEqual([...OPPORTUNITIES_VALID_DAYS]);
  });
});

// ---------------------------------------------------------------------------
// cachedGetKeywordOpportunities — fetch plumbing
// ---------------------------------------------------------------------------

describe('cachedGetKeywordOpportunities', () => {
  it('calls withCache with the correct key and siteId', async () => {
    mockQuery.mockResolvedValue({ data: { rows: [] } });

    await cachedGetKeywordOpportunities('sc-domain:example.com', 'site-1', 28);

    expect(mockWithCache).toHaveBeenCalledWith(
      'opportunities-28',
      'site-1',
      expect.any(Function),
      30 * 60 * 1000,
    );
  });

  it('returns null when the Search Console call throws', async () => {
    mockQuery.mockRejectedValue(new Error('SC unavailable'));
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = await cachedGetKeywordOpportunities('sc-domain:example.com', 'site-1', 28);

    expect(result).toBeNull();
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it('passes bare domain prefixed with sc-domain: to the SC client', async () => {
    mockQuery.mockResolvedValue({ data: { rows: [] } });

    await cachedGetKeywordOpportunities('example.com', 'site-1', 28);

    expect(mockQuery).toHaveBeenCalledWith(
      expect.objectContaining({ siteUrl: 'sc-domain:example.com' }),
      expect.objectContaining({ timeout: 30_000 }),
    );
  });

  it('passes http-prefixed URLs to the SC client without modification', async () => {
    mockQuery.mockResolvedValue({ data: { rows: [] } });

    await cachedGetKeywordOpportunities('https://example.com/', 'site-1', 28);

    expect(mockQuery).toHaveBeenCalledWith(
      expect.objectContaining({ siteUrl: 'https://example.com/' }),
      expect.objectContaining({ timeout: 30_000 }),
    );
  });

  it('returns an empty array when no rows are returned', async () => {
    mockQuery.mockResolvedValue({ data: { rows: [] } });

    const result = await cachedGetKeywordOpportunities('sc-domain:example.com', 'site-1', 28);

    expect(result).toEqual([]);
  });

  it('skips rows with position below 5', async () => {
    mockQuery.mockResolvedValue({
      data: {
        rows: [
          { keys: ['fast query', '/page'], position: 3, impressions: 1000, ctr: 0.01 },
        ],
      },
    });

    const result = await cachedGetKeywordOpportunities('sc-domain:example.com', 'site-1', 28);

    expect(result).toEqual([]);
  });

  it('skips rows with position above 20', async () => {
    mockQuery.mockResolvedValue({
      data: {
        rows: [
          { keys: ['buried query', '/page'], position: 25, impressions: 5000, ctr: 0.001 },
        ],
      },
    });

    const result = await cachedGetKeywordOpportunities('sc-domain:example.com', 'site-1', 28);

    expect(result).toEqual([]);
  });

  it('skips rows where actual CTR already meets or exceeds expected CTR for position 3', async () => {
    // expectedCtr is always 0.110 (position-3 target); actualCtr >= 0.110 means no gap
    mockQuery.mockResolvedValue({
      data: {
        rows: [
          { keys: ['high-ctr query', '/page'], position: 10, impressions: 500, ctr: 0.15 },
        ],
      },
    });

    const result = await cachedGetKeywordOpportunities('sc-domain:example.com', 'site-1', 28);

    expect(result).toEqual([]);
  });

  it('includes rows in position 5–20 with a positive CTR gap', async () => {
    mockQuery.mockResolvedValue({
      data: {
        rows: [
          { keys: ['target query', '/page'], position: 8, impressions: 1000, ctr: 0.01 },
        ],
      },
    });

    const result = await cachedGetKeywordOpportunities('sc-domain:example.com', 'site-1', 28);

    expect(result).toHaveLength(1);
    expect(result![0].query).toBe('target query');
    expect(result![0].page).toBe('/page');
    expect(result![0].position).toBe(8);
    expect(result![0].ctrGap).toBeGreaterThan(0);
    expect(result![0].estimatedClicks).toBeGreaterThan(0);
  });

  it('sorts opportunities by estimatedClicks descending', async () => {
    mockQuery.mockResolvedValue({
      data: {
        rows: [
          { keys: ['low volume', '/a'], position: 10, impressions: 100, ctr: 0.001 },
          { keys: ['high volume', '/b'], position: 10, impressions: 10000, ctr: 0.001 },
          { keys: ['mid volume', '/c'], position: 10, impressions: 1000, ctr: 0.001 },
        ],
      },
    });

    const result = await cachedGetKeywordOpportunities('sc-domain:example.com', 'site-1', 28);

    expect(result![0].query).toBe('high volume');
    expect(result![1].query).toBe('mid volume');
    expect(result![2].query).toBe('low volume');
  });

  it('caps results at 20 opportunities', async () => {
    const rows = Array.from({ length: 30 }, (_, i) => ({
      keys: [`query-${i}`, `/page-${i}`],
      position: 10,
      impressions: 1000 - i,
      ctr: 0.001,
    }));
    mockQuery.mockResolvedValue({ data: { rows } });

    const result = await cachedGetKeywordOpportunities('sc-domain:example.com', 'site-1', 28);

    expect(result).toHaveLength(20);
  });

  it('computes estimatedClicks as round(impressions * ctrGap)', async () => {
    // expectedCtr is always 0.110 (position-3 target); actualCtr = 0.005; gap = 0.105
    // impressions = 1000 → estimatedClicks = round(1000 * 0.105) = 105
    mockQuery.mockResolvedValue({
      data: {
        rows: [
          { keys: ['compute query', '/page'], position: 10, impressions: 1000, ctr: 0.005 },
        ],
      },
    });

    const result = await cachedGetKeywordOpportunities('sc-domain:example.com', 'site-1', 28);

    expect(result![0].estimatedClicks).toBe(105);
    expect(result![0].actualCtr).toBe(0.005);
    expect(result![0].expectedCtr).toBe(0.110);
  });
});
