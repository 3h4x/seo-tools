import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { DataTable } from '../../../app/components/data-table';
import { TrendsTable } from '../../../app/components/trends-table';
import { KeywordRankTable } from '../../../app/components/keyword-rank-table';

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

  it('keeps the shared monospace cell styling for default table consumers', () => {
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

    expect(html).toContain('<td class="px-3 py-2 font-mono">');
    expect(html).toContain('<td class="px-3 py-2 font-mono text-right">');
  });
});

describe('KeywordRankTable', () => {
  it('renders through the shared DataTable shell with the expected row styling', () => {
    const html = renderToStaticMarkup(
      <KeywordRankTable
        deltas={[
          {
            query: 'seo audit',
            currentPosition: 3.2,
            position7d: 4.3,
            position30d: 5.6,
            delta7d: 1.1,
            delta30d: -2.4,
            trend: 'up',
          },
        ]}
      />
    );

    expect(html).toContain('<table class="w-full text-xs">');
    expect(html).toContain('<tr class="text-neutral-600 border-b border-neutral-800">');
    expect(html).toContain('<tbody class="">');
    expect(html).toContain('<tr class="border-b border-neutral-800/50 hover:bg-neutral-800/30">');
    expect(html).toContain('<td class="py-1.5 pl-3 text-right">');
    expect(html).not.toContain('divide-y divide-neutral-800');
  });

  it('passes stable row keys derived from each query into DataTable', () => {
    const element = KeywordRankTable({
      deltas: [
        {
          query: 'alpha',
          currentPosition: 1.1,
          position7d: 1.4,
          position30d: 1.8,
          delta7d: 0.3,
          delta30d: 0.7,
          trend: 'up',
        },
        {
          query: 'beta',
          currentPosition: 2.2,
          position7d: 2.4,
          position30d: 2.9,
          delta7d: 0.2,
          delta30d: 0.7,
          trend: 'up',
        },
      ],
    });

    expect(element.props.rowKeys).toEqual(['alpha', 'beta']);
  });
});

describe('DataTable', () => {
  it('uses caller-provided row keys instead of positional indexes', () => {
    const element = DataTable({
      columns: [{ label: 'Query' }],
      rows: [[<span key="query">alpha</span>], [<span key="query">beta</span>]],
      rowKeys: ['alpha', 'beta'],
    });

    const table = element.props.children;
    const [, tbody] = table.props.children;
    const [firstRow, secondRow] = tbody.props.children;

    expect(firstRow.key).toBe('alpha');
    expect(secondRow.key).toBe('beta');
  });

  it('lets callers opt out of shared dividers and monospace cell styling', () => {
    const html = renderToStaticMarkup(
      <DataTable
        columns={[{ label: 'Trend', cellClassName: 'px-2 py-1 text-right' }]}
        rows={[[<span key="trend">up</span>]]}
        monospaceCells={false}
        bodyClassName=""
      />
    );

    expect(html).toContain('<tbody class="">');
    expect(html).toContain('<td class="px-2 py-1 text-right">');
    expect(html).not.toContain('font-mono');
  });

  it('keeps monospace cell styling by default for shared consumers', () => {
    const html = renderToStaticMarkup(
      <DataTable
        columns={[{ label: 'Clicks', align: 'right' }]}
        rows={[[<span key="clicks">10</span>]]}
      />
    );

    expect(html).toContain('<td class="px-3 py-2 font-mono text-right">');
  });
});
