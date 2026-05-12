import Link from 'next/link';
import { type ReactNode } from 'react';
import { type DecaySeverity } from '@/lib/decay';
import { MetricCard } from './metric-card';
import TimeRange from './time-range';
import { DataTable, type DataTableColumn } from './data-table';

type DecayPage = {
  page: string;
  siteId: string;
  domain: string;
  severity: DecaySeverity;
  currentClicks: number;
  previousClicks: number;
  clicksDelta: number;
  currentImpressions: number;
  previousImpressions: number;
  impressionsDelta: number;
  currentPosition: number;
  previousPosition: number;
  positionDelta: number;
};

type DecayResult = {
  siteId: string;
  domain: string;
  decayingPages: DecayPage[];
  totalPages: number;
};

const DECAY_SEVERITY_COLORS: Record<DecaySeverity, { badge: string; badgeBg: string }> = {
  severe: { badge: 'text-red-400', badgeBg: 'bg-red-500/10' },
  moderate: { badge: 'text-amber-400', badgeBg: 'bg-amber-500/10' },
  mild: { badge: 'text-blue-400', badgeBg: 'bg-blue-500/10' },
};

const DECAY_TABLE_COLUMNS: DataTableColumn[] = [
  { label: 'Site', className: 'px-4 py-3 font-semibold', cellClassName: 'px-4 py-2.5 text-neutral-400 text-xs' },
  { label: 'Page', className: 'px-4 py-3 font-semibold', cellClassName: 'px-4 py-2.5 text-neutral-300 text-xs truncate max-w-[200px]' },
  { label: 'Clicks', align: 'right', className: 'px-4 py-3 font-semibold', cellClassName: 'px-4 py-2.5 text-right' },
  { label: 'Impressions', align: 'right', className: 'px-4 py-3 font-semibold hidden md:table-cell', cellClassName: 'px-4 py-2.5 text-right hidden md:table-cell' },
  { label: 'Position', align: 'right', className: 'px-4 py-3 font-semibold hidden md:table-cell', cellClassName: 'px-4 py-2.5 text-right hidden md:table-cell' },
  { label: 'Severity', align: 'right', className: 'px-4 py-3 font-semibold', cellClassName: 'px-4 py-2.5 text-right' },
];

export function DecaySection({
  period,
  decayResults,
  siteCount,
  title = 'Content Decay',
  description,
}: {
  period: 7 | 30;
  decayResults: DecayResult[];
  siteCount: number;
  title?: string;
  description?: ReactNode;
}) {
  const allDecaying = decayResults.flatMap((result) => result.decayingPages);
  const severeCount = allDecaying.filter((page) => page.severity === 'severe').length;
  const decaySitesAffected = new Set(allDecaying.map((page) => page.siteId)).size;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-lg font-bold text-white">{title}</h2>
          <p className="text-neutral-500 text-sm mt-1">
            {description ?? <>Pages losing traffic · {period}-day comparison</>}
          </p>
        </div>
        <TimeRange param="period" options={[{ value: '7', label: '7d' }, { value: '30', label: '30d' }]} />
      </div>

      {siteCount === 0 ? (
        <div className="bg-neutral-900 rounded-lg border border-neutral-800 p-6 text-sm text-neutral-500">
          No sites configured — <Link href="/config" className="text-white underline">add sites in the Config tab</Link>.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-4">
            <MetricCard label="Decaying Pages" current={allDecaying.length} accent="border-l-red-500" valueColor="text-red-400" />
            <MetricCard label="Severe" current={severeCount} accent="border-l-amber-500" valueColor="text-amber-400" />
            <MetricCard label="Sites Affected" current={decaySitesAffected} accent="border-l-blue-500" valueColor="text-blue-400" />
          </div>

          {allDecaying.length === 0 ? (
            <div className="bg-neutral-900 rounded-lg border border-neutral-800 border-l-4 border-l-emerald-500 p-8 text-center">
              <svg className="size-12 mx-auto text-emerald-500 mb-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                <polyline points="22 4 12 14.01 9 11.01" />
              </svg>
              <p className="text-emerald-400 font-bold text-lg">All clear — no content decay</p>
              <p className="text-neutral-500 text-sm mt-2 max-w-md mx-auto">
                Every page across all {decayResults.length} sites is maintaining or growing traffic over the last {period} days.
              </p>
            </div>
          ) : (
            <DataTable
              columns={DECAY_TABLE_COLUMNS}
              rows={allDecaying.map((page) => {
                let shortPage = page.page;
                try { shortPage = new URL(page.page).pathname; } catch {}
                const colors = DECAY_SEVERITY_COLORS[page.severity];
                return [
                  <span key="site">{page.domain}</span>,
                  <span key="page" title={page.page}>{shortPage}</span>,
                  <span key="clicks">
                    <span className="text-neutral-300">{page.currentClicks}</span>
                    <span className="text-red-400 text-[10px] ml-1">{page.clicksDelta}%</span>
                  </span>,
                  <span key="impressions">
                    <span className="text-neutral-400">{page.currentImpressions}</span>
                    <span className="text-red-400 text-[10px] ml-1">{page.impressionsDelta}%</span>
                  </span>,
                  <span key="position">
                    <span className="text-neutral-400">{page.currentPosition.toFixed(1)}</span>
                    {page.positionDelta > 0 && <span className="text-red-400 text-[10px] ml-1">+{page.positionDelta}</span>}
                  </span>,
                  <span key="severity" className={`${colors.badgeBg} ${colors.badge} inline-flex px-2 py-0.5 rounded-full text-[10px] font-medium uppercase`}>
                    {page.severity}
                  </span>,
                ];
              })}
              rowKeys={allDecaying.map((page) => `${page.siteId}:${page.page}`)}
              containerClassName="bg-neutral-900 rounded-lg border border-neutral-800 overflow-hidden"
              tableClassName="w-full text-sm"
              headRowClassName="border-b border-neutral-800 text-neutral-500 text-xs uppercase tracking-wider"
              rowClassName="hover:bg-neutral-800/30 transition-colors"
            />
          )}
        </>
      )}
    </div>
  );
}
