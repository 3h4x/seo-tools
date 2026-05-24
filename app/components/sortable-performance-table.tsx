'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { TrendBadge } from './trend-badge';
import { CopyButton } from './copy-button';
import { formatBounce, formatDuration } from '@/lib/format';

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

  return (
    <div className="bg-neutral-900 rounded-lg border border-neutral-800 overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-neutral-800 text-neutral-500 text-left text-xs uppercase tracking-wider">
            <th className="px-5 py-3.5 font-semibold">Site</th>
            {COLUMNS.map(col => (
              <th
                key={col.key}
                aria-sort={sortKey === col.key ? (sortDir === 'asc' ? 'ascending' : 'descending') : undefined}
                className={`px-5 py-3.5 font-semibold text-right select-none ${col.className ?? ''} ${sortKey === col.key ? 'text-neutral-200' : ''}`}
              >
                <button
                  type="button"
                  className="inline-flex items-center justify-end rounded-sm text-inherit transition-colors hover:text-neutral-300 focus:outline-none focus-visible:text-neutral-200 focus-visible:ring-1 focus-visible:ring-emerald-500/70 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-900"
                  onClick={() => handleSort(col.key, col.defaultDir)}
                  title={`Sort by ${col.label}`}
                  aria-label={`Sort by ${col.label} ${getNextSortDir(col.key, col.defaultDir) === 'asc' ? 'ascending' : 'descending'}`}
                >
                  {col.label}
                  <SortIcon active={sortKey === col.key} dir={sortDir} />
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-800">
          {sorted.map((row, idx) => (
            <tr
              key={row.id}
              className={`transition-colors ${row.hasData ? 'hover:bg-neutral-800/30 cursor-pointer' : 'opacity-40'} ${idx === 0 && row.hasData ? 'border-l-2 border-l-emerald-500' : ''}`}
            >
              <td className="px-5 py-3.5">
                <Link href={`/${encodeURIComponent(row.id)}`} className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <span className="text-white font-medium">{row.name}</span>
                    <div className="flex items-center gap-1.5">
                      <span className="text-neutral-600 text-xs">{row.domain}</span>
                      <CopyButton text={`https://${row.domain}`} label="domain" className="text-[10px] px-1 py-0.5" />
                    </div>
                  </div>
                  {row.hasData ? (
                    <div className="w-24 bg-neutral-800 h-1 rounded-full overflow-hidden">
                      <div className="h-full bg-emerald-500/60 rounded-full" style={{ width: `${(row.users / maxUsers) * 100}%` }} />
                    </div>
                  ) : (
                    <span className="text-neutral-600 text-xs">No GA4 data</span>
                  )}
                </Link>
              </td>
              <td className="px-5 py-3.5 text-right font-mono text-neutral-300">
                {row.users.toLocaleString()}
                <TrendBadge current={row.users} previous={row.prevUsers} />
              </td>
              <td className="px-5 py-3.5 text-right font-mono text-neutral-300">
                {row.sessions.toLocaleString()}
              </td>
              <td className="px-5 py-3.5 text-right font-mono text-neutral-300">
                {row.views.toLocaleString()}
              </td>
              <td className="px-5 py-3.5 text-right font-mono hidden md:table-cell">
                {row.bounceRate !== null && row.hasData ? (
                  <span className={
                    row.bounceRate < 0.4 ? 'text-emerald-400' :
                    row.bounceRate < 0.7 ? 'text-amber-400' :
                    'text-red-400'
                  }>
                    {formatBounce(row.bounceRate)}
                  </span>
                ) : (
                  <span className="text-neutral-600">—</span>
                )}
              </td>
              <td className="px-5 py-3.5 text-right font-mono text-neutral-300 hidden md:table-cell">
                {row.avgSessionDuration !== null && row.hasData
                  ? formatDuration(row.avgSessionDuration)
                  : <span className="text-neutral-600">—</span>}
              </td>
              <td className="px-5 py-3.5 text-right font-mono text-neutral-300">
                {row.scClicks === null
                  ? <span className="text-red-400/60 text-xs">error</span>
                  : row.scClicks > 0 ? row.scClicks.toLocaleString() : <span className="text-neutral-600">—</span>}
              </td>
              <td className="px-5 py-3.5 text-right font-mono hidden md:table-cell">
                {row.scPosition === null
                  ? <span className="text-red-400/60 text-xs">error</span>
                  : row.scPosition > 0 ? (
                    <span className={
                      row.scPosition <= 3 ? 'text-emerald-400' :
                      row.scPosition <= 10 ? 'text-amber-400' :
                      'text-neutral-300'
                    }>
                      {row.scPosition}
                    </span>
                  ) : (
                    <span className="text-neutral-600">—</span>
                  )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
