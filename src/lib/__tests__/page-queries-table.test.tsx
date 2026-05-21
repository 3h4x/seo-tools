import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { PageQueriesTable } from '../../../app/components/page-queries-table';

describe('PageQueriesTable', () => {
  it('renders a structured skeleton while page query data is loading', () => {
    const html = renderToStaticMarkup(<PageQueriesTable siteId="site-a" days={7} />);

    expect(html).toContain('Top Pages (Search Console)');
    expect(html).toContain('aria-label="Loading page query data"');
    expect(html).not.toContain('Loading…');
  });
});
