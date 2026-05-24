import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ScTable } from '../../../app/components/sc-table';

describe('ScTable', () => {
  it('includes a polite status region for CSV export feedback', () => {
    const html = renderToStaticMarkup(
      <ScTable
        heading="Top queries"
        columnLabel="Query"
        emptyMessage="No queries"
        filename="queries.csv"
        exportData={[{ query: 'seo', clicks: 1 }]}
        rows={[
          {
            label: 'seo',
            clicks: 1,
            impressions: 10,
            ctr: 0.1,
            position: 2.4,
          },
        ]}
      />
    );

    expect(html).toContain('role="status"');
    expect(html).toContain('aria-live="polite"');
  });
});
