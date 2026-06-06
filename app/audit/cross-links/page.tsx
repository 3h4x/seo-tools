import { DataTable, type DataTableColumn } from '../../components/data-table';
import { getCrossLinkMatrix, type CrossLinkSourceMatrix, type CrossLinkSourceStatus } from '@/lib/cross-links';
import { CROSS_LINK_CELL_STYLES, CROSS_LINK_SUMMARY_STYLES } from '@/lib/constants';
import { loadOrFlag } from '@/lib/page-helpers';
import { getManagedSites } from '@/lib/sites';
import { NoSitesNotice } from '../../components/no-sites-notice';
import { PartialFailureBanner } from '../../components/partial-failure-banner';
import { Notice, NoticeCenteredContent, Surface, TextLink } from '@/components/ui';

export const revalidate = 300;

const BASE_COLUMNS: DataTableColumn[] = [
  { label: 'Source Site', rowHeader: true, className: 'px-4 py-3 font-semibold', cellClassName: 'px-4 py-2.5 text-neutral-300 text-xs' },
  { label: 'Pages Crawled', align: 'right', className: 'px-4 py-3 font-semibold', cellClassName: 'px-4 py-2.5 text-right text-neutral-400' },
];

export default async function CrossLinksPage() {
  const sitesResult = await loadOrFlag('CrossLinksPage managed sites', getManagedSites(), []);
  const sites = sitesResult.value;
  const matrixResult = sites.length > 0
    ? await loadOrFlag('CrossLinksPage matrix', getCrossLinkMatrix(sites), [])
    : { value: [], failed: false };
  const matrix = matrixResult.value;
  const partialFailures = [
    ...(sitesResult.failed ? ['Managed sites'] : []),
    ...(matrixResult.failed ? ['Cross-link matrix'] : []),
  ];
  let totalLinkedCells = 0;
  let zeroLinkCells = 0;
  let unavailableSources = 0;
  for (const row of matrix) {
    if (row.status !== 'ok') {
      unavailableSources++;
      continue;
    }
    for (const target of row.targets) {
      if (target.linkedPages === 0) zeroLinkCells++;
      else if ((target.linkedPages ?? 0) > 0) totalLinkedCells++;
    }
  }

  if (sites.length === 0) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Cross-Site Links</h1>
          <p className="text-neutral-500 text-sm mt-1">Managed-domain link coverage</p>
        </div>
        <PartialFailureBanner failures={partialFailures} />
        {sitesResult.failed ? (
          <Notice tone="danger" size="lg" accent="left" className="rounded-lg" role="alert">
            <NoticeCenteredContent className="h-auto items-start text-left">
              <p className="text-red-400 font-semibold">Couldn&apos;t load managed sites</p>
              <p className="text-neutral-500 text-sm mt-2">
                The sites table failed to read. Check the server logs and use Refresh to retry.
              </p>
            </NoticeCenteredContent>
          </Notice>
        ) : (
          <NoSitesNotice variant="inline" />
        )}
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
            <TextLink href="/audit" size="xs" variant="muted" className="text-sm">Back to audit</TextLink>
          </div>
          <p className="text-neutral-500 text-sm mt-1">Top Search Console pages crawled with Googlebot UA · cached 24h · unavailable sources show as N/A</p>
        </div>
      </div>

      <PartialFailureBanner failures={partialFailures} />

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <SummaryCard label="Source Sites" value={matrix.length} styles={CROSS_LINK_SUMMARY_STYLES.sources} />
        <SummaryCard label="Cells With Links" value={totalLinkedCells} styles={CROSS_LINK_SUMMARY_STYLES.linked} />
        <SummaryCard label="Zero-Link Gaps" value={zeroLinkCells} styles={CROSS_LINK_SUMMARY_STYLES.gaps} />
        <SummaryCard label="Unavailable Sources" value={unavailableSources} styles={CROSS_LINK_SUMMARY_STYLES.unavailable} />
      </div>

      <Surface padding="none">
        <DataTable
          columns={[...BASE_COLUMNS, ...targetColumns]}
          rows={matrix.map((row) => {
            const targetsBySiteId = new Map(row.targets.map((target) => [target.targetSiteId, target]));

            return [
              <div key="source" className="space-y-0.5">
                <div className="text-white font-semibold">{row.sourceSiteName}</div>
                <div className="text-neutral-500 text-[10px]">{row.sourceDomain}</div>
              </div>,
              <SourcePagesCell key="pages" row={row} />,
              ...sites.map((site) => {
                if (site.id === row.sourceSiteId) {
                  return <span key={site.id} className="text-neutral-700">—</span>;
                }

                const target = targetsBySiteId.get(site.id);
                if (!target) {
                  return <span key={site.id} className="text-neutral-700">—</span>;
                }

                return (
                  <div key={site.id} className="space-y-0.5">
                    {row.status !== 'ok' || target.linkedPages === null || target.missingPages === null ? (
                      <>
                        <div className={CROSS_LINK_CELL_STYLES.unavailable}>{sourceStatusLabel(row.status)}</div>
                        <div className="text-neutral-700 text-[10px]">Not evaluated</div>
                      </>
                    ) : (
                      <>
                        <div className={target.linkedPages === 0 ? CROSS_LINK_CELL_STYLES.gap : CROSS_LINK_CELL_STYLES.linked}>
                          {target.linkedPages === 0 ? '0 links' : `${target.linkedPages} link${target.linkedPages === 1 ? '' : 's'}`}
                        </div>
                        <div className="text-neutral-600 text-[10px]">{target.missingPages} pages missing</div>
                      </>
                    )}
                  </div>
                );
              }),
            ];
          })}
          rowKeys={matrix.map((row) => row.sourceSiteId)}
          monospaceCells={false}
          containerClassName="overflow-x-auto"
          tableClassName="w-full min-w-[840px] text-sm"
          headRowClassName="border-b border-neutral-800 text-neutral-500 text-xs uppercase tracking-wider"
          rowClassName="hover:bg-neutral-800/30 transition-colors align-top"
        />
      </Surface>
    </div>
  );
}

function SummaryCard(
  { label, value, styles }: { label: string; value: number; styles: { accent: string; value: string } },
) {
  return (
    <Surface padding="sm" className={`border-l-4 ${styles.accent}`}>
      <div className="text-neutral-500 text-xs uppercase tracking-wider">{label}</div>
      <div className={`text-2xl font-bold font-mono mt-2 ${styles.value}`}>{value}</div>
    </Surface>
  );
}

function SourcePagesCell({ row }: { row: CrossLinkSourceMatrix }) {
  if (row.status !== 'ok') {
    return (
      <div className="space-y-0.5">
        <div className={CROSS_LINK_CELL_STYLES.sourceUnavailable}>{sourceStatusLabel(row.status)}</div>
        <div className="text-neutral-700 text-[10px]">Not evaluated</div>
      </div>
    );
  }

  return (
    <div className="space-y-0.5">
      <div>{row.crawledPages}</div>
      {row.failedPages > 0 && (
        <div className={CROSS_LINK_CELL_STYLES.fetchFailure}>
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
