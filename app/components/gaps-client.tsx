'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { GapRecommendation, GapSeverity, GapCategory } from '@/lib/gaps';
import { CATEGORY_LABELS, GAP_SEVERITY_STYLES } from '@/lib/gaps';
import { FilterChipGroup, TextButton } from '@/components/ui';

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
    <div className={`bg-neutral-900 rounded-lg border border-neutral-800 border-l-4 ${s.accentBorder} p-4`}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border shrink-0 ${s.bg} ${s.text} ${s.border}`}>
              {s.label}
            </span>
            <span className="text-[10px] font-medium px-2 py-0.5 rounded-full border border-neutral-700 text-neutral-400 shrink-0">
              {CATEGORY_LABELS[gap.category]}
            </span>
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
          <details className="mt-2 group">
            <summary className="text-neutral-500 text-xs cursor-pointer hover:text-neutral-300 transition-colors list-none flex items-center gap-1">
              <span className="group-open:hidden">▸ How to fix</span>
              <span className="hidden group-open:inline">▾ How to fix</span>
            </summary>
            <pre className="text-neutral-400 text-xs font-mono mt-2 whitespace-pre-wrap bg-neutral-800 rounded p-3 overflow-x-auto">
              {gap.hint}
            </pre>
          </details>
        </div>
        <Link
          href={`/${encodeURIComponent(siteId)}`}
          className="shrink-0 bg-neutral-800 hover:bg-neutral-700 rounded-md px-3 py-1.5 transition-colors text-right"
          title={`View ${domain} full audit`}
        >
          <div className="text-white text-xs font-semibold">{siteName}</div>
          <div className="text-neutral-500 text-[10px]">{domain}</div>
        </Link>
      </div>
    </div>
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

  // Apply filters
  const filtered = allSiteGaps.filter((sg) => {
    if (filterSite && sg.siteId !== filterSite) return false;
    if (filterCategory && sg.gap.category !== filterCategory) return false;
    if (filterSeverity && sg.gap.severity !== filterSeverity) return false;
    return true;
  });

  const grouped: Record<GapSeverity, SiteGap[]> = { high: [], medium: [], low: [] };
  for (const sg of filtered) {
    grouped[sg.gap.severity].push(sg);
  }

  const isFiltered = filterSite !== null || filterCategory !== null || filterSeverity !== null;

  return (
    <div className="space-y-6">
      <div className="bg-neutral-900 rounded-lg border border-neutral-800 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-neutral-500 text-xs font-semibold uppercase tracking-wider">Filter</span>
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
                count: allSiteGaps.filter((sg) => sg.siteId === site.id).length,
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
                count: allSiteGaps.filter((sg) => sg.gap.category === cat).length,
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
                count: allSiteGaps.filter((sg) => sg.gap.severity === sev).length,
                activeClassName: `${s.bg} ${s.text} ${s.border}`,
                countActiveClassName: '',
              };
            })}
          />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-4">
        {([
          ['high', 'Fix immediately'],
          ['medium', 'Plan for next sprint'],
          ['low', 'Nice to have'],
        ] as [GapSeverity, string][]).map(([sev, sublabel]) => {
          const s = GAP_SEVERITY_STYLES[sev];
          return (
            <div key={sev} className={`bg-neutral-900 rounded-lg border border-neutral-800 border-l-4 ${s.accentBorder} p-4`}>
              <div className="text-neutral-500 text-xs uppercase tracking-wider mb-1">{s.label} Priority</div>
              <div className={`${s.text} text-3xl font-mono font-bold`}>{grouped[sev].length}</div>
              <div className="text-neutral-600 text-xs mt-1">{sublabel}</div>
            </div>
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
              <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${s.bg} ${s.text} ${s.border}`}>
                {items.length}
              </span>
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
        <div className="bg-neutral-900 rounded-lg border border-neutral-800 p-12 text-center">
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
              <div className="text-emerald-400 text-4xl mb-3">✓</div>
              <div className="text-white font-semibold">All clear!</div>
              <div className="text-neutral-500 text-sm mt-1">No SEO gaps detected across all sites.</div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
