import type { KeywordDelta } from '@/lib/keyword-history';
import { Badge } from '@/components/ui';
import { DataTable, type DataTableColumn } from './data-table';

const KEYWORD_COLUMNS: DataTableColumn[] = [
  { label: 'Query', rowHeader: true, className: 'text-left py-2 pr-4 font-medium', cellClassName: 'py-1.5 pr-4 text-neutral-300 font-mono truncate max-w-xs' },
  { label: 'Position', align: 'right', className: 'py-2 px-3 font-medium', cellClassName: 'py-1.5 px-3 text-right font-mono text-neutral-300' },
  { label: '7d Δ', align: 'right', className: 'py-2 px-3 font-medium', cellClassName: 'py-1.5 px-3 text-right font-mono' },
  { label: '30d Δ', align: 'right', className: 'py-2 px-3 font-medium', cellClassName: 'py-1.5 px-3 text-right font-mono' },
  { label: 'Trend', align: 'right', className: 'py-2 pl-3 font-medium', cellClassName: 'py-1.5 pl-3 text-right' },
];

function KwDeltaCell({ delta }: { delta: number | null }) {
  if (delta === null) {
    return (
      <Badge size="inline" borderless tone="mutedText" className="!text-xs !font-normal">
        —
      </Badge>
    );
  }
  if (Math.abs(delta) < 0.1) {
    return (
      <Badge size="inline" borderless className="!text-xs !font-normal text-neutral-500">
        ±0
      </Badge>
    );
  }
  const improved = delta > 0;
  return (
    <Badge size="inline" borderless tone={improved ? 'successText' : 'dangerText'} className="!text-xs !font-normal">
      {improved ? '+' : ''}{delta.toFixed(1)}
    </Badge>
  );
}

function KwTrendArrow({ trend }: { trend: KeywordDelta['trend'] }) {
  if (trend === 'up') {
    return (
      <Badge size="inline" borderless tone="successText" className="!text-xs !font-normal">
        <span aria-hidden="true">↑</span>
        <span className="sr-only">Ranking improved</span>
      </Badge>
    );
  }
  if (trend === 'down') {
    return (
      <Badge size="inline" borderless tone="dangerText" className="!text-xs !font-normal">
        <span aria-hidden="true">↓</span>
        <span className="sr-only">Ranking declined</span>
      </Badge>
    );
  }
  if (trend === 'new') {
    return (
      <Badge size="inline" borderless tone="infoText" className="font-normal">
        <span aria-hidden="true">new</span>
        <span className="sr-only">New keyword</span>
      </Badge>
    );
  }
  return (
    <Badge size="inline" borderless className="!text-xs !font-normal text-neutral-600">
      <span aria-hidden="true">→</span>
      <span className="sr-only">Ranking stable</span>
    </Badge>
  );
}

export function KeywordRankTable({ deltas, limit = 20 }: { deltas: KeywordDelta[]; limit?: number }) {
  const visibleDeltas = deltas.slice(0, limit);
  const rows = [];
  const rowKeys = [];

  for (const kw of visibleDeltas) {
    rowKeys.push(kw.query);
    rows.push([
      <span key="query">{kw.query}</span>,
      <span key="position">{kw.currentPosition.toFixed(1)}</span>,
      <KwDeltaCell key="delta7d" delta={kw.delta7d} />,
      <KwDeltaCell key="delta30d" delta={kw.delta30d} />,
      <KwTrendArrow key="trend" trend={kw.trend} />,
    ]);
  }

  return (
    <DataTable
      columns={KEYWORD_COLUMNS}
      rows={rows}
      rowKeys={rowKeys}
      monospaceCells={false}
      tableClassName="w-full text-xs"
      headRowClassName="text-neutral-600 border-b border-neutral-800"
      bodyClassName=""
      rowClassName="border-b border-neutral-800/50 hover:bg-neutral-800/30"
    />
  );
}
