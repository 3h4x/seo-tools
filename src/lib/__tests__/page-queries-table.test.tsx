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
});
