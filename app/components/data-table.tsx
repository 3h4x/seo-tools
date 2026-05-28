import type { ReactNode } from 'react';

const FONT_WEIGHT_CLASS_RE = /\bfont-(?:thin|extralight|light|normal|medium|semibold|bold|extrabold|black)\b/;
const TEXT_ALIGN_CLASS_RE = /\btext-(?:left|center|right|justify|start|end)\b/;

function joinClassNames(...parts: Array<string | undefined>) {
  return [...new Set(parts.flatMap((part) => (part ? part.split(/\s+/) : [])))].join(' ');
}

function hasFontWeightClass(className: string) {
  return FONT_WEIGHT_CLASS_RE.test(className);
}

function hasTextAlignClass(className: string) {
  return TEXT_ALIGN_CLASS_RE.test(className);
}

export interface DataTableColumn {
  label: ReactNode;
  key?: string;
  align?: 'left' | 'right';
  className?: string;
  cellClassName?: string;
  rowHeader?: boolean;
  ariaSort?: 'ascending' | 'descending' | 'none' | 'other';
}

interface DataTableProps {
  columns: DataTableColumn[];
  rows: ReactNode[][];
  caption?: ReactNode;
  rowKeys?: Array<string | number>;
  monospaceCells?: boolean;
  tableClassName?: string;
  containerClassName?: string;
  headClassName?: string;
  headRowClassName?: string;
  bodyClassName?: string;
  rowClassName?: string | ((row: ReactNode[], index: number) => string);
}

export function DataTable({
  columns,
  rows,
  caption,
  rowKeys,
  monospaceCells = true,
  tableClassName = 'w-full text-sm',
  containerClassName = 'overflow-hidden rounded border border-neutral-800',
  headClassName,
  headRowClassName = 'border-b border-neutral-800 text-neutral-500',
  bodyClassName = 'divide-y divide-neutral-800',
  rowClassName = 'hover:bg-neutral-800/30',
}: DataTableProps) {
  const getHeaderClassName = (column: DataTableColumn) => {
    const baseClassName = column.className ?? 'px-3 py-2 font-semibold';
    const alignmentClass = hasTextAlignClass(baseClassName)
      ? undefined
      : column.align === 'right'
        ? 'text-right'
        : column.align === 'left' || column.rowHeader || !column.className
          ? 'text-left'
          : undefined;

    return joinClassNames(baseClassName, alignmentClass);
  };

  const getCellClassName = (column: DataTableColumn | undefined) => {
    const baseClassName = column?.cellClassName ?? column?.className ?? 'px-3 py-2';
    const alignmentClass = hasTextAlignClass(baseClassName)
      ? undefined
      : column?.align === 'right'
        ? 'text-right'
        : column?.align === 'left' || column?.rowHeader
          ? 'text-left'
          : undefined;

    return joinClassNames(
      baseClassName,
      column?.rowHeader && !hasFontWeightClass(baseClassName) ? 'font-normal' : undefined,
      monospaceCells ? 'font-mono' : undefined,
      alignmentClass,
    );
  };

  return (
    <div className={containerClassName}>
      <table className={tableClassName}>
        {caption != null && <caption className="sr-only">{caption}</caption>}
        <thead className={headClassName}>
          <tr className={headRowClassName}>
            {columns.map((col, i) => (
              <th
                key={col.key ?? `${String(col.label)}-${i}`}
                scope="col"
                aria-sort={col.ariaSort}
                className={getHeaderClassName(col)}
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className={bodyClassName}>
          {rows.map((cells, i) => (
            <tr key={rowKeys?.[i] ?? i} className={typeof rowClassName === 'function' ? rowClassName(cells, i) : rowClassName}>
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
