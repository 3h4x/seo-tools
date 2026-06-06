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
  if (delta === null) return <span className="text-neutral-700">—</span>;
  if (Math.abs(delta) < 0.1) return <span className="text-neutral-500">±0</span>;
  const improved = delta > 0;
  return (
    <span className={improved ? 'text-emerald-400' : 'text-red-400'}>
      {improved ? '+' : ''}{delta.toFixed(1)}
    </span>
  );
}

function KwTrendArrow({ trend }: { trend: KeywordDelta['trend'] }) {
  if (trend === 'up') {
    return (
      <span className="text-emerald-400">
        <span aria-hidden="true">↑</span>
        <span className="sr-only">Ranking improved</span>
      </span>
    );
  }
  if (trend === 'down') {
    return (
      <span className="text-red-400">
        <span aria-hidden="true">↓</span>
        <span className="sr-only">Ranking declined</span>
      </span>
    );
  }
  if (trend === 'new') {
    return (
      <Badge className="!border-0 !px-0 !py-0 !text-[10px] !font-normal text-blue-400">
        <span aria-hidden="true">new</span>
        <span className="sr-only">New keyword</span>
      </Badge>
    );
  }
  return (
    <span className="text-neutral-600">
      <span aria-hidden="true">→</span>
      <span className="sr-only">Ranking stable</span>
    </span>
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
      containerClassName="overflow-x-auto"
      tableClassName="w-full text-xs"
      headRowClassName="text-neutral-600 border-b border-neutral-800"
      bodyClassName=""
      rowClassName="border-b border-neutral-800/50 hover:bg-neutral-800/30"
    />
  );
}
