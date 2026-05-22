import { getManagedSites, getSCUrl } from '@/lib/sites';
import {
  cachedGetKeywordOpportunities,
  OPPORTUNITIES_DEFAULT_DAYS,
  OPPORTUNITIES_TIME_RANGE_OPTIONS,
  OPPORTUNITIES_VALID_DAYS,
  type KeywordOpportunity,
} from '@/lib/opportunities';
import { parseAllowedIntegerParam, type QueryParamValue } from '@/lib/days';
import { loadOrFallback } from '@/lib/page-helpers';
import { DataTable, type DataTableColumn } from '../components/data-table';
import TimeRange from '../components/time-range';

export const revalidate = 300;

const COLUMNS: DataTableColumn[] = [
  { label: 'Keyword', className: 'px-4 py-3 font-semibold', cellClassName: 'px-4 py-2.5 min-w-[200px]' },
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

  const sites = await loadOrFallback('OpportunitiesPage managed sites', getManagedSites(), []);
  const scSites = sites.filter(s => s.searchConsole !== false);
  const siteParam = Array.isArray(params.site) ? params.site[0] : params.site;
  const selectedSite = siteParam ? scSites.find(site => site.domain === siteParam) : undefined;
  const siteFilter = selectedSite?.domain ?? '';
  const targetSites = selectedSite ? [selectedSite] : scSites;

  const allOpportunities: SiteOpportunity[] = [];

  await Promise.all(
    targetSites.map(async (site) => {
      let opps: Awaited<ReturnType<typeof cachedGetKeywordOpportunities>>;

      try {
        opps = await cachedGetKeywordOpportunities(getSCUrl(site), site.id, days);
      } catch (error) {
        console.error('[OpportunitiesPage]', site.id, error);
        opps = [];
      }

      if (!opps) return;
      for (const opp of opps) {
        allOpportunities.push({ domain: site.domain, opportunity: opp });
      }
    }),
  );

  allOpportunities.sort((a, b) => b.opportunity.estimatedClicks - a.opportunity.estimatedClicks);

  const top = allOpportunities.slice(0, 100);

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

      {scSites.length > 1 && (
        <div className="flex gap-2 flex-wrap">
          <a
            href={opportunitiesHref(days)}
            className={`px-3 py-1 rounded text-sm ${!siteFilter ? 'bg-neutral-700 text-white' : 'text-neutral-400 hover:text-white hover:bg-neutral-800'}`}
          >
            All sites
          </a>
          {scSites.map(site => (
            <a
              key={site.id}
              href={opportunitiesHref(days, site.domain)}
              className={`px-3 py-1 rounded text-sm ${siteFilter === site.domain ? 'bg-neutral-700 text-white' : 'text-neutral-400 hover:text-white hover:bg-neutral-800'}`}
            >
              {site.domain}
            </a>
          ))}
        </div>
      )}

      {top.length === 0 ? (
        <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-8 text-center text-neutral-500">
          <p className="font-medium mb-1">No opportunities found</p>
          <p className="text-sm">No queries ranking in positions 5–20 for the selected period. Try a longer date range.</p>
        </div>
      ) : (
        <>
          <div className="text-xs text-neutral-500">
            Showing {top.length} of {allOpportunities.length} opportunities
            {siteFilter ? ` for ${siteFilter}` : ' across all sites'}
          </div>
          <DataTable
            columns={COLUMNS}
            rows={rows}
            monospaceCells={false}
          />
          <p className="text-xs text-neutral-600">
            Est. Clicks = impressions × (11% expected CTR at position 3 − actual CTR). Cached for 30 min.
          </p>
        </>
      )}
    </div>
  );
}
