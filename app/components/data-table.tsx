import type { ReactNode } from 'react';

export interface DataTableColumn {
  label: string;
  align?: 'left' | 'right';
  className?: string;
  cellClassName?: string;
  rowHeader?: boolean;
}

interface DataTableProps {
  columns: DataTableColumn[];
  rows: ReactNode[][];
  rowKeys?: Array<string | number>;
  monospaceCells?: boolean;
  tableClassName?: string;
  containerClassName?: string;
  headClassName?: string;
  headRowClassName?: string;
  bodyClassName?: string;
  rowClassName?: string;
}

export function DataTable({
  columns,
  rows,
  rowKeys,
  monospaceCells = true,
  tableClassName = 'w-full text-sm',
  containerClassName = 'overflow-hidden rounded border border-neutral-800',
  headClassName,
  headRowClassName = 'border-b border-neutral-800 text-neutral-500',
  bodyClassName = 'divide-y divide-neutral-800',
  rowClassName = 'hover:bg-neutral-800/30',
}: DataTableProps) {
  const joinClassNames = (...parts: Array<string | undefined>) => [...new Set(parts.flatMap((part) => (part ? part.split(/\s+/) : [])))].join(' ');
  const hasFontWeightClass = (className: string) => /\bfont-(?:thin|extralight|light|normal|medium|semibold|bold|extrabold|black)\b/.test(className);

  const getAlignedClassName = (baseClassName: string | undefined, align?: DataTableColumn['align']) =>
    joinClassNames(baseClassName ?? 'px-3 py-2', align === 'right' ? 'text-right' : 'text-left');

  const getCellClassName = (column: DataTableColumn | undefined) => {
    const baseClassName = column?.cellClassName ?? column?.className ?? 'px-3 py-2';

    return joinClassNames(
      baseClassName,
      column?.rowHeader && !hasFontWeightClass(baseClassName) ? 'font-normal' : undefined,
      monospaceCells ? 'font-mono' : undefined,
      column?.align === 'right' ? 'text-right' : undefined,
    );
  };

  return (
    <div className={containerClassName}>
      <table className={tableClassName}>
        <thead className={headClassName}>
          <tr className={headRowClassName}>
            {columns.map((col, i) => (
              <th
                key={`${col.label}-${i}`}
                scope="col"
                className={getAlignedClassName(col.className ?? 'px-3 py-2 font-semibold', col.align)}
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className={bodyClassName}>
          {rows.map((cells, i) => (
            <tr key={rowKeys?.[i] ?? i} className={rowClassName}>
              {cells.map((cell, j) => {
                const column = columns[j];
                const className = getCellClassName(column);

                if (column?.rowHeader) {
                  return (
                    <th
                      key={j}
                      scope="row"
                      className={className}
                    >
                      {cell}
                    </th>
                  );
                }

                return (
                  <td
                    key={j}
                    className={className}
                  >
                    {cell}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
