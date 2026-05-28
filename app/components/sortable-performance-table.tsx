'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { TextButton } from '@/components/ui';
import { DataTable, type DataTableColumn } from './data-table';
import { TrendBadge } from './trend-badge';
import { CopyButton } from './copy-button';
import { PerformanceSourceBadge } from './performance-source-badge';
import { ProviderErrorBadge } from './provider-error-badge';
import { formatBounce, formatDuration } from '@/lib/format';
import type { PerformanceSource } from '@/lib/performance-site';

export type PerformanceRow = {
  id: string;
  name: string;
  domain: string;
  users: number;
  prevUsers: number;
  sessions: number;
  views: number;
  bounceRate: number | null;   // fraction 0-1
  avgSessionDuration: number | null;  // seconds
  scClicks: number | null;
  scPosition: number | null;
  hasData: boolean;
  ga4Error?: boolean;
  scError?: boolean;
  cwvSource?: PerformanceSource;
};

type SortKey = 'name' | 'users' | 'sessions' | 'views' | 'bounceRate' | 'avgSessionDuration' | 'scClicks' | 'scPosition';

const COLUMNS: { key: SortKey; label: string; defaultDir: 'asc' | 'desc'; className?: string }[] = [
  { key: 'users',             label: 'Users',       defaultDir: 'desc' },
  { key: 'sessions',          label: 'Sessions',    defaultDir: 'desc' },
  { key: 'views',             label: 'Views',       defaultDir: 'desc' },
  { key: 'bounceRate',        label: 'Bounce',      defaultDir: 'asc',  className: 'hidden md:table-cell' },
  { key: 'avgSessionDuration',label: 'Avg Duration',defaultDir: 'desc', className: 'hidden md:table-cell' },
  { key: 'scClicks',          label: 'SC Clicks',   defaultDir: 'desc' },
  { key: 'scPosition',        label: 'SC Position', defaultDir: 'asc',  className: 'hidden md:table-cell' },
];

function SortIcon({ active, dir }: { active: boolean; dir: 'asc' | 'desc' }) {
  if (!active) return (
    <svg aria-hidden="true" className="inline ml-1 opacity-25" width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
      <path d="M5 2l3 3H2l3-3zm0 6L2 5h6L5 8z" />
    </svg>
  );
  return (
    <svg aria-hidden="true" className="inline ml-1 text-emerald-400" width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
      {dir === 'desc'
        ? <path d="M2 3h6L5 7 2 3z" />
        : <path d="M2 7h6L5 3l-3 4z" />}
    </svg>
  );
}

export function SortablePerformanceTable({ rows }: { rows: PerformanceRow[] }) {
  const [sortKey, setSortKey] = useState<SortKey>('users');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const getNextSortDir = (key: SortKey, defaultDir: 'asc' | 'desc') =>
    key === sortKey ? (sortDir === 'asc' ? 'desc' : 'asc') : defaultDir;

  const handleSort = (key: SortKey, defaultDir: 'asc' | 'desc') => {
    if (key === sortKey) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir(defaultDir);
    }
  };

  const sorted = useMemo(() => {
    return [...rows].sort((a, b) => {
      const aVal = a[sortKey];
      const bVal = b[sortKey];

      // Null / missing values always go last
      if (aVal === null && bVal === null) return 0;
      if (aVal === null) return 1;
      if (bVal === null) return -1;

      // position=0 means no data — push to bottom regardless of sort dir
      if (sortKey === 'scPosition') {
        if ((aVal as number) === 0 && (bVal as number) === 0) return 0;
        if ((aVal as number) === 0) return 1;
        if ((bVal as number) === 0) return -1;
      }

      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return sortDir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }
      const diff = (aVal as number) - (bVal as number);
      return sortDir === 'asc' ? diff : -diff;
    });
  }, [rows, sortKey, sortDir]);

  const maxUsers = Math.max(...rows.map(r => r.users), 1);

  const columns: DataTableColumn[] = [
    { key: 'site', label: 'Site', className: 'px-5 py-3.5 font-semibold', cellClassName: 'px-5 py-3.5' },
    ...COLUMNS.map((col) => ({
      key: col.key,
      label: (
        <TextButton
          type="button"
          className="inline-flex items-center justify-end rounded-sm !text-inherit hover:!text-neutral-300 focus:outline-none focus-visible:!text-neutral-200 focus-visible:ring-1 focus-visible:ring-emerald-500/70 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-900"
          onClick={() => handleSort(col.key, col.defaultDir)}
          title={`Sort by ${col.label}`}
          aria-label={`Sort by ${col.label} ${getNextSortDir(col.key, col.defaultDir) === 'asc' ? 'ascending' : 'descending'}`}
        >
          {col.label}
          <SortIcon active={sortKey === col.key} dir={sortDir} />
        </TextButton>
      ),
      align: 'right' as const,
      ariaSort: sortKey === col.key ? (sortDir === 'asc' ? 'ascending' as const : 'descending' as const) : undefined,
      className: `px-5 py-3.5 font-semibold text-right select-none ${col.className ?? ''} ${sortKey === col.key ? 'text-neutral-200' : ''}`,
      cellClassName: `px-5 py-3.5 text-right font-mono text-neutral-300 ${col.className ?? ''}`,
    })),
  ];

  const tableRows = sorted.map((row) => [
    <div key="site" className="flex items-start gap-2">
      <Link href={`/${encodeURIComponent(row.id)}`} className="flex min-w-0 flex-col gap-1">
        <div className="flex items-center gap-2">
          <span className="text-white font-medium">{row.name}</span>
          {row.ga4Error && <ProviderErrorBadge label="GA4 error" />}
          {row.scError && <ProviderErrorBadge label="SC error" />}
          {row.cwvSource && <PerformanceSourceBadge source={row.cwvSource} />}
        </div>
        <span className="text-neutral-600 text-xs">{row.domain}</span>
        {row.hasData ? (
          <div className="w-24 bg-neutral-800 h-1 rounded-full overflow-hidden">
            <div className="h-full bg-emerald-500/60 rounded-full" style={{ width: `${(row.users / maxUsers) * 100}%` }} />
          </div>
        ) : (
          <span className={row.ga4Error ? 'text-red-400/70 text-xs' : 'text-neutral-600 text-xs'}>
            {row.ga4Error ? 'GA4 failed' : 'No GA4 data'}
          </span>
        )}
      </Link>
      <div className="pt-[1.375rem]">
        <CopyButton text={`https://${row.domain}`} label="domain" className="text-[10px] px-1 py-0.5" />
      </div>
    </div>,
    <span key="users">
      {row.users.toLocaleString()}
      <TrendBadge current={row.users} previous={row.prevUsers} />
    </span>,
    <span key="sessions">{row.sessions.toLocaleString()}</span>,
    <span key="views">{row.views.toLocaleString()}</span>,
    row.bounceRate !== null && row.hasData ? (
      <span
        key="bounce"
        className={
          row.bounceRate < 0.4 ? 'text-emerald-400' :
          row.bounceRate < 0.7 ? 'text-amber-400' :
          'text-red-400'
        }
      >
        {formatBounce(row.bounceRate)}
      </span>
    ) : (
      <span key="bounce" className="text-neutral-600">—</span>
    ),
    row.avgSessionDuration !== null && row.hasData
      ? <span key="duration">{formatDuration(row.avgSessionDuration)}</span>
      : <span key="duration" className="text-neutral-600">—</span>,
    row.scClicks === null
      ? <span key="sc-clicks" className="text-red-400/60 text-xs">error</span>
      : row.scClicks > 0 ? <span key="sc-clicks">{row.scClicks.toLocaleString()}</span> : <span key="sc-clicks" className="text-neutral-600">—</span>,
    row.scPosition === null ? (
      <span key="sc-position" className="text-red-400/60 text-xs">error</span>
    ) : row.scPosition > 0 ? (
      <span
        key="sc-position"
        className={
          row.scPosition <= 3 ? 'text-emerald-400' :
          row.scPosition <= 10 ? 'text-amber-400' :
          'text-neutral-300'
        }
      >
        {row.scPosition}
      </span>
    ) : (
      <span key="sc-position" className="text-neutral-600">—</span>
    ),
  ]);

  return (
    <DataTable
      columns={columns}
      rows={tableRows}
      rowKeys={sorted.map((row) => row.id)}
      monospaceCells={false}
      containerClassName="bg-neutral-900 rounded-lg border border-neutral-800 overflow-hidden"
      headRowClassName="border-b border-neutral-800 text-neutral-500 text-left text-xs uppercase tracking-wider"
      rowClassName={(_, idx) => {
        const row = sorted[idx];
        const hasProviderError = row.ga4Error || row.scError;
        return `transition-colors ${row.hasData || hasProviderError ? 'hover:bg-neutral-800/30 cursor-pointer' : 'opacity-40'} ${idx === 0 && row.hasData ? 'border-l-2 border-l-emerald-500' : ''}`;
      }}
    />
  );
}
