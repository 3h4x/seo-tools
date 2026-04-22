import Link from 'next/link';
import { cachedAuditAllSites, type CheckStatus, type SiteAuditResult } from '@/lib/audit';
import { getManagedSites } from '@/lib/sites';
import { analyzeSiteGaps, type GapSeverity, type GapCategory } from '@/lib/gaps';
import { detectAllDecay, type DecaySeverity } from '@/lib/decay';
import { formatRelativeTime } from '@/lib/format';
import { statusDots, accentBorder, StatusBadge } from '../components/audit/check-card';
import { MetricCard } from '../components/metric-card';
import { CopyButton } from '../components/copy-button';
import { GapsClient, type SiteGap } from '../components/gaps-client';
import DecayToggle from '../components/decay-toggle';

export const revalidate = 300;

const DECAY_SEVERITY_COLORS: Record<DecaySeverity, { badge: string; badgeBg: string }> = {
  severe: { badge: 'text-red-400', badgeBg: 'bg-red-500/10' },
  moderate: { badge: 'text-amber-400', badgeBg: 'bg-amber-500/10' },
  mild: { badge: 'text-blue-400', badgeBg: 'bg-blue-500/10' },
};

function worstStatus(audit: SiteAuditResult): CheckStatus {
  const passRate = audit.score.total > 0 ? audit.score.pass / audit.score.total : 0;
  if (passRate >= 0.9) return 'pass';
  if (passRate >= 0.7) return 'warn';
  return 'fail';
}

function metaTagsSummary(audit: SiteAuditResult): { status: CheckStatus; label: string } {
  const pages = audit.metaTags;
  const issues = pages.filter(p => {
    const checks = [p.title, p.description, p.ogTitle, p.ogImage, p.ogDescription, p.twitterCard, p.canonical, p.jsonLd];
    return checks.some(c => c.status === 'fail' || c.status === 'error');
  });
  if (issues.length === 0) return { status: 'pass', label: `${pages.length}/${pages.length} pages pass` };
  if (issues.length === pages.length) return { status: 'fail', label: `${issues.length}/${pages.length} have issues` };
  return { status: 'warn', label: `${pages.length - issues.length}/${pages.length} pages pass` };
}

function imageSeoSummary(audit: SiteAuditResult): { status: CheckStatus; label: string } {
  const checks = audit.imageSeo;
  if (checks.length === 0) return { status: 'pass', label: 'No pages' };
  const fails = checks.filter(c => c.status === 'fail');
  const warns = checks.filter(c => c.status === 'warn');
  if (fails.length > 0) return { status: 'fail', label: `${fails.length} page${fails.length > 1 ? 's' : ''} missing alt` };
  if (warns.length > 0) return { status: 'warn', label: `${warns.length} page${warns.length > 1 ? 's' : ''} need alt` };
  return { status: 'pass', label: 'All images have alt' };
}

function internalLinksSummary(audit: SiteAuditResult): { status: CheckStatus; label: string } {
  const checks = audit.internalLinks;
  if (checks.length === 0) return { status: 'pass', label: 'No pages' };
  const fails = checks.filter(c => c.status === 'fail');
  const warns = checks.filter(c => c.status === 'warn');
  if (fails.length > 0) return { status: 'fail', label: `${fails.length} page${fails.length > 1 ? 's' : ''} no links` };
  if (warns.length > 0) return { status: 'warn', label: `${warns.length} page${warns.length > 1 ? 's' : ''} low links` };
  return { status: 'pass', label: 'Good linking' };
}

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  const sp = await searchParams;
  const period = sp.period === '30' ? 30 : 7;

  const [audits, managedSites, decayResults] = await Promise.all([
    cachedAuditAllSites(),
    getManagedSites(),
    detectAllDecay(period as 7 | 30),
  ]);

  const totalPass = audits.reduce((s, a) => s + a.score.pass, 0);
  const totalWarn = audits.reduce((s, a) => s + a.score.warn, 0);
  const totalFail = audits.reduce((s, a) => s + a.score.fail + a.score.error, 0);
  const totalChecks = totalPass + totalWarn + totalFail;
  const healthPct = totalChecks > 0 ? Math.round((totalPass / totalChecks) * 100) : 0;
  const healthySites = audits.filter(a => a.score.total > 0 && a.score.pass / a.score.total >= 0.9).length;

  const allSiteGaps: SiteGap[] = [];
  for (const audit of audits) {
    const site = managedSites.find(s => s.id === audit.siteId);
    if (!site) continue;
    const { gaps } = analyzeSiteGaps(audit, site);
    for (const gap of gaps) {
      allSiteGaps.push({ gap, siteId: site.id, siteName: site.name, domain: site.domain });
    }
  }
  const severityOrder: Record<GapSeverity, number> = { high: 0, medium: 1, low: 2 };
  allSiteGaps.sort((a, b) => {
    const sev = severityOrder[a.gap.severity] - severityOrder[b.gap.severity];
    if (sev !== 0) return sev;
    const cat = a.gap.category.localeCompare(b.gap.category);
    if (cat !== 0) return cat;
    return a.gap.title.localeCompare(b.gap.title);
  });
  const totalRecs = allSiteGaps.length;
  const gapSiteIds = [...new Set(allSiteGaps.map(sg => sg.siteId))];
  const gapSites = gapSiteIds
    .map(id => managedSites.find(s => s.id === id))
    .filter((s): s is NonNullable<typeof s> => s !== null)
    .map(s => ({ id: s.id, name: s.name, domain: s.domain }));
  const categoryOrder: GapCategory[] = ['crawlability', 'content', 'social', 'indexing', 'structured-data', 'performance', 'security'];
  const gapCategories = ([...new Set(allSiteGaps.map(sg => sg.gap.category))] as GapCategory[])
    .sort((a, b) => categoryOrder.indexOf(a) - categoryOrder.indexOf(b));

  const allDecaying = decayResults.flatMap(r => r.decayingPages);
  const severeCount = allDecaying.filter(p => p.severity === 'severe').length;
  const decaySitesAffected = new Set(allDecaying.map(p => p.siteId)).size;

  if (audits.length === 0) {
    return (
      <div className="space-y-8">
        <div>
          <h1 className="text-2xl font-bold text-white">SEO Audit</h1>
        </div>
        <p className="text-neutral-500 text-sm">
          No sites configured —{' '}
          <Link href="/config" className="text-white underline">add sites in the Config tab</Link>.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white">SEO Audit</h1>
        <p className="text-neutral-500 text-sm mt-1">Live checks · {audits.length} sites</p>
      </div>
      <div className="flex gap-6 items-center">
        <div className="bg-neutral-900 rounded-lg border border-neutral-800 p-5 flex items-center gap-5 shrink-0">
          <div className="relative size-24">
            <svg viewBox="0 0 100 100" className="size-24 -rotate-90">
              <circle cx="50" cy="50" r="42" fill="none" stroke="#262626" strokeWidth="8" />
              <circle
                cx="50" cy="50" r="42" fill="none"
                stroke={healthPct >= 90 ? '#10b981' : healthPct >= 70 ? '#f59e0b' : '#ef4444'}
                strokeWidth="8" strokeLinecap="round"
                strokeDasharray={`${healthPct * 2.64} 264`}
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className={`text-lg font-bold font-mono ${healthPct >= 90 ? 'text-emerald-400' : healthPct >= 70 ? 'text-amber-400' : 'text-red-400'}`}>
                {healthPct}%
              </span>
            </div>
          </div>
          <div className="space-y-1">
            <div className="text-white font-semibold text-sm">Health Score</div>
            <div className="text-neutral-500 text-xs">{totalPass}/{totalChecks} checks pass</div>
            <div className="text-neutral-500 text-xs">{healthySites}/{audits.length} sites healthy</div>
            {totalRecs > 0 && <div className="text-neutral-500 text-xs">{totalRecs} recommendations</div>}
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 flex-1">
          <MetricCard label="Passed" current={totalPass} accent="border-l-emerald-500" valueColor="text-emerald-400" />
          <MetricCard label="Warnings" current={totalWarn} accent="border-l-amber-500" valueColor="text-amber-400" />
          <MetricCard label="Failures" current={totalFail} accent="border-l-red-500" valueColor="text-red-400" />
        </div>
      </div>
      <div className="space-y-4">
        {audits.map((audit) => {
          const worst = worstStatus(audit);
          const meta = metaTagsSummary(audit);
          const site = managedSites.find(s => s.id === audit.siteId);
          const gapCount = site ? analyzeSiteGaps(audit, site).gaps.length : 0;
          return (
            <Link
              key={audit.siteId}
              href={`/${audit.siteId}`}
              className={`block bg-neutral-900 rounded-lg border border-neutral-800 border-l-4 ${accentBorder[worst]} p-5 hover:bg-neutral-800/50 transition-colors`}
            >
              <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2">
                    <span className="text-white font-semibold">{audit.domain}</span>
                    <CopyButton text={`https://${audit.domain}`} label="domain" className="text-[10px] px-1.5 py-0.5" />
                  </div>
                  <StatusBadge status={worst} label={`${audit.score.pass}/${audit.score.total} passed`} />
                  {gapCount > 0 && (
                    <span className="text-neutral-500 text-[10px] font-medium px-2 py-0.5 rounded-full border border-neutral-700">
                      {gapCount} {gapCount === 1 ? 'recommendation' : 'recommendations'}
                    </span>
                  )}
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className="text-neutral-600 text-xs">View details →</span>
                  <span className="text-neutral-700 text-[10px]">
                    Checked {formatRelativeTime(audit.timestamp)}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-9 gap-3">
                <CheckItem label="robots.txt" status={audit.robotsTxt.status} />
                <CheckItem label="Sitemap" status={audit.sitemap.status} />
                <CheckItem label="SC Sitemap" status={audit.scSitemapFreshness.status} />
                <CheckItem label="Indexing" status={audit.indexingCoverage.status} sublabel={audit.indexingCoverage.coveragePct != null ? `${audit.indexingCoverage.coveragePct}%` : undefined} />
                <CheckItem label="Meta Tags" status={meta.status} sublabel={meta.label} />
                <CheckItem label="OG Image" status={audit.ogImage.status} />
                <CheckItem label="Images" status={imageSeoSummary(audit).status} sublabel={imageSeoSummary(audit).label} />
                <CheckItem label="Int. Links" status={internalLinksSummary(audit).status} sublabel={internalLinksSummary(audit).label} />
                <CheckItem label="TTFB" status={audit.ttfb.status} sublabel={audit.ttfb.ms ? `${audit.ttfb.ms}ms` : undefined} />
              </div>
            </Link>
          );
        })}
      </div>
      {allSiteGaps.length > 0 && (
        <div className="space-y-4">
          <div>
            <h2 className="text-lg font-bold text-white">Gap Analysis</h2>
            <p className="text-neutral-500 text-sm mt-1">
              Cross-site SEO recommendations · {totalRecs} issues
              {allSiteGaps.filter(sg => sg.gap.severity === 'high').length > 0 && (
                <span className="text-red-400 ml-2">· {allSiteGaps.filter(sg => sg.gap.severity === 'high').length} high priority</span>
              )}
            </p>
          </div>
          <GapsClient allSiteGaps={allSiteGaps} sites={gapSites} categories={gapCategories} />
        </div>
      )}
      <div className="space-y-4">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-bold text-white">Content Decay</h2>
            <p className="text-neutral-500 text-sm mt-1">Pages losing traffic · {period}-day comparison</p>
          </div>
          <DecayToggle />
        </div>

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
          <div className="bg-neutral-900 rounded-lg border border-neutral-800 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-neutral-800 text-neutral-500 text-left text-xs uppercase tracking-wider">
                  <th className="px-4 py-3 font-semibold">Site</th>
                  <th className="px-4 py-3 font-semibold">Page</th>
                  <th className="px-4 py-3 font-semibold text-right">Clicks</th>
                  <th className="px-4 py-3 font-semibold text-right hidden md:table-cell">Impressions</th>
                  <th className="px-4 py-3 font-semibold text-right hidden md:table-cell">Position</th>
                  <th className="px-4 py-3 font-semibold text-right">Severity</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800">
                {allDecaying.map((page, i) => {
                  let shortPage = page.page;
                  try { shortPage = new URL(page.page).pathname; } catch {}
                  const colors = DECAY_SEVERITY_COLORS[page.severity];
                  return (
                    <tr key={i} className="hover:bg-neutral-800/30 transition-colors">
                      <td className="px-4 py-2.5 text-neutral-400 text-xs">{page.domain}</td>
                      <td className="px-4 py-2.5 text-neutral-300 font-mono text-xs truncate max-w-[200px]" title={page.page}>{shortPage}</td>
                      <td className="px-4 py-2.5 text-right font-mono">
                        <span className="text-neutral-300">{page.currentClicks}</span>
                        <span className="text-red-400 text-[10px] ml-1">{page.clicksDelta}%</span>
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono hidden md:table-cell">
                        <span className="text-neutral-400">{page.currentImpressions}</span>
                        <span className="text-red-400 text-[10px] ml-1">{page.impressionsDelta}%</span>
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono hidden md:table-cell">
                        <span className="text-neutral-400">{page.currentPosition.toFixed(1)}</span>
                        {page.positionDelta > 0 && <span className="text-red-400 text-[10px] ml-1">+{page.positionDelta}</span>}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <span className={`${colors.badgeBg} ${colors.badge} text-[10px] px-2 py-0.5 rounded-full font-medium uppercase`}>
                          {page.severity}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function CheckItem({ label, status, sublabel }: { label: string; status: CheckStatus; sublabel?: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className={`size-2 rounded-full shrink-0 ${statusDots[status]}`} />
      <div>
        <div className="text-neutral-300 text-xs font-medium">{label}</div>
        {sublabel && <div className="text-neutral-600 text-[10px]">{sublabel}</div>}
      </div>
    </div>
  );
}
