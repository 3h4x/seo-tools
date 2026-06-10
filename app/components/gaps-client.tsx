'use client';

import { useState } from 'react';
import type { GapRecommendation, GapSeverity, GapCategory } from '@/lib/gap-definitions';
import { CATEGORY_LABELS, GAP_SEVERITY_STYLES } from '@/lib/gap-definitions';
import { Badge, Disclosure, FilterChipGroup, Notice, NoticeCenteredContent, Surface, TextButton, TextLink } from '@/components/ui';
import { Icons } from './icons';

const GAP_SEVERITY_BADGE_TONES: Record<GapSeverity, 'gapHigh' | 'gapMedium' | 'gapLow'> = {
  high: 'gapHigh',
  medium: 'gapMedium',
  low: 'gapLow',
};

export interface SiteGap {
  gap: GapRecommendation;
  siteId: string;
  siteName: string;
  domain: string;
}

function GapRow({ sg }: { sg: SiteGap }) {
  const { gap, siteId, siteName, domain } = sg;
  const s = GAP_SEVERITY_STYLES[gap.severity];

  return (
    <Surface padding="sm" leftAccentClassName={s.accentBorder}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <Badge tone={GAP_SEVERITY_BADGE_TONES[gap.severity]} className="shrink-0">
              {s.label}
            </Badge>
            <Badge tone="muted" className="shrink-0">
              {CATEGORY_LABELS[gap.category]}
            </Badge>
            <span className="text-white font-semibold text-sm">{gap.title}</span>
          </div>
          <p className="text-neutral-500 text-xs mt-1">{gap.description}</p>
          {gap.evidence && gap.evidence.length > 0 && (
            <div className="mt-2 space-y-1">
              {gap.evidence.map((line) => (
                <div key={line} className="text-neutral-400 text-xs font-mono break-all">
                  {line}
                </div>
              ))}
            </div>
          )}
          <Disclosure
            className="mt-2 group"
            summaryClassName="text-neutral-500 text-xs cursor-pointer hover:text-neutral-300 transition-colors list-none flex items-center gap-1"
            summary={(
              <>
                <span className="inline-flex text-neutral-600 transition-transform group-open:rotate-90">{Icons.disclosure}</span>
                <span>How to fix</span>
              </>
            )}
          >
            <Surface padding="xs" className="mt-2 !rounded bg-neutral-800">
              <pre className="overflow-x-auto whitespace-pre-wrap font-mono text-xs text-neutral-400">
                {gap.hint}
              </pre>
            </Surface>
          </Disclosure>
        </div>
        <TextLink
          href={`/${encodeURIComponent(siteId)}`}
          size="inherit"
          variant="inherit"
          className="shrink-0 hover:bg-neutral-700"
          title={`View ${domain} full audit`}
        >
          <Badge
            size="md"
            shape="rounded"
            className="flex-col items-end border-transparent bg-neutral-800 !py-1.5 text-right hover:bg-neutral-700"
          >
            <span className="block text-white text-xs font-semibold">{siteName}</span>
            <span className="block text-neutral-500 text-[10px]">{domain}</span>
          </Badge>
        </TextLink>
      </div>
    </Surface>
  );
}

interface GapsClientProps {
  allSiteGaps: SiteGap[];
  sites: Array<{ id: string; name: string; domain: string }>;
  categories: GapCategory[];
}

export function GapsClient({ allSiteGaps, sites, categories }: GapsClientProps) {
  const [filterSite, setFilterSite] = useState<string | null>(null);
  const [filterCategory, setFilterCategory] = useState<GapCategory | null>(null);
  const [filterSeverity, setFilterSeverity] = useState<GapSeverity | null>(null);

  const filtered: SiteGap[] = [];
  const grouped: Record<GapSeverity, SiteGap[]> = { high: [], medium: [], low: [] };
  const siteCounts: Record<string, number> = {};
  const categoryCounts: Partial<Record<GapCategory, number>> = {};
  const severityCounts: Record<GapSeverity, number> = { high: 0, medium: 0, low: 0 };
  for (const sg of allSiteGaps) {
    siteCounts[sg.siteId] = (siteCounts[sg.siteId] ?? 0) + 1;
    categoryCounts[sg.gap.category] = (categoryCounts[sg.gap.category] ?? 0) + 1;
    severityCounts[sg.gap.severity]++;
    if (filterSite && sg.siteId !== filterSite) continue;
    if (filterCategory && sg.gap.category !== filterCategory) continue;
    if (filterSeverity && sg.gap.severity !== filterSeverity) continue;
    filtered.push(sg);
    grouped[sg.gap.severity].push(sg);
  }

  const isFiltered = filterSite !== null || filterCategory !== null || filterSeverity !== null;

  return (
    <div className="space-y-6">
      <Surface padding="sm" className="space-y-3">
        <div className="flex items-center justify-between">
          <Badge size="inline" borderless uppercase className="text-xs text-neutral-500 font-semibold">
            Filter
          </Badge>
          {isFiltered && (
            <TextButton
              variant="quiet"
              onClick={() => { setFilterSite(null); setFilterCategory(null); setFilterSeverity(null); }}
            >
              Clear all ×
            </TextButton>
          )}
        </div>
        {sites.length > 1 && (
          <div className="flex flex-wrap gap-2">
            <span className="text-neutral-600 text-xs self-center shrink-0 w-16">Sites</span>
            <FilterChipGroup
              ariaLabel="Filter by site"
              value={filterSite}
              onChange={setFilterSite}
              options={sites.map((site) => ({
                value: site.id,
                label: site.name,
                count: siteCounts[site.id] ?? 0,
              }))}
            />
          </div>
        )}
        {categories.length > 1 && (
          <div className="flex flex-wrap gap-2">
            <span className="text-neutral-600 text-xs self-center shrink-0 w-16">Category</span>
            <FilterChipGroup
              ariaLabel="Filter by category"
              value={filterCategory}
              onChange={setFilterCategory}
              options={categories.map((cat) => ({
                value: cat,
                label: CATEGORY_LABELS[cat],
                count: categoryCounts[cat] ?? 0,
              }))}
            />
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          <span className="text-neutral-600 text-xs self-center shrink-0 w-16">Severity</span>
          <FilterChipGroup
            ariaLabel="Filter by severity"
            value={filterSeverity}
            onChange={setFilterSeverity}
            hideZeroCounts
            options={(['high', 'medium', 'low'] as GapSeverity[]).map((sev) => {
              const s = GAP_SEVERITY_STYLES[sev];
              return {
                value: sev,
                label: s.label,
                count: severityCounts[sev],
                activeClassName: `${s.bg} ${s.text} ${s.border}`,
                countActiveClassName: '',
              };
            })}
          />
        </div>
      </Surface>
      <div className="grid grid-cols-3 gap-4">
        {([
          ['high', 'Fix immediately'],
          ['medium', 'Plan for next sprint'],
          ['low', 'Nice to have'],
        ] as [GapSeverity, string][]).map(([sev, sublabel]) => {
          const s = GAP_SEVERITY_STYLES[sev];
          return (
            <Surface key={sev} padding="sm" leftAccentClassName={s.accentBorder}>
              <Badge size="inline" borderless uppercase className="mb-1 !text-xs !font-normal text-neutral-500">
                {s.label} Priority
              </Badge>
              <div className={`${s.text} text-3xl font-mono font-bold`}>{grouped[sev].length}</div>
              <div className="text-neutral-600 text-xs mt-1">{sublabel}</div>
            </Surface>
          );
        })}
      </div>
      {(['high', 'medium', 'low'] as GapSeverity[]).map((severity) => {
        const items = grouped[severity];
        if (items.length === 0) return null;
        const s = GAP_SEVERITY_STYLES[severity];

        return (
          <div key={severity} className="space-y-3">
            <div className="flex items-center gap-3">
              <div className={`size-2 rounded-full ${s.dot}`} />
              <h2 className="text-white font-semibold text-sm uppercase tracking-wider">
                {s.label} Priority
              </h2>
              <Badge tone={GAP_SEVERITY_BADGE_TONES[severity]}>
                {items.length}
              </Badge>
            </div>

            <div className="space-y-2">
              {items.map((sg, idx) => (
                <GapRow key={`${sg.siteId}-${sg.gap.id}-${idx}`} sg={sg} />
              ))}
            </div>
          </div>
        );
      })}

      {filtered.length === 0 && (
        <Notice size="spacious">
          <NoticeCenteredContent height="sm">
            {isFiltered ? (
              <>
                <div className="text-neutral-500 text-4xl mb-3">⊘</div>
                <div className="text-white font-semibold">No matches</div>
                <div className="text-neutral-500 text-sm mt-1">
                  No gaps match the current filters.{' '}
                  <TextButton
                    onClick={() => { setFilterSite(null); setFilterCategory(null); setFilterSeverity(null); }}
                    className="!text-sm underline"
                  >
                    Clear filters
                  </TextButton>
                </div>
              </>
            ) : (
              <>
                <span className="mx-auto mb-3 block w-fit text-emerald-400">{Icons.checkCircle}</span>
                <div className="text-white font-semibold">All clear!</div>
                <div className="text-neutral-500 text-sm mt-1">No SEO gaps detected across all sites.</div>
              </>
            )}
          </NoticeCenteredContent>
        </Notice>
      )}
    </div>
  );
}
