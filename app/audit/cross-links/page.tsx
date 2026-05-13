import Link from 'next/link';
import { DataTable, type DataTableColumn } from '../../components/data-table';
import { getCrossLinkMatrix, type CrossLinkSourceMatrix, type CrossLinkSourceStatus } from '@/lib/cross-links';
import { getManagedSites } from '@/lib/sites';

export const revalidate = 300;

const BASE_COLUMNS: DataTableColumn[] = [
  { label: 'Source Site', className: 'px-4 py-3 font-semibold', cellClassName: 'px-4 py-2.5 text-neutral-300 text-xs' },
  { label: 'Pages Crawled', align: 'right', className: 'px-4 py-3 font-semibold', cellClassName: 'px-4 py-2.5 text-right text-neutral-400' },
];

export default async function CrossLinksPage() {
  const sites = await getManagedSites();
  const matrix = await getCrossLinkMatrix(sites);
  const evaluatedTargets = matrix
    .filter((row) => row.status === 'ok')
    .flatMap((row) => row.targets);
  const totalLinkedCells = evaluatedTargets.filter((target) => (target.linkedPages ?? 0) > 0).length;
  const zeroLinkCells = evaluatedTargets.filter((target) => target.linkedPages === 0).length;
  const unavailableSources = matrix.filter((row) => row.status !== 'ok').length;

  if (sites.length === 0) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Cross-Site Links</h1>
          <p className="text-neutral-500 text-sm mt-1">Managed-domain link coverage</p>
        </div>
        <p className="text-neutral-500 text-sm">
          No sites configured — <Link href="/config" className="text-white underline">add sites in the Config tab</Link>.
        </p>
      </div>
    );
  }

  const targetColumns = sites.map((site) => ({
    label: site.name,
    align: 'right' as const,
    className: 'px-4 py-3 font-semibold',
    cellClassName: 'px-4 py-2.5 text-right',
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-white">Cross-Site Links</h1>
            <Link href="/audit" className="text-sm text-neutral-500 hover:text-neutral-300 transition-colors">Back to audit</Link>
          </div>
          <p className="text-neutral-500 text-sm mt-1">Top Search Console pages crawled with Googlebot UA · cached 24h · unavailable sources show as N/A</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <SummaryCard label="Source Sites" value={matrix.length} accent="border-l-blue-500" valueClassName="text-blue-400" />
        <SummaryCard label="Cells With Links" value={totalLinkedCells} accent="border-l-emerald-500" valueClassName="text-emerald-400" />
        <SummaryCard label="Zero-Link Gaps" value={zeroLinkCells} accent="border-l-red-500" valueClassName="text-red-400" />
        <SummaryCard label="Unavailable Sources" value={unavailableSources} accent="border-l-neutral-600" valueClassName="text-neutral-300" />
      </div>

      <DataTable
        columns={[...BASE_COLUMNS, ...targetColumns]}
        rows={matrix.map((row) => [
          <div key="source" className="space-y-0.5">
            <div className="text-white font-semibold">{row.sourceSiteName}</div>
            <div className="text-neutral-500 text-[10px]">{row.sourceDomain}</div>
          </div>,
          <SourcePagesCell key="pages" row={row} />,
          ...sites.map((site) => {
            if (site.id === row.sourceSiteId) {
              return <span key={site.id} className="text-neutral-700">—</span>;
            }

            const target = row.targets.find((entry) => entry.targetSiteId === site.id);
            if (!target) {
              return <span key={site.id} className="text-neutral-700">—</span>;
            }

            return (
              <div key={site.id} className="space-y-0.5">
                {row.status !== 'ok' || target.linkedPages === null || target.missingPages === null ? (
                  <>
                    <div className="text-neutral-500 font-semibold">{sourceStatusLabel(row.status)}</div>
                    <div className="text-neutral-700 text-[10px]">Not evaluated</div>
                  </>
                ) : (
                  <>
                    <div className={target.linkedPages === 0 ? 'text-red-400 font-semibold' : 'text-emerald-400 font-semibold'}>
                      {target.linkedPages === 0 ? '0 links' : `${target.linkedPages} link${target.linkedPages === 1 ? '' : 's'}`}
                    </div>
                    <div className="text-neutral-600 text-[10px]">{target.missingPages} pages missing</div>
                  </>
                )}
              </div>
            );
          }),
        ])}
        rowKeys={matrix.map((row) => row.sourceSiteId)}
        monospaceCells={false}
        containerClassName="bg-neutral-900 rounded-lg border border-neutral-800 overflow-x-auto"
        tableClassName="w-full min-w-[840px] text-sm"
        headRowClassName="border-b border-neutral-800 text-neutral-500 text-xs uppercase tracking-wider"
        rowClassName="hover:bg-neutral-800/30 transition-colors align-top"
      />
    </div>
  );
}

function SummaryCard(
  { label, value, accent, valueClassName }: { label: string; value: number; accent: string; valueClassName: string },
) {
  return (
    <div className={`bg-neutral-900 rounded-lg border border-neutral-800 border-l-4 ${accent} p-4`}>
      <div className="text-neutral-500 text-xs uppercase tracking-wider">{label}</div>
      <div className={`text-2xl font-bold font-mono mt-2 ${valueClassName}`}>{value}</div>
    </div>
  );
}

function SourcePagesCell({ row }: { row: CrossLinkSourceMatrix }) {
  if (row.status !== 'ok') {
    return (
      <div className="space-y-0.5">
        <div className="text-neutral-400 font-medium">{sourceStatusLabel(row.status)}</div>
        <div className="text-neutral-700 text-[10px]">Not evaluated</div>
      </div>
    );
  }

  return (
    <div className="space-y-0.5">
      <div>{row.crawledPages}</div>
      {row.failedPages > 0 && (
        <div className="text-amber-400 text-[10px]">
          {row.failedPages} fetch {row.failedPages === 1 ? 'failed' : 'failures'}
        </div>
      )}
    </div>
  );
}

function sourceStatusLabel(status: CrossLinkSourceStatus): string {
  switch (status) {
    case 'disabled':
      return 'SC disabled';
    case 'search-console-unavailable':
      return 'SC unavailable';
    case 'crawl-unavailable':
      return 'Crawl failed';
    case 'no-pages':
      return 'No pages';
    case 'ok':
      return 'OK';
  }
}
