import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactNode } from 'react';
import type { CrossLinkSourceMatrix } from '../cross-links';

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: { href: string; children: ReactNode }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

const {
  mockGetManagedSites,
  mockGetCrossLinkMatrix,
} = vi.hoisted(() => ({
  mockGetManagedSites: vi.fn(),
  mockGetCrossLinkMatrix: vi.fn(),
}));

vi.mock('@/lib/sites', () => ({
  getManagedSites: mockGetManagedSites,
}));

vi.mock('@/lib/cross-links', () => ({
  getCrossLinkMatrix: mockGetCrossLinkMatrix,
}));

vi.mock('../../../app/components/data-table', () => ({
  DataTable: ({ rows }: { rows: ReactNode[][] }) => (
    <div>
      {rows.map((row, rowIndex) => (
        <div key={rowIndex}>
          {row.map((cell, cellIndex) => (
            <div key={cellIndex}>{cell}</div>
          ))}
        </div>
      ))}
    </div>
  ),
}));

import CrossLinksPage from '../../../app/audit/cross-links/page';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('CrossLinksPage', () => {
  it('renders the no-sites notice only when managed sites load successfully as empty', async () => {
    mockGetManagedSites.mockResolvedValue([]);

    const html = renderToStaticMarkup(await CrossLinksPage());

    expect(html).toContain('Google service account not configured');
    expect(html).not.toContain("Couldn't load managed sites");
    expect(mockGetCrossLinkMatrix).not.toHaveBeenCalled();
  });

  it('renders unavailable sources as N/A and excludes them from zero-link gap totals', async () => {
    mockGetManagedSites.mockResolvedValue([
      { id: 'alpha', name: 'Alpha', domain: 'alpha.test', testPages: ['/'] },
      { id: 'beta', name: 'Beta', domain: 'beta.test', testPages: ['/'] },
    ]);

    const matrix: CrossLinkSourceMatrix[] = [
      {
        sourceSiteId: 'alpha',
        sourceSiteName: 'Alpha',
        sourceDomain: 'alpha.test',
        status: 'ok',
        attemptedPages: 2,
        crawledPages: 1,
        failedPages: 1,
        targets: [
          {
            targetSiteId: 'beta',
            targetSiteName: 'Beta',
            targetDomain: 'beta.test',
            linkedPages: 0,
            missingPages: 1,
            linkedExamples: [],
          },
        ],
      },
      {
        sourceSiteId: 'beta',
        sourceSiteName: 'Beta',
        sourceDomain: 'beta.test',
        status: 'search-console-unavailable',
        attemptedPages: 0,
        crawledPages: 0,
        failedPages: 0,
        targets: [
          {
            targetSiteId: 'alpha',
            targetSiteName: 'Alpha',
            targetDomain: 'alpha.test',
            linkedPages: null,
            missingPages: null,
            linkedExamples: [],
          },
        ],
      },
    ];

    mockGetCrossLinkMatrix.mockResolvedValue(matrix);

    const page = await CrossLinksPage();
    const html = renderToStaticMarkup(page);

    expect(html).toContain('Zero-Link Gaps');
    expect(html).toContain('>1<');
    expect(html).toContain('Unavailable Sources');
    expect(html).toContain('SC unavailable');
    expect(html).toContain('Not evaluated');
    expect(html).toContain('1 fetch failed');
  });

  it('shows a partial failure banner when managed sites cannot load', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mockGetManagedSites.mockRejectedValue(new Error('sqlite locked'));

    const html = renderToStaticMarkup(await CrossLinksPage());

    expect(html).toContain('Some data sources are unavailable');
    expect(html).toContain('Managed sites');
    expect(html).toContain("Couldn't load managed sites");
    expect(html).toContain('The sites table failed to read');
    expect(html).not.toContain('No sites configured');
    expect(html).not.toContain('Google service account not configured');
    expect(mockGetCrossLinkMatrix).not.toHaveBeenCalled();
    expect(consoleError).toHaveBeenCalledWith('[CrossLinksPage managed sites]', expect.any(Error));

    consoleError.mockRestore();
  });

  it('keeps the page visible when matrix generation fails', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mockGetManagedSites.mockResolvedValue([
      { id: 'alpha', name: 'Alpha', domain: 'alpha.test', testPages: ['/'] },
      { id: 'beta', name: 'Beta', domain: 'beta.test', testPages: ['/'] },
    ]);
    mockGetCrossLinkMatrix.mockRejectedValue(new Error('Search Console timeout'));

    const html = renderToStaticMarkup(await CrossLinksPage());

    expect(html).toContain('Some data sources are unavailable');
    expect(html).toContain('Cross-link matrix');
    expect(html).toContain('Unavailable Sources');
    expect(consoleError).toHaveBeenCalledWith('[CrossLinksPage matrix]', expect.any(Error));

    consoleError.mockRestore();
  });
});
