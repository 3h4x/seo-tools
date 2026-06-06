import { getManagedSites, getSCUrl } from '@/lib/sites';
import {
  cachedGetKeywordOpportunities,
  OPPORTUNITIES_DEFAULT_DAYS,
  OPPORTUNITIES_TIME_RANGE_OPTIONS,
  OPPORTUNITIES_VALID_DAYS,
  type KeywordOpportunity,
} from '@/lib/opportunities';
import { parseAllowedIntegerParam, type QueryParamValue } from '@/lib/days';
import { loadOrFlag } from '@/lib/page-helpers';
import { Badge, FilterChipGroup, Notice, NoticeCenteredContent, Surface } from '@/components/ui';
import { DataTable, type DataTableColumn } from '../components/data-table';
import { PartialFailureBanner } from '../components/partial-failure-banner';
import TimeRange from '../components/time-range';

export const revalidate = 300;

const COLUMNS: DataTableColumn[] = [
  { label: 'Keyword', rowHeader: true, className: 'px-4 py-3 font-semibold', cellClassName: 'px-4 py-2.5 min-w-[200px]' },
  { label: 'Site', className: 'px-4 py-3 font-semibold', cellClassName: 'px-4 py-2.5 text-neutral-400 text-xs whitespace-nowrap' },
  { label: 'Page', className: 'px-4 py-3 font-semibold hidden lg:table-cell', cellClassName: 'px-4 py-2.5 hidden lg:table-cell max-w-[220px] truncate text-xs text-neutral-400' },
  { label: 'Rank', align: 'right', className: 'px-4 py-3 font-semibold', cellClassName: 'px-4 py-2.5 text-right' },
  { label: 'Impr.', align: 'right', className: 'px-4 py-3 font-semibold hidden sm:table-cell', cellClassName: 'px-4 py-2.5 text-right hidden sm:table-cell' },
  { label: 'CTR', align: 'right', className: 'px-4 py-3 font-semibold hidden md:table-cell', cellClassName: 'px-4 py-2.5 text-right hidden md:table-cell' },
  { label: 'Expected CTR', align: 'right', className: 'px-4 py-3 font-semibold hidden md:table-cell', cellClassName: 'px-4 py-2.5 text-right hidden md:table-cell' },
  { label: 'Est. Clicks', align: 'right', className: 'px-4 py-3 font-semibold', cellClassName: 'px-4 py-2.5 text-right' },
];

function pct(v: number) {
  return (v * 100).toFixed(1) + '%';
}

function opportunitiesHref(days: number, site?: string): string {
  const params = new URLSearchParams({ days: String(days) });
  if (site) params.set('site', site);
  return `/opportunities?${params.toString()}`;
}

interface SiteOpportunity {
  domain: string;
  opportunity: KeywordOpportunity;
}

export default async function OpportunitiesPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: QueryParamValue; site?: QueryParamValue }>;
}) {
  const params = await searchParams;
  const days = parseAllowedIntegerParam(params.days, OPPORTUNITIES_VALID_DAYS, OPPORTUNITIES_DEFAULT_DAYS);

  const sitesResult = await loadOrFlag('OpportunitiesPage managed sites', getManagedSites(), []);
  const sites = sitesResult.value;
  const scSites = sites.filter(s => s.searchConsole !== false);
  const siteParam = Array.isArray(params.site) ? params.site[0] : params.site;
  const selectedSite = siteParam ? scSites.find(site => site.domain === siteParam) : undefined;
  const siteFilter = selectedSite?.domain ?? '';
  const targetSites = selectedSite ? [selectedSite] : scSites;

  const allOpportunities: SiteOpportunity[] = [];
  const partialFailures: string[] = [
    ...(sitesResult.failed ? ['Managed sites'] : []),
  ];

  await Promise.all(
    targetSites.map(async (site) => {
      const result = await loadOrFlag(
        `OpportunitiesPage keyword opportunities ${site.id}`,
        cachedGetKeywordOpportunities(getSCUrl(site), site.id, days),
        [],
      );
      const opps = result.value;

      if (result.failed) partialFailures.push(`${site.domain} keyword opportunities`);

      if (!opps) return;
      for (const opp of opps) {
        allOpportunities.push({ domain: site.domain, opportunity: opp });
      }
    }),
  );

  allOpportunities.sort((a, b) => b.opportunity.estimatedClicks - a.opportunity.estimatedClicks);

  const top = allOpportunities.slice(0, 100);
  const emptyTitle = sitesResult.failed ? "Couldn't load managed sites" : 'No opportunities found';
  const emptyMessage = sitesResult.failed
    ? 'The sites table failed to read. Check the server logs and use Refresh to retry.'
    : scSites.length === 0
      ? 'Enable Search Console for at least one managed site in Config to populate keyword opportunities.'
      : 'No queries ranking in positions 5-20 for the selected period. Try a longer date range.';
  const emptyNoticeTone = sitesResult.failed ? 'danger' : 'neutral';

  const rows = top.map(({ domain, opportunity: o }) => [
    <span key="q" className="font-medium text-neutral-200">{o.query}</span>,
    <span key="d" className="text-xs">{domain}</span>,
    <span key="p" className="font-mono text-xs">{o.page}</span>,
    <span key="pos" className="font-mono text-neutral-300">{o.position.toFixed(1)}</span>,
    <span key="imp" className="font-mono text-neutral-300">{o.impressions.toLocaleString()}</span>,
    <span key="ctr" className="font-mono text-neutral-400">{pct(o.actualCtr)}</span>,
    <span key="ectr" className="font-mono text-emerald-400">{pct(o.expectedCtr)}</span>,
    <span key="est" className="font-mono font-semibold text-white">+{o.estimatedClicks.toLocaleString()}</span>,
  ]);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-white">Keyword Opportunities</h1>
          <p className="text-neutral-500 text-sm mt-1">
            Striking-distance keywords (positions 5–20) ranked by estimated click upside if moved to position 3
          </p>
        </div>
        <TimeRange options={[...OPPORTUNITIES_TIME_RANGE_OPTIONS]} defaultValue={String(OPPORTUNITIES_DEFAULT_DAYS)} />
      </div>

      <PartialFailureBanner failures={partialFailures} />

      {scSites.length > 1 && (
        <FilterChipGroup
          ariaLabel="Filter opportunities by site"
          value={siteFilter || 'all'}
          options={[
            { value: 'all', label: 'All sites', href: opportunitiesHref(days) },
            ...scSites.map(site => ({
              value: site.domain,
              label: site.domain,
              href: opportunitiesHref(days, site.domain),
            })),
          ]}
        />
      )}

      {top.length === 0 ? (
        <Notice
          size="spacious"
          tone={emptyNoticeTone}
          accent={sitesResult.failed ? 'left' : 'none'}
          className={sitesResult.failed
            ? 'rounded-lg text-neutral-500'
            : 'rounded-lg text-neutral-500'}
        >
          {sitesResult.failed ? (
            <>
              <p className="mb-1 font-semibold text-red-400">{emptyTitle}</p>
              <p className="text-sm">{emptyMessage}</p>
            </>
          ) : (
            <NoticeCenteredContent className="h-auto">
              <p className="mb-1 font-medium">{emptyTitle}</p>
              <p className="text-sm">{emptyMessage}</p>
            </NoticeCenteredContent>
          )}
        </Notice>
      ) : (
        <>
          <Badge size="xs" shape="rounded" className="border-transparent bg-transparent !px-0 text-neutral-500">
            Showing {top.length} of {allOpportunities.length} opportunities
            {siteFilter ? ` for ${siteFilter}` : ' across all sites'}
          </Badge>
          <Surface padding="none" className="overflow-hidden">
            <DataTable
              columns={COLUMNS}
              rows={rows}
              monospaceCells={false}
              containerClassName="contents"
            />
          </Surface>
          <p className="text-xs text-neutral-600">
            Est. Clicks = impressions × (11% expected CTR at position 3 − actual CTR). Cached for 30 min.
          </p>
        </>
      )}
    </div>
  );
}
