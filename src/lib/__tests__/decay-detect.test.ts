import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../search-console', () => ({
  getSearchConsolePagesForPeriod: vi.fn(),
}));
vi.mock('../sites', () => ({
  getManagedSites: vi.fn(),
  getSCUrl: vi.fn((site: { domain: string }) => `sc-domain:${site.domain}`),
}));
vi.mock('../format', () => ({
  daysAgo: vi.fn((n: number) => `2024-01-${String(15 - n).padStart(2, '0')}`),
}));

import { getSearchConsolePagesForPeriod } from '../search-console';
import { getManagedSites } from '../sites';
import { detectSiteDecay, detectAllDecay } from '../decay';

const SITE = {
  id: 'site1',
  name: 'Site One',
  domain: 'site1.com',
  searchConsole: true,
  testPages: ['/'],
};

function page(p: string, clicks: number, impressions: number, position: number) {
  return { page: p, clicks, impressions, ctr: clicks / (impressions || 1), position };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('detectSiteDecay', () => {
  it('returns null when site has no searchConsole', async () => {
    const result = await detectSiteDecay({ ...SITE, searchConsole: false }, 7);
    expect(result).toBeNull();
    expect(getSearchConsolePagesForPeriod).not.toHaveBeenCalled();
  });

  it('returns null when current pages fetch fails', async () => {
    vi.mocked(getSearchConsolePagesForPeriod)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce([page('/about', 100, 500, 3)]);

    const result = await detectSiteDecay(SITE, 7);
    expect(result).toBeNull();
  });

  it('returns null when previous pages fetch fails', async () => {
    vi.mocked(getSearchConsolePagesForPeriod)
      .mockResolvedValueOnce([page('/about', 50, 200, 5)])
      .mockResolvedValueOnce(null);

    const result = await detectSiteDecay(SITE, 7);
    expect(result).toBeNull();
  });

  it('returns empty decayingPages when no traffic loss', async () => {
    const pages = [page('/home', 100, 1000, 2)];
    vi.mocked(getSearchConsolePagesForPeriod)
      .mockResolvedValueOnce(pages)
      .mockResolvedValueOnce(pages);

    const result = await detectSiteDecay(SITE, 7);
    expect(result).not.toBeNull();
    expect(result!.decayingPages).toHaveLength(0);
    expect(result!.totalPages).toBe(1);
  });

  it('detects a page with significant click drop as decaying', async () => {
    vi.mocked(getSearchConsolePagesForPeriod)
      .mockResolvedValueOnce([page('/blog', 10, 100, 5)])
      .mockResolvedValueOnce([page('/blog', 100, 500, 3)]);

    const result = await detectSiteDecay(SITE, 7);
    expect(result!.decayingPages).toHaveLength(1);
    expect(result!.decayingPages[0].page).toBe('/blog');
    expect(result!.decayingPages[0].severity).toBe('severe');
    expect(result!.decayingPages[0].clicksDelta).toBe(-90);
  });

  it('detects disappeared page (in previous, not in current) as severe', async () => {
    vi.mocked(getSearchConsolePagesForPeriod)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([page('/old-page', 50, 200, 4)]);

    const result = await detectSiteDecay(SITE, 7);
    expect(result!.decayingPages).toHaveLength(1);
    expect(result!.decayingPages[0].page).toBe('/old-page');
    expect(result!.decayingPages[0].severity).toBe('severe');
    expect(result!.decayingPages[0].currentClicks).toBe(0);
    expect(result!.decayingPages[0].clicksDelta).toBe(-100);
  });

  it('skips disappeared pages where previous clicks was 0', async () => {
    vi.mocked(getSearchConsolePagesForPeriod)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([page('/zero-click', 0, 50, 10)]);

    const result = await detectSiteDecay(SITE, 7);
    expect(result!.decayingPages).toHaveLength(0);
  });

  it('skips pages where previous clicks was 0 (avoids division by zero)', async () => {
    vi.mocked(getSearchConsolePagesForPeriod)
      .mockResolvedValueOnce([page('/new', 50, 200, 3)])
      .mockResolvedValueOnce([page('/new', 0, 10, 8)]);

    const result = await detectSiteDecay(SITE, 7);
    expect(result!.decayingPages).toHaveLength(0);
  });

  it('counts totalPages as union of current and previous pages', async () => {
    vi.mocked(getSearchConsolePagesForPeriod)
      .mockResolvedValueOnce([page('/a', 10, 100, 5), page('/b', 5, 50, 6)])
      .mockResolvedValueOnce([page('/a', 100, 500, 3), page('/c', 30, 200, 4)]);

    const result = await detectSiteDecay(SITE, 7);
    // /a, /b, /c => 3 unique pages
    expect(result!.totalPages).toBe(3);
  });

  it('returns siteId and domain in result', async () => {
    vi.mocked(getSearchConsolePagesForPeriod).mockResolvedValue([]);

    const result = await detectSiteDecay(SITE, 7);
    expect(result!.siteId).toBe('site1');
    expect(result!.domain).toBe('site1.com');
  });

  it('works with 30-day window', async () => {
    vi.mocked(getSearchConsolePagesForPeriod).mockResolvedValue([]);

    const result = await detectSiteDecay(SITE, 30);
    expect(result).not.toBeNull();
    expect(getSearchConsolePagesForPeriod).toHaveBeenCalledTimes(2);
  });
});

describe('detectAllDecay', () => {
  it('returns empty array when no sites have searchConsole', async () => {
    vi.mocked(getManagedSites).mockResolvedValue([{ ...SITE, searchConsole: false }] as never);

    const result = await detectAllDecay(7);
    expect(result).toEqual([]);
  });

  it('filters out sites that return null from detectSiteDecay', async () => {
    vi.mocked(getManagedSites).mockResolvedValue([SITE] as never);
    vi.mocked(getSearchConsolePagesForPeriod).mockResolvedValue(null);

    const result = await detectAllDecay(7);
    expect(result).toEqual([]);
  });

  it('returns results for all SC-enabled sites', async () => {
    const site2 = { ...SITE, id: 'site2', domain: 'site2.com' };
    vi.mocked(getManagedSites).mockResolvedValue([SITE, site2] as never);
    vi.mocked(getSearchConsolePagesForPeriod).mockResolvedValue([]);

    const result = await detectAllDecay(7);
    expect(result).toHaveLength(2);
    expect(result.map(r => r.siteId)).toContain('site1');
    expect(result.map(r => r.siteId)).toContain('site2');
  });
});
