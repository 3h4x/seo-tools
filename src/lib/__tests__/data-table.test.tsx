import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { TrendsTable } from '../../../app/components/trends-table';

describe('TrendsTable', () => {
  it('applies sticky header classes to thead and keeps row styles on the header row', () => {
    const html = renderToStaticMarkup(
      <TrendsTable
        title="SC Data"
        columns={[
          { label: 'Date' },
          { label: 'Clicks', align: 'right' },
        ]}
        rows={[
          [<span key="date">2026-05-01</span>, <span key="clicks">10</span>],
        ]}
      />
    );

    expect(html).toContain('<thead class="sticky top-0 bg-neutral-900">');
    expect(html).toContain('<tr class="border-b border-neutral-800 text-neutral-500">');
  });
});
