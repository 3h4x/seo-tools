import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import * as React from 'react';
import { PageQueriesTable } from '../../../app/components/page-queries-table';

describe('PageQueriesTable', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders a structured skeleton while page query data is loading', () => {
    const html = renderToStaticMarkup(<PageQueriesTable siteId="site-a" days={7} />);

    expect(html).toContain('Top Pages (Search Console)');
    expect(html).toContain('aria-label="Loading page query data"');
    expect(html).not.toContain('Loading…');
  });

  it('renders an error state when page query data fails to load', () => {
    vi.spyOn(React, 'useState')
      .mockImplementationOnce(() => [[], vi.fn()])
      .mockImplementationOnce(() => [false, vi.fn()])
      .mockImplementationOnce(() => ['Search Console page query data could not be loaded. Refresh the dashboard to try again.', vi.fn()])
      .mockImplementation(() => [new Set(), vi.fn()]);

    const html = renderToStaticMarkup(<PageQueriesTable siteId="site-a" days={7} />);

    expect(html).toContain('role="alert"');
    expect(html).toContain('Page Queries Unavailable');
    expect(html).toContain('Search Console page query data could not be loaded.');
    expect(html).not.toContain('No page data available.');
  });

  it('renders expandable page rows as keyboard-accessible controls', () => {
    vi.spyOn(React, 'useState')
      .mockImplementationOnce(() => [[{
        page: 'https://example.com/seo',
        clicks: 12,
        impressions: 300,
        ctr: 0.04,
        position: 6.2,
        queries: [],
      }], vi.fn()])
      .mockImplementationOnce(() => [false, vi.fn()])
      .mockImplementationOnce(() => [null, vi.fn()])
      .mockImplementation(() => [new Set(), vi.fn()]);

    const html = renderToStaticMarkup(<PageQueriesTable siteId="site-a" days={7} />);

    expect(html).toContain('<button class="');
    expect(html).toContain('type="button"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('aria-label="Show queries for /seo"');
    expect(html).toContain('title="https://example.com/seo"');
    expect(html).toContain('<th scope="col" class="px-4 py-3 font-semibold text-left">Page</th>');
  });
});
