import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactElement } from 'react';
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

    expect(html).toContain('<th scope="row" class="px-3 py-2 font-normal font-mono text-left">');
    expect(html).toContain('<td class="px-3 py-2 font-mono text-right">');
  });

  it('marks dates as row headers for trend tables', () => {
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

    expect(html).toContain('<th scope="row" class="px-3 py-2 font-normal font-mono text-left"><span>2026-05-01</span></th>');
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
    expect(html).toContain('<th scope="row" class="py-1.5 pr-4 text-neutral-300 font-mono truncate max-w-xs font-normal text-left">');
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

  it('exposes keyword trend labels without relying on arrows alone', () => {
    const html = renderToStaticMarkup(
      <KeywordRankTable
        deltas={[
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
            position7d: 1.4,
            position30d: 1.8,
            delta7d: -0.8,
            delta30d: -0.4,
            trend: 'down',
          },
          {
            query: 'gamma',
            currentPosition: 3.3,
            position7d: null,
            position30d: null,
            delta7d: null,
            delta30d: null,
            trend: 'new',
          },
          {
            query: 'delta',
            currentPosition: 4.4,
            position7d: 4.5,
            position30d: 4.6,
            delta7d: 0.1,
            delta30d: 0.2,
            trend: 'flat',
          },
        ]}
      />
    );

    expect(html).toContain('<span class="sr-only">Ranking improved</span>');
    expect(html).toContain('<span class="sr-only">Ranking declined</span>');
    expect(html).toContain('<span class="sr-only">New keyword</span>');
    expect(html).toContain('<span class="sr-only">Ranking stable</span>');
    expect(html).toContain('<span aria-hidden="true">↑</span>');
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
    const tableChildren = Array.isArray(table.props.children) ? table.props.children : [table.props.children];
    const tbody = tableChildren[tableChildren.length - 1] as ReactElement<{ children: ReactElement[] }>;
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

  it('marks header cells as column headers', () => {
    const html = renderToStaticMarkup(
      <DataTable
        columns={[{ label: 'Query' }, { label: 'Clicks', align: 'right' }]}
        rows={[[<span key="query">seo</span>, <span key="clicks">10</span>]]}
      />
    );

    expect(html).toContain('<th scope="col" class="px-3 py-2 font-semibold text-left">Query</th>');
    expect(html).toContain('<th scope="col" class="px-3 py-2 font-semibold text-right">Clicks</th>');
  });

  it('lets callers mark row-identifying cells as row headers', () => {
    const html = renderToStaticMarkup(
      <DataTable
        columns={[{ label: 'Query', rowHeader: true }, { label: 'Clicks', align: 'right' }]}
        rows={[[<span key="query">seo</span>, <span key="clicks">10</span>]]}
      />
    );

    expect(html).toContain('<th scope="row" class="px-3 py-2 font-normal font-mono text-left"><span>seo</span></th>');
    expect(html).toContain('<td class="px-3 py-2 font-mono text-right"><span>10</span></td>');
  });

  it('left-aligns custom styled row-header column headers', () => {
    const html = renderToStaticMarkup(
      <DataTable
        columns={[{ label: 'Site', rowHeader: true, className: 'px-4 py-3 font-medium' }]}
        rows={[[<span key="site">Example</span>]]}
      />
    );

    expect(html).toContain('<th scope="col" class="px-4 py-3 font-medium text-left">Site</th>');
  });

  it('does not force normal weight on styled row headers', () => {
    const html = renderToStaticMarkup(
      <DataTable
        columns={[{ label: 'Issue', rowHeader: true, cellClassName: 'px-3 py-2 font-semibold' }]}
        rows={[[<span key="issue">Missing sitemap</span>]]}
        monospaceCells={false}
      />
    );

    expect(html).toContain('<th scope="row" class="px-3 py-2 font-semibold text-left"><span>Missing sitemap</span></th>');
  });

  it('preserves caller-provided responsive column classes and row styling', () => {
    const html = renderToStaticMarkup(
      <DataTable
        columns={[
          { label: 'Page', className: 'px-4 py-3 font-semibold', cellClassName: 'px-4 py-2.5 text-xs' },
          { label: 'Impressions', align: 'right', className: 'px-4 py-3 font-semibold hidden md:table-cell', cellClassName: 'px-4 py-2.5 text-right hidden md:table-cell' },
        ]}
        rows={[[<span key="page">/docs</span>, <span key="impressions">120</span>]]}
        containerClassName="bg-neutral-900 rounded-lg border border-neutral-800 overflow-hidden"
        rowClassName="hover:bg-neutral-800/30 transition-colors"
      />
    );

    expect(html).toContain('<div class="bg-neutral-900 rounded-lg border border-neutral-800 overflow-hidden">');
    expect(html).toContain('<th scope="col" class="px-4 py-3 font-semibold hidden md:table-cell text-right">Impressions</th>');
    expect(html).toContain('<td class="px-4 py-2.5 text-right hidden md:table-cell font-mono"><span>120</span></td>');
    expect(html).toContain('<tr class="hover:bg-neutral-800/30 transition-colors">');
  });

  it('renders an accessible caption when provided', () => {
    const html = renderToStaticMarkup(
      <DataTable
        columns={[{ label: 'Path' }]}
        rows={[[<span key="path">/pricing</span>]]}
        caption="Slowest pages by Core Web Vitals samples"
      />
    );

    expect(html).toContain('<caption class="sr-only">Slowest pages by Core Web Vitals samples</caption>');
  });

  it('can render caller-provided expanded rows under keyed data rows', () => {
    const html = renderToStaticMarkup(
      <DataTable
        columns={[{ label: 'Page', rowHeader: true }, { label: 'Clicks', align: 'right' }]}
        rows={[[<span key="path">/docs</span>, <span key="clicks">12</span>]]}
        rowKeys={['/docs']}
        expandedRows={[<p key="details">No query data for this page.</p>]}
        expandedRowIds={['page-query-detail-0']}
        expandedRowClassName="bg-neutral-950/50"
        expandedCellClassName="px-6 pb-3 pt-1"
        getRowProps={() => ({ className: 'cursor-pointer' })}
      />
    );

    expect(html).toContain('<tr class="hover:bg-neutral-800/30 cursor-pointer">');
    expect(html).toContain('<tr id="page-query-detail-0" class="bg-neutral-950/50">');
    expect(html).toContain('<td colSpan="2" class="px-6 pb-3 pt-1"><p>No query data for this page.</p></td>');
  });
});
