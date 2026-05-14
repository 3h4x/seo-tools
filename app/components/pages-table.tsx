'use client';

import { useState } from 'react';
import { PositionBadge } from './position-badge';
import type { PageOpportunityRow } from '@/lib/page-opportunities';
import type { CheckStatus } from '@/lib/audit';

type SortKey = 'clicks' | 'impressions' | 'ctr' | 'position' | 'issueCount' | 'opportunityScore';

const STATUS_STYLES: Record<CheckStatus, string> = {
  pass: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400',
  warn: 'border-amber-500/30 bg-amber-500/10 text-amber-400',
  fail: 'border-red-500/30 bg-red-500/10 text-red-400',
  error: 'border-neutral-700 bg-neutral-800 text-neutral-400',
};

function pathname(url: string) {
  try {
    return new URL(url).pathname;
  } catch {
    return url;
  }
}

function sortRows(rows: PageOpportunityRow[], sortKey: SortKey, descending: boolean) {
  return [...rows].sort((a, b) => {
    const direction = descending ? -1 : 1;
    const aValue = a[sortKey];
    const bValue = b[sortKey];

    if (typeof aValue === 'number' && typeof bValue === 'number') {
      if (aValue === bValue) return a.page.localeCompare(b.page);
      return (aValue - bValue) * direction;
    }

    return a.page.localeCompare(b.page) * direction;
  });
}

function SortButton({
  active,
  descending,
  label,
  onClick,
}: {
  active: boolean;
  descending: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1 transition-colors ${active ? 'text-neutral-200' : 'hover:text-neutral-300'}`}
    >
      <span>{label}</span>
      <span className="text-[10px]">{active ? (descending ? '▼' : '▲') : '↕'}</span>
    </button>
  );
}

function StatusPill({ label, status }: { label: string; status: CheckStatus }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${STATUS_STYLES[status]}`}>
      {label}
    </span>
  );
}

export function PagesTable({
  rows,
  days,
}: {
  rows: PageOpportunityRow[];
  days: number;
}) {
  const [sortKey, setSortKey] = useState<SortKey>('clicks');
  const [descending, setDescending] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const sortedRows = sortRows(rows, sortKey, descending);

  function toggleSort(nextKey: SortKey) {
    if (nextKey === sortKey) {
      setDescending((current) => !current);
      return;
    }

    setSortKey(nextKey);
    setDescending(nextKey !== 'position');
  }

  function toggleRow(page: string) {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(page)) next.delete(page);
      else next.add(page);
      return next;
    });
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3 gap-4">
        <div>
          <h2 className="text-xs uppercase tracking-wider text-neutral-500 font-semibold">Pages</h2>
          <p className="text-[11px] text-neutral-600 mt-1">
            Search Console pages joined with live meta checks for the last {days} days.
          </p>
        </div>
        <div className="text-[11px] text-neutral-600">
          {rows.filter((row) => row.quickWin).length} quick wins
        </div>
      </div>
      {rows.length === 0 ? (
        <p className="text-neutral-600 text-sm">No Search Console page data available.</p>
      ) : (
        <div className="bg-neutral-900 rounded-lg border border-neutral-800 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-800 text-neutral-500 text-[11px] uppercase tracking-wider">
                <th className="px-4 py-3 font-semibold text-left">Page</th>
                <th className="px-4 py-3 font-semibold text-right">
                  <SortButton active={sortKey === 'clicks'} descending={descending} label="Clicks" onClick={() => toggleSort('clicks')} />
                </th>
                <th className="px-4 py-3 font-semibold text-right hidden md:table-cell">
                  <SortButton active={sortKey === 'impressions'} descending={descending} label="Impr" onClick={() => toggleSort('impressions')} />
                </th>
                <th className="px-4 py-3 font-semibold text-right hidden md:table-cell">
                  <SortButton active={sortKey === 'ctr'} descending={descending} label="CTR" onClick={() => toggleSort('ctr')} />
                </th>
                <th className="px-4 py-3 font-semibold text-right">
                  <SortButton active={sortKey === 'position'} descending={descending} label="Pos" onClick={() => toggleSort('position')} />
                </th>
                <th className="px-4 py-3 font-semibold text-right">
                  <SortButton active={sortKey === 'issueCount'} descending={descending} label="Issues" onClick={() => toggleSort('issueCount')} />
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedRows.map((row) => {
                const isOpen = expanded.has(row.page);
                return (
                  <FragmentRow
                    key={row.page}
                    row={row}
                    isOpen={isOpen}
                    onToggle={() => toggleRow(row.page)}
                  />
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function FragmentRow({
  row,
  isOpen,
  onToggle,
}: {
  row: PageOpportunityRow;
  isOpen: boolean;
  onToggle: () => void;
}) {
  return (
    <>
      <tr
        className={`border-b border-neutral-800/50 transition-colors cursor-pointer ${row.quickWin ? 'bg-amber-500/5 hover:bg-amber-500/10' : 'hover:bg-neutral-800/30'}`}
        onClick={onToggle}
      >
        <td className="px-4 py-3 text-neutral-300 text-xs max-w-[260px]">
          <div className="flex items-start gap-2">
            <span className={`mt-0.5 text-[10px] text-neutral-600 transition-transform ${isOpen ? 'rotate-90' : ''}`}>▶</span>
            <div className="min-w-0">
              <div className="truncate font-mono" title={row.page}>{pathname(row.page)}</div>
              <div className="flex flex-wrap items-center gap-1.5 mt-1">
                {row.quickWin && (
                  <span className="inline-flex items-center rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-300">
                    Quick win
                  </span>
                )}
                <StatusPill label="Title" status={row.checks.title.status} />
                <StatusPill label="Desc" status={row.checks.description.status} />
                <StatusPill label="OG" status={row.checks.ogImage.status} />
                <StatusPill label="Canon" status={row.checks.canonical.status} />
              </div>
            </div>
          </div>
        </td>
        <td className="px-4 py-3 text-right text-neutral-300 font-mono">{row.clicks.toLocaleString()}</td>
        <td className="px-4 py-3 text-right text-neutral-400 font-mono hidden md:table-cell">{row.impressions.toLocaleString()}</td>
        <td className="px-4 py-3 text-right text-neutral-400 font-mono hidden md:table-cell">{(row.ctr * 100).toFixed(1)}%</td>
        <td className="px-4 py-3 text-right"><PositionBadge position={row.position} /></td>
        <td className="px-4 py-3 text-right font-mono">
          <span className={row.issueCount > 0 ? 'text-amber-300' : 'text-emerald-400'}>{row.issueCount}</span>
        </td>
      </tr>
      {isOpen && (
        <tr className="bg-neutral-950/60">
          <td colSpan={6} className="px-6 py-4">
            <div className="grid gap-3 lg:grid-cols-2">
              <CheckDetail label="Title" message={row.checks.title.message} status={row.checks.title.status} />
              <CheckDetail label="Description" message={row.checks.description.message} status={row.checks.description.status} />
              <CheckDetail label="OG image" message={row.checks.ogImage.message} status={row.checks.ogImage.status} />
              <CheckDetail label="Canonical" message={row.checks.canonical.message} status={row.checks.canonical.status} />
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function CheckDetail({
  label,
  message,
  status,
}: {
  label: string;
  message: string;
  status: CheckStatus;
}) {
  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-900/70 px-3 py-2">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[11px] uppercase tracking-wider text-neutral-500">{label}</span>
        <StatusPill label={status} status={status} />
      </div>
      <p className="mt-2 text-xs text-neutral-300">{message}</p>
    </div>
  );
}
