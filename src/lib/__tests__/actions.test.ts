import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockCachedAuditAllSites,
  mockDetectAllDecay,
  mockGetKeywordDropActions,
  mockAnalyzeSiteGaps,
  mockLoadSiteGapSignals,
  mockDiscoverPropertyIds,
  mockGetManagedSites,
} = vi.hoisted(() => ({
  mockCachedAuditAllSites: vi.fn(),
  mockDetectAllDecay: vi.fn(),
  mockGetKeywordDropActions: vi.fn(),
  mockAnalyzeSiteGaps: vi.fn(),
  mockLoadSiteGapSignals: vi.fn(),
  mockDiscoverPropertyIds: vi.fn(),
  mockGetManagedSites: vi.fn(),
}));

vi.mock('../audit', () => ({
  cachedAuditAllSites: mockCachedAuditAllSites,
}));

vi.mock('../decay', () => ({
  detectAllDecay: mockDetectAllDecay,
}));

vi.mock('../db', () => ({
  getKeywordDropActions: mockGetKeywordDropActions,
}));

vi.mock('../gaps', () => ({
  analyzeSiteGaps: mockAnalyzeSiteGaps,
  createSiteGapSignals: ({
    ga4TopPages,
    scTopPages,
    days,
  }: {
    ga4TopPages?: unknown;
    scTopPages?: unknown;
    days?: number;
  } = {}) => ({
    ga4TopPages,
    scTopPages,
    days,
  }),
  loadSiteGapSignals: mockLoadSiteGapSignals,
}));

vi.mock('../ga4', () => ({
  discoverPropertyIds: mockDiscoverPropertyIds,
}));

vi.mock('../sites', () => ({
  getManagedSites: mockGetManagedSites,
}));

import { loadActionQueue } from '../actions';

const siteA = {
  id: 'site-a',
  name: 'Site A',
  domain: 'a.test',
  searchConsole: true,
  testPages: ['/'],
};

const siteB = {
  id: 'site-b',
  name: 'Site B',
  domain: 'b.test',
  searchConsole: true,
  testPages: ['/'],
};

beforeEach(() => {
  vi.clearAllMocks();
  mockGetManagedSites.mockResolvedValue([siteA, siteB]);
  mockDiscoverPropertyIds.mockResolvedValue([
    { ...siteA, ga4PropertyId: 'properties/111' },
    { ...siteB, ga4PropertyId: 'properties/222' },
  ]);
  mockCachedAuditAllSites.mockResolvedValue([]);
  mockDetectAllDecay.mockResolvedValue([]);
  mockLoadSiteGapSignals.mockResolvedValue({ scTopPages: [], days: 7 });
  mockAnalyzeSiteGaps.mockReturnValue({ gaps: [] });
  mockGetKeywordDropActions.mockReturnValue([]);
});

describe('loadActionQueue', () => {
  it('keeps keyword actions when external aggregate sources fail', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mockDiscoverPropertyIds.mockRejectedValueOnce(new Error('GA4 unavailable'));
    mockCachedAuditAllSites.mockRejectedValueOnce(new Error('audit unavailable'));
    mockDetectAllDecay.mockRejectedValueOnce(new Error('decay unavailable'));
    mockGetKeywordDropActions.mockReturnValueOnce([
      {
        query: 'seo report',
        clicks: 12,
        impressions: 100,
        currentPosition: 8,
        previousPosition: 4,
        delta: -4,
        window: '7d',
      },
    ]);

    const result = await loadActionQueue(7);

    expect(result.items).toEqual([
      expect.objectContaining({
        kind: 'keyword',
        priority: 'medium',
        siteId: 'site-a',
        title: 'Recover ranking drop',
      }),
    ]);
    expect(result.counts).toEqual({
      critical: 0,
      high: 0,
      medium: 1,
      low: 0,
    });
    expect(result.failures).toEqual(['GA4 discovery', 'SEO audits', 'Content decay']);
    expect(consoleError).toHaveBeenCalledWith('[ActionQueue GA4 discovery]', expect.any(Error));
    expect(consoleError).toHaveBeenCalledWith('[ActionQueue audits]', expect.any(Error));
    expect(consoleError).toHaveBeenCalledWith('[ActionQueue decay]', expect.any(Error));

    consoleError.mockRestore();
  });

  it('keeps gap actions when one site signal load fails', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mockCachedAuditAllSites.mockResolvedValueOnce([
      { siteId: 'site-a' },
      { siteId: 'site-b' },
    ]);
    mockLoadSiteGapSignals
      .mockRejectedValueOnce(new Error('Search Console timeout'))
      .mockResolvedValueOnce({
        days: 7,
        scTopPages: [
          { page: '/target', clicks: 12, impressions: 120, ctr: 0.1, position: 3 },
        ],
      });
    mockAnalyzeSiteGaps.mockImplementation((audit: { siteId: string }) => ({
      gaps: [
        {
          id: 'missing-jsonld',
          title: `Fix ${audit.siteId}`,
          description: 'Add structured data.',
          severity: 'high',
          category: 'structured-data',
          hint: 'Add JSON-LD.',
          affectedPages: audit.siteId === 'site-b' ? ['/target'] : undefined,
        },
      ],
    }));

    const result = await loadActionQueue(7);

    expect(result.items).toEqual([
      expect.objectContaining({
        siteId: 'site-b',
        impactLabel: '12 clicks at risk',
      }),
      expect.objectContaining({
        siteId: 'site-a',
        impactLabel: 'Structural issue',
      }),
    ]);
    expect(result.failures).toEqual(['Site A gap signals']);
    expect(consoleError).toHaveBeenCalledWith('[ActionQueue gap signals site-a]', expect.any(Error));

    consoleError.mockRestore();
  });

  it('returns an empty queue when managed sites cannot be loaded', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mockGetManagedSites.mockRejectedValueOnce(new Error('sqlite locked'));

    const result = await loadActionQueue(7);

    expect(result.items).toEqual([]);
    expect(result.counts).toEqual({ critical: 0, high: 0, medium: 0, low: 0 });
    expect(result.failures).toEqual(['Managed sites']);
    expect(consoleError).toHaveBeenCalledWith('[ActionQueue managed sites]', expect.any(Error));

    consoleError.mockRestore();
  });

  it('skips one site when keyword history reads fail', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mockGetKeywordDropActions
      .mockImplementationOnce(() => {
        throw new Error('keyword DB unavailable');
      })
      .mockReturnValueOnce([
        {
          query: 'technical seo',
          clicks: 140,
          impressions: 300,
          currentPosition: 9,
          previousPosition: 3,
          delta: -6,
          window: '30d',
        },
      ]);

    const result = await loadActionQueue(7);

    expect(result.items).toEqual([
      expect.objectContaining({
        kind: 'keyword',
        priority: 'high',
        siteId: 'site-b',
      }),
    ]);
    expect(result.failures).toEqual(['Site A keyword history']);
    expect(consoleError).toHaveBeenCalledWith('[ActionQueue] keyword drops site-a:', expect.any(Error));

    consoleError.mockRestore();
  });

  it('does not expose stored keyword actions for Search Console-disabled sites', async () => {
    mockGetManagedSites.mockResolvedValueOnce([
      siteA,
      { ...siteB, searchConsole: false },
    ]);
    mockGetKeywordDropActions.mockReturnValueOnce([
      {
        query: 'technical seo',
        clicks: 140,
        impressions: 300,
        currentPosition: 9,
        previousPosition: 3,
        delta: -6,
        window: '30d',
      },
    ]);

    const result = await loadActionQueue(7);

    expect(mockGetKeywordDropActions).toHaveBeenCalledTimes(1);
    expect(mockGetKeywordDropActions).toHaveBeenCalledWith('site-a', 5);
    expect(result.items).toEqual([
      expect.objectContaining({
        kind: 'keyword',
        siteId: 'site-a',
        affected: 'technical seo',
      }),
    ]);
    expect(result.failures).toEqual([]);
  });

  it('maps decay severities to correct priorities', async () => {
    mockDetectAllDecay.mockResolvedValueOnce([
      {
        siteId: 'site-a',
        domain: 'a.test',
        totalPages: 3,
        decayingPages: [
          { page: '/severe', siteId: 'site-a', domain: 'a.test', severity: 'severe', previousClicks: 200, currentClicks: 80, clicksDelta: -60, currentImpressions: 500, previousImpressions: 1200, impressionsDelta: -58 },
          { page: '/moderate', siteId: 'site-a', domain: 'a.test', severity: 'moderate', previousClicks: 50, currentClicks: 30, clicksDelta: -40, currentImpressions: 200, previousImpressions: 400, impressionsDelta: -50 },
          { page: '/mild', siteId: 'site-a', domain: 'a.test', severity: 'mild', previousClicks: 10, currentClicks: 8, clicksDelta: -20, currentImpressions: 50, previousImpressions: 70, impressionsDelta: -28 },
        ],
      },
    ]);

    const result = await loadActionQueue(7);

    const decayItems = result.items.filter((i) => i.kind === 'decay');
    expect(decayItems).toEqual([
      expect.objectContaining({ priority: 'critical', affected: '/severe' }),
      expect.objectContaining({ priority: 'high', affected: '/moderate' }),
      expect.objectContaining({ priority: 'medium', affected: '/mild' }),
    ]);
    expect(result.counts.critical).toBe(1);
    expect(result.counts.high).toBe(1);
    expect(result.counts.medium).toBe(1);
  });

  it('skips decay results for sites not in managed sites list', async () => {
    mockDetectAllDecay.mockResolvedValueOnce([
      {
        siteId: 'site-unknown',
        domain: 'unknown.test',
        totalPages: 1,
        decayingPages: [
          { page: '/old', siteId: 'site-unknown', domain: 'unknown.test', severity: 'severe', previousClicks: 100, currentClicks: 10, clicksDelta: -90, currentImpressions: 200, previousImpressions: 1000, impressionsDelta: -80 },
        ],
      },
    ]);

    const result = await loadActionQueue(7);

    expect(result.items.filter((i) => i.kind === 'decay')).toHaveLength(0);
    expect(result.items).toHaveLength(0);
  });

  it('emits a critical gap item when severity is high and impact reaches 100+ clicks', async () => {
    mockCachedAuditAllSites.mockResolvedValueOnce([{ siteId: 'site-a' }]);
    mockLoadSiteGapSignals.mockResolvedValueOnce({
      days: 7,
      scTopPages: [
        { page: 'https://a.test/landing', clicks: 150, impressions: 800, ctr: 0.19, position: 2 },
      ],
    });
    mockAnalyzeSiteGaps.mockReturnValueOnce({
      gaps: [{
        id: 'missing-og-image',
        title: 'Missing OG image',
        description: 'No og:image set.',
        severity: 'high',
        category: 'social',
        hint: 'Add og:image.',
        affectedPages: ['https://a.test/landing'],
      }],
    });

    const result = await loadActionQueue(7);

    expect(result.items).toEqual([
      expect.objectContaining({
        kind: 'gap',
        priority: 'critical',
        impactLabel: '150 clicks at risk',
      }),
    ]);
    expect(result.counts.critical).toBe(1);
  });

  it('classifies a keyword drop with small delta and low clicks as low priority', async () => {
    mockGetKeywordDropActions.mockReturnValueOnce([
      {
        query: 'niche term',
        clicks: 3,
        impressions: 30,
        currentPosition: 11,
        previousPosition: 10,
        delta: -1,
        window: '7d',
      },
    ]);

    const result = await loadActionQueue(7);

    expect(result.items).toEqual([
      expect.objectContaining({
        kind: 'keyword',
        priority: 'low',
        affected: 'niche term',
      }),
    ]);
    expect(result.counts.low).toBe(1);
  });

  it('forwards days=30 to detectAllDecay', async () => {
    await loadActionQueue(30);

    expect(mockDetectAllDecay).toHaveBeenCalledWith(30);
  });

  it('normalizes absolute SC page URLs when matching gap affectedPages', async () => {
    mockCachedAuditAllSites.mockResolvedValueOnce([{ siteId: 'site-a' }]);
    mockLoadSiteGapSignals.mockResolvedValueOnce({
      days: 7,
      scTopPages: [
        { page: 'https://a.test/products/', clicks: 80, impressions: 400, ctr: 0.2, position: 3 },
      ],
    });
    mockAnalyzeSiteGaps.mockReturnValueOnce({
      gaps: [{
        id: 'missing-jsonld',
        title: 'Missing JSON-LD',
        description: 'No structured data.',
        severity: 'high',
        category: 'structured-data',
        hint: 'Add JSON-LD.',
        affectedPages: ['/products'],
      }],
    });

    const result = await loadActionQueue(7);

    expect(result.items).toEqual([
      expect.objectContaining({
        kind: 'gap',
        impactLabel: '80 clicks at risk',
      }),
    ]);
  });

  it('sorts by score and caps the queue at 100 items', async () => {
    mockGetManagedSites.mockResolvedValueOnce([siteA]);
    mockDiscoverPropertyIds.mockResolvedValueOnce([{ ...siteA, ga4PropertyId: 'properties/111' }]);
    mockGetKeywordDropActions.mockReturnValueOnce(
      Array.from({ length: 101 }, (_, index) => {
        const clicks = index + 1;
        return {
          query: `query-${clicks}`,
          clicks,
          impressions: clicks * 10,
          currentPosition: 9,
          previousPosition: 8,
          delta: -1,
          window: '7d',
        };
      }),
    );

    const result = await loadActionQueue(7);

    expect(result.items).toHaveLength(100);
    expect(result.items[0]).toEqual(expect.objectContaining({
      affected: 'query-101',
      score: 101,
    }));
    expect(result.items.at(-1)).toEqual(expect.objectContaining({
      affected: 'query-2',
      score: 2,
    }));
    expect(result.items).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ affected: 'query-1' }),
      ]),
    );
  });
});
