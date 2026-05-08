import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../db', () => ({
  getConfig: vi.fn(),
  withCache: vi.fn((_key: string, _id: string, fn: () => unknown) => fn()),
}));

import { cachedGetPagespeed, getPagespeedKey } from '../pagespeed';
import { getConfig } from '../db';

const mockFetch = vi.fn();
global.fetch = mockFetch as unknown as typeof fetch;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getConfig).mockReturnValue(null);
  delete process.env.PAGESPEED_API_KEY;
});

const VALID_RESPONSE = {
  loadingExperience: {
    metrics: {
      LARGEST_CONTENTFUL_PAINT_MS: { percentile: 1800, category: 'FAST' },
      INTERACTION_TO_NEXT_PAINT: { percentile: 150, category: 'FAST' },
      CUMULATIVE_LAYOUT_SHIFT_SCORE: { percentile: 8, category: 'FAST' }, // hundredths → 0.08
    },
  },
  lighthouseResult: {
    categories: { performance: { score: 0.92 } },
    audits: {
      'largest-contentful-paint': { numericValue: 2100 },
      'cumulative-layout-shift': { numericValue: 0.05 },
      'first-contentful-paint': { numericValue: 1200 },
      'server-response-time': { numericValue: 250 },
    },
  },
};

function fetchOk(body: unknown, status = 200) {
  return Promise.resolve({
    ok: status < 400,
    status,
    json: () => Promise.resolve(body),
  } as Response);
}

describe('getPagespeedKey', () => {
  it('prefers DB over env', () => {
    vi.mocked(getConfig).mockReturnValue('db-key');
    process.env.PAGESPEED_API_KEY = 'env-key';
    expect(getPagespeedKey()).toBe('db-key');
  });

  it('falls back to env', () => {
    vi.mocked(getConfig).mockReturnValue(null);
    process.env.PAGESPEED_API_KEY = 'env-key';
    expect(getPagespeedKey()).toBe('env-key');
  });

  it('returns null if neither set', () => {
    expect(getPagespeedKey()).toBeNull();
  });

  it('treats empty/whitespace as missing', () => {
    vi.mocked(getConfig).mockReturnValue('   ');
    process.env.PAGESPEED_API_KEY = '';
    expect(getPagespeedKey()).toBeNull();
  });
});

describe('cachedGetPagespeed', () => {
  it('parses field + lab data and computes performance score', async () => {
    mockFetch.mockReturnValueOnce(fetchOk(VALID_RESPONSE));
    const result = await cachedGetPagespeed('https://example.com', 'mobile');
    expect(result).not.toBeNull();
    expect(result!.performanceScore).toBe(92);
    expect(result!.field!.LCP).toEqual({ value: 1800, rating: 'good' });
    expect(result!.field!.INP).toEqual({ value: 150, rating: 'good' });
    expect(result!.field!.CLS!.value).toBeCloseTo(0.08);
    expect(result!.field!.CLS!.rating).toBe('good');
    expect(result!.lab.LCP).toBe(2100);
    expect(result!.lab.TTFB).toBe(250);
  });

  it('builds URL with strategy and key', async () => {
    vi.mocked(getConfig).mockReturnValue('test-key');
    mockFetch.mockReturnValueOnce(fetchOk(VALID_RESPONSE));
    await cachedGetPagespeed('https://example.com', 'desktop');
    const calledUrl = mockFetch.mock.calls[0][0] as string;
    expect(calledUrl).toContain('strategy=desktop');
    expect(calledUrl).toContain('url=https%3A%2F%2Fexample.com');
    expect(calledUrl).toContain('key=test-key');
  });

  it('omits key parameter when not configured', async () => {
    mockFetch.mockReturnValueOnce(fetchOk(VALID_RESPONSE));
    await cachedGetPagespeed('https://example.com', 'mobile');
    const calledUrl = mockFetch.mock.calls[0][0] as string;
    expect(calledUrl).not.toContain('key=');
  });

  it('returns needsKey=true on 429 without key configured', async () => {
    mockFetch.mockReturnValueOnce(fetchOk({}, 429));
    const result = await cachedGetPagespeed('https://example.com', 'mobile');
    expect(result).not.toBeNull();
    expect(result!.needsKey).toBe(true);
    expect(result!.field).toBeNull();
  });

  it('returns needsKey=false on 429 when key is configured', async () => {
    vi.mocked(getConfig).mockReturnValue('present');
    mockFetch.mockReturnValueOnce(fetchOk({}, 429));
    const result = await cachedGetPagespeed('https://example.com', 'mobile');
    expect(result!.needsKey).toBe(false);
  });

  it('returns null on non-429 HTTP error', async () => {
    mockFetch.mockReturnValueOnce(fetchOk({}, 500));
    const result = await cachedGetPagespeed('https://example.com', 'mobile');
    expect(result).toBeNull();
  });

  it('returns null on fetch throw', async () => {
    mockFetch.mockRejectedValueOnce(new Error('network'));
    const result = await cachedGetPagespeed('https://example.com', 'mobile');
    expect(result).toBeNull();
  });

  it('returns field=null when no field metrics present', async () => {
    mockFetch.mockReturnValueOnce(fetchOk({
      lighthouseResult: VALID_RESPONSE.lighthouseResult,
    }));
    const result = await cachedGetPagespeed('https://example.com', 'mobile');
    expect(result!.field).toBeNull();
    expect(result!.lab.LCP).toBe(2100);
  });
});
