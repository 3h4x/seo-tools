'use client';

import { useState } from 'react';
import { PositionBadge } from './position-badge';

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
    <button
      onClick={handleExport}
      title={`Download ${filename} as CSV`}
      className={`inline-flex items-center gap-1.5 text-[10px] font-medium px-2 py-1 rounded border transition-colors ${
        done
          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
          : 'bg-neutral-800 text-neutral-400 border-neutral-700 hover:text-neutral-200 hover:border-neutral-600'
      }`}
    >
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
    </button>
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
  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-xs uppercase tracking-wider text-neutral-500 font-semibold">{heading}</h2>
        {exportData && exportData.length > 0 && filename && (
          <ExportButton data={exportData} filename={filename} />
        )}
      </div>
      {rows.length > 0 ? (
        <div className="bg-neutral-900 rounded-lg border border-neutral-800 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-800 text-neutral-500 text-left text-xs uppercase tracking-wider">
                <th className="px-4 py-3 font-semibold">{columnLabel}</th>
                <th className="px-4 py-3 font-semibold text-right">Clicks</th>
                <th className="px-4 py-3 font-semibold text-right hidden md:table-cell">Impr</th>
                {showCtr && <th className="px-4 py-3 font-semibold text-right hidden md:table-cell">CTR</th>}
                <th className="px-4 py-3 font-semibold text-right">Pos</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-800">
              {rows.map((row, i) => (
                <tr key={i} className="hover:bg-neutral-800/30 transition-colors">
                  <td className="px-4 py-2.5 text-neutral-300 font-mono text-xs truncate max-w-[200px]" title={row.title}>{row.label}</td>
                  <td className="px-4 py-2.5 text-right text-neutral-300 font-mono">{row.clicks.toLocaleString()}</td>
                  <td className="px-4 py-2.5 text-right text-neutral-400 font-mono hidden md:table-cell">{row.impressions.toLocaleString()}</td>
                  {showCtr && <td className="px-4 py-2.5 text-right text-neutral-400 font-mono hidden md:table-cell">{row.ctr !== undefined ? `${(row.ctr * 100).toFixed(1)}%` : '—'}</td>}
                  <td className="px-4 py-2.5 text-right"><PositionBadge position={row.position} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-neutral-600 text-sm">{emptyMessage}</p>
      )}
    </div>
  );
}
