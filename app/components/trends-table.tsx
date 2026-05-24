import React from 'react';
import { DataTable, type DataTableColumn } from './data-table';

interface TrendsTableProps {
  title: string;
  columns: DataTableColumn[];
  rows: React.ReactNode[][];
}

export function TrendsTable({ title, columns, rows }: TrendsTableProps) {
  const tableColumns = columns.map((column, index) => (
    index === 0 ? { ...column, rowHeader: true } : column
  ));

  return (
    <div>
      <h3 className="text-neutral-500 text-xs uppercase tracking-wider mb-2 font-semibold">{title}</h3>
      <DataTable
        columns={tableColumns}
        rows={rows}
        tableClassName="w-full text-xs"
        containerClassName="overflow-hidden rounded border border-neutral-800 max-h-64 overflow-y-auto"
        headClassName="sticky top-0 bg-neutral-900"
        headRowClassName="border-b border-neutral-800 text-neutral-500"
      />
    </div>
  );
}
