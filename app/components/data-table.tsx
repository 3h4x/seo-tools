import type { ReactNode } from 'react';

export interface DataTableColumn {
  label: string;
  align?: 'left' | 'right';
  className?: string;
  cellClassName?: string;
}

interface DataTableProps {
  columns: DataTableColumn[];
  rows: ReactNode[][];
  tableClassName?: string;
  containerClassName?: string;
  headClassName?: string;
  headRowClassName?: string;
  rowClassName?: string;
}

export function DataTable({
  columns,
  rows,
  tableClassName = 'w-full text-sm',
  containerClassName = 'overflow-hidden rounded border border-neutral-800',
  headClassName,
  headRowClassName = 'border-b border-neutral-800 text-neutral-500',
  rowClassName = 'hover:bg-neutral-800/30',
}: DataTableProps) {
  return (
    <div className={containerClassName}>
      <table className={tableClassName}>
        <thead className={headClassName}>
          <tr className={headRowClassName}>
            {columns.map((col, i) => (
              <th
                key={`${col.label}-${i}`}
                className={`${col.className ?? 'px-3 py-2 font-semibold'} ${col.align === 'right' ? 'text-right' : 'text-left'}`}
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-800">
          {rows.map((cells, i) => (
            <tr key={i} className={rowClassName}>
              {cells.map((cell, j) => (
                <td
                  key={j}
                  className={`${columns[j]?.cellClassName ?? columns[j]?.className ?? 'px-3 py-2'} font-mono ${columns[j]?.align === 'right' ? 'text-right' : ''}`}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
