'use client';

import { useState } from 'react';
import { FormButton, Notice, Surface } from '@/components/ui';
import { PositionBadge } from './position-badge';
import { DataTable, type DataTableColumn } from './data-table';

type Row = Record<string, string | number | null | undefined>;

function toCSV(rows: Row[]): string {
  if (rows.length === 0) return '';
  const headers = Object.keys(rows[0]);
  const escape = (v: string | number | null | undefined): string => {
    const s = v === null || v === undefined ? '' : String(v);
    if (s.includes(',') || s.includes('\n') || s.includes('"')) {
      return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  };
  const lines = [
    headers.map(escape).join(','),
    ...rows.map(row => headers.map(h => escape(row[h])).join(',')),
  ];
  return lines.join('\n');
}

function ExportButton({ data, filename, label = 'Export CSV' }: {
  data: Row[];
  filename: string;
  label?: string;
}) {
  const [done, setDone] = useState(false);

  const handleExport = () => {
    const csv = toCSV(data);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setDone(true);
    setTimeout(() => setDone(false), 2000);
  };

  return (
    <FormButton
      onClick={handleExport}
      title={`Download ${filename} as CSV`}
      size="xs"
      variant={done ? 'success' : 'muted'}
      className={[
        'inline-flex items-center gap-1.5 !px-2 !py-1 !text-[10px] font-medium !rounded border',
        done ? 'border-emerald-500/20' : 'border-neutral-700 hover:border-neutral-600',
      ].join(' ')}
    >
      <span className="sr-only" role="status" aria-live="polite">
        {done ? `Saved ${filename}` : ''}
      </span>
      {done ? (
        <>
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" className="shrink-0">
            <path d="M2 5l2.5 2.5L8 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Saved
        </>
      ) : (
        <>
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" className="shrink-0">
            <path d="M5 1v5.5M2.5 4.5L5 7l2.5-2.5M2 8.5h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          {label}
        </>
      )}
    </FormButton>
  );
}

interface ScTableRow {
  label: string;
  title?: string;
  clicks: number;
  impressions: number;
  ctr?: number;
  position: number;
}

interface ScTableProps {
  heading: string;
  columnLabel: string;
  rows: ScTableRow[];
  emptyMessage: string;
  exportData?: Record<string, string | number>[];
  filename?: string;
}

export function ScTable({ heading, columnLabel, rows, emptyMessage, exportData, filename }: ScTableProps) {
  const showCtr = rows.some(r => r.ctr !== undefined);
  const columns: DataTableColumn[] = [
    { label: columnLabel, rowHeader: true, className: 'px-4 py-3 font-semibold', cellClassName: 'px-4 py-2.5 text-neutral-300 text-xs truncate max-w-[200px]' },
    { label: 'Clicks', align: 'right', className: 'px-4 py-3 font-semibold', cellClassName: 'px-4 py-2.5 text-neutral-300' },
    { label: 'Impr', align: 'right', className: 'px-4 py-3 font-semibold hidden md:table-cell', cellClassName: 'px-4 py-2.5 text-neutral-400 hidden md:table-cell' },
    ...(showCtr
      ? [{ label: 'CTR', align: 'right', className: 'px-4 py-3 font-semibold hidden md:table-cell', cellClassName: 'px-4 py-2.5 text-neutral-400 hidden md:table-cell' } satisfies DataTableColumn]
      : []),
    { label: 'Pos', align: 'right', className: 'px-4 py-3 font-semibold', cellClassName: 'px-4 py-2.5' },
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-xs uppercase tracking-wider text-neutral-500 font-semibold">{heading}</h2>
        {exportData && exportData.length > 0 && filename && (
          <ExportButton data={exportData} filename={filename} />
        )}
      </div>
      {rows.length > 0 ? (
        <Surface padding="none" className="overflow-hidden">
          <DataTable
            columns={columns}
            rows={rows.map((row) => [
              <span key="label" title={row.title}>{row.label}</span>,
              <span key="clicks">{row.clicks.toLocaleString()}</span>,
              <span key="impressions">{row.impressions.toLocaleString()}</span>,
              ...(showCtr ? [<span key="ctr">{row.ctr !== undefined ? `${(row.ctr * 100).toFixed(1)}%` : '—'}</span>] : []),
              <PositionBadge key="position" position={row.position} />,
            ])}
            containerClassName="overflow-hidden"
            tableClassName="w-full text-sm"
            headRowClassName="border-b border-neutral-800 text-neutral-500 text-xs uppercase tracking-wider"
            rowClassName="hover:bg-neutral-800/30 transition-colors"
          />
        </Surface>
      ) : (
        <Notice size="sm" className="text-neutral-600">{emptyMessage}</Notice>
      )}
    </div>
  );
}
