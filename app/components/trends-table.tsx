import React from 'react';

interface TrendsTableProps {
  title: string;
  columns: Array<{ label: string; align?: 'left' | 'right' }>;
  rows: React.ReactNode[][];
}

export function TrendsTable({ title, columns, rows }: TrendsTableProps) {
  return (
    <div>
      <h3 className="text-neutral-500 text-xs uppercase tracking-wider mb-2 font-semibold">{title}</h3>
      <div className="overflow-hidden rounded border border-neutral-800 max-h-64 overflow-y-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-neutral-900">
            <tr className="border-b border-neutral-800 text-neutral-500">
              {columns.map((col, i) => (
                <th key={i} className={`px-3 py-2 font-semibold ${col.align === 'right' ? 'text-right' : 'text-left'}`}>
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-800">
            {rows.map((cells, i) => (
              <tr key={i} className="hover:bg-neutral-800/30">
                {cells.map((cell, j) => (
                  <td key={j} className={`px-3 py-2 font-mono ${columns[j]?.align === 'right' ? 'text-right' : ''}`}>
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
