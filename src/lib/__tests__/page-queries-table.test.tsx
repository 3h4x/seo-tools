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

  it('renders an empty notice when no page query rows are available', () => {
    vi.spyOn(React, 'useState')
      .mockImplementationOnce(() => [[], vi.fn()])
      .mockImplementationOnce(() => [false, vi.fn()])
      .mockImplementationOnce(() => [null, vi.fn()])
      .mockImplementation(() => [new Set(), vi.fn()]);

    const html = renderToStaticMarkup(<PageQueriesTable siteId="site-a" days={7} />);

    expect(html).toContain('No page data available.');
    expect(html).toContain('rounded-md border');
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
    expect(html).toContain('<caption class="sr-only">Top Search Console pages</caption>');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('aria-controls="page-query-detail-0"');
    expect(html).toContain('aria-label="Show queries for /seo"');
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain('title="https://example.com/seo"');
    expect(html).toContain('<th scope="col" class="px-4 py-3 font-semibold text-left">Page</th>');
    expect(html).toContain('<th scope="row" class="px-4 py-2.5 font-normal text-left text-neutral-300 text-xs truncate max-w-[200px]">');
  });

  it('links an expanded page control to its query detail row', () => {
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
      .mockImplementation(() => [new Set(['https://example.com/seo']), vi.fn()]);

    const html = renderToStaticMarkup(<PageQueriesTable siteId="site-a" days={7} />);

    expect(html).toContain('aria-expanded="true"');
    expect(html).toContain('aria-controls="page-query-detail-0"');
    expect(html).toContain('<tr id="page-query-detail-0"');
    expect(html).toContain('No query data for this page.');
  });

  it('marks expanded query rows with captions and row headers', () => {
    vi.spyOn(React, 'useState')
      .mockImplementationOnce(() => [[{
        page: 'https://example.com/seo',
        clicks: 12,
        impressions: 300,
        ctr: 0.04,
        position: 6.2,
        queries: [{
          query: 'seo audit',
          clicks: 5,
          impressions: 80,
          ctr: 0.0625,
          position: 3.4,
        }],
      }], vi.fn()])
      .mockImplementationOnce(() => [false, vi.fn()])
      .mockImplementationOnce(() => [null, vi.fn()])
      .mockImplementation(() => [new Set(['https://example.com/seo']), vi.fn()]);

    const html = renderToStaticMarkup(<PageQueriesTable siteId="site-a" days={7} />);

    expect(html).toContain('<caption class="sr-only">Queries for /seo</caption>');
    expect(html).toContain('<th scope="row" class="py-1 font-normal text-left text-neutral-400 truncate max-w-[180px]">seo audit</th>');
  });
});
