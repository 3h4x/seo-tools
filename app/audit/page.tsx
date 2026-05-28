import { cachedAuditAllSites, type CheckStatus, type SiteAuditResult } from '@/lib/audit';
import { summarizeCanonicalChecks } from '@/lib/canonical';
import { getManagedSites } from '@/lib/sites';
import { discoverPropertyIdsWithStatus } from '@/lib/ga4';
import type { GapSeverity, GapCategory } from '@/lib/gap-definitions';
import { analyzeSiteGaps, loadSiteGapSignals } from '@/lib/gaps';
import { detectAllDecay, type DecaySeverity } from '@/lib/decay';
import { formatRelativeTime } from '@/lib/format';
import { getCwvAuditSummary, type CwvAuditSummary } from '@/lib/performance-site';
import { CHART_NEUTRALS, CWV_RATING_COLORS, CWV_THRESHOLDS, STATUS_COLORS, type CwvMetricName } from '@/lib/constants';
import { loadOrFlag } from '@/lib/page-helpers';
import { statusDots, accentBorder, StatusBadge } from '../components/audit/check-card';
import { MetricCard } from '../components/metric-card';
import { CopyButton } from '../components/copy-button';
import { GapsClient, type SiteGap } from '../components/gaps-client';
import { DataTable, type DataTableColumn } from '../components/data-table';
import TimeRange from '../components/time-range';
import { parseAllowedIntegerParam, type QueryParamValue } from '@/lib/days';
import { Badge, Notice, TextLink } from '@/components/ui';
import { NoSitesNotice } from '../components/no-sites-notice';
import { PartialFailureBanner } from '../components/partial-failure-banner';
import { PerformanceSourceBadge } from '../components/performance-source-badge';

const AUDIT_DECAY_PERIODS = [7, 30] as const;

export const revalidate = 300;

const DECAY_SEVERITY_COLORS: Record<DecaySeverity, { badge: string; badgeBg: string }> = {
  severe: { badge: 'text-red-400', badgeBg: 'bg-red-500/10' },
  moderate: { badge: 'text-amber-400', badgeBg: 'bg-amber-500/10' },
  mild: { badge: 'text-blue-400', badgeBg: 'bg-blue-500/10' },
};

const AUDIT_STALE_MS = 24 * 60 * 60 * 1000;
const AUDIT_VERY_STALE_MS = 7 * AUDIT_STALE_MS;

const DECAY_TABLE_COLUMNS: DataTableColumn[] = [
  { label: 'Site', className: 'px-4 py-3 font-semibold', cellClassName: 'px-4 py-2.5 text-neutral-400 text-xs' },
  { label: 'Page', rowHeader: true, className: 'px-4 py-3 font-semibold', cellClassName: 'px-4 py-2.5 text-neutral-300 text-xs truncate max-w-[200px]' },
  { label: 'Clicks', align: 'right', className: 'px-4 py-3 font-semibold', cellClassName: 'px-4 py-2.5 text-right' },
  { label: 'Impressions', align: 'right', className: 'px-4 py-3 font-semibold hidden md:table-cell', cellClassName: 'px-4 py-2.5 text-right hidden md:table-cell' },
  { label: 'Position', align: 'right', className: 'px-4 py-3 font-semibold hidden md:table-cell', cellClassName: 'px-4 py-2.5 text-right hidden md:table-cell' },
  { label: 'Severity', align: 'right', className: 'px-4 py-3 font-semibold', cellClassName: 'px-4 py-2.5 text-right' },
];

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
    return checks.some(c => c.status === 'fail' || c.status === 'error' || (c.label === 'JSON-LD' && c.status === 'warn'));
  });
  if (issues.length === 0) return { status: 'pass', label: `${pages.length}/${pages.length} pages pass` };
  if (issues.length === pages.length) return { status: 'fail', label: `${issues.length}/${pages.length} have issues` };
  return { status: 'warn', label: `${pages.length - issues.length}/${pages.length} pages pass` };
}

function checksSummary(
  checks: { status: CheckStatus }[],
  labels: { fail: string; warn: string; pass: string },
): { status: CheckStatus; label: string } {
  if (checks.length === 0) return { status: 'pass', label: 'No pages' };
  const fails = checks.filter(c => c.status === 'fail');
  const warns = checks.filter(c => c.status === 'warn');
  const n = (count: number) => `${count} page${count > 1 ? 's' : ''}`;
  if (fails.length > 0) return { status: 'fail', label: `${n(fails.length)} ${labels.fail}` };
  if (warns.length > 0) return { status: 'warn', label: `${n(warns.length)} ${labels.warn}` };
  return { status: 'pass', label: labels.pass };
}

async function loadCwvSummaryForAudit(
  siteId: string,
): Promise<[string, { value: CwvAuditSummary | null; failed: boolean }]> {
  const result = await loadOrFlag(`AuditPage CWV ${siteId}`, getCwvAuditSummary(siteId), null);
  return [siteId, result];
}

function auditFreshness(timestampMs: number): { className: string; prefix: string } {
  const ageMs = Date.now() - timestampMs;
  if (ageMs >= AUDIT_VERY_STALE_MS) return { className: 'text-red-400', prefix: 'Very stale · ' };
  if (ageMs >= AUDIT_STALE_MS) return { className: 'text-amber-400', prefix: 'Stale · ' };
  return { className: 'text-neutral-700', prefix: '' };
}

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ period?: QueryParamValue }> }) {
  const sp = await searchParams;
  const period = parseAllowedIntegerParam(sp.period, AUDIT_DECAY_PERIODS, 7) as 7 | 30;

  const [auditsResult, managedSitesResult, decayResult, discoveredResult] = await Promise.all([
    loadOrFlag('AuditPage audits', cachedAuditAllSites(), []),
    loadOrFlag('AuditPage managed sites', getManagedSites(), []),
    loadOrFlag('AuditPage decay', detectAllDecay(period), []),
    loadOrFlag('AuditPage GA4 discovery', discoverPropertyIdsWithStatus(), { sites: [], failed: false }),
  ]);
  const audits = auditsResult.value;
  const managedSites = managedSitesResult.value;
  const decayResults = decayResult.value;
  const discoveredSites = discoveredResult.value.sites;
  const partialFailures: string[] = [];
  if (auditsResult.failed) partialFailures.push('site audits');
  if (managedSitesResult.failed) partialFailures.push('managed sites');
  if (decayResult.failed) partialFailures.push('content decay');
  if (discoveredResult.failed || discoveredResult.value.failed) partialFailures.push('GA4 discovery');

  if (managedSites.length === 0) {
    return (
      <div className="space-y-8">
        <div>
          <h1 className="text-2xl font-bold text-white">SEO Audit</h1>
        </div>
        {managedSitesResult.failed ? (
          <Notice
            tone="danger"
            size="none"
            className="bg-neutral-900 rounded-lg border border-neutral-800 border-l-4 border-l-red-500 p-6"
            role="alert"
          >
            <p className="text-red-400 font-semibold">Couldn&apos;t load managed sites</p>
            <p className="text-neutral-500 text-sm mt-2">
              The sites table failed to read. Check the server logs and use Refresh to retry.
            </p>
          </Notice>
        ) : (
          <NoSitesNotice variant="inline" />
        )}
      </div>
    );
  }

  if (audits.length === 0) {
    return (
      <div className="space-y-8">
        <div>
          <h1 className="text-2xl font-bold text-white">SEO Audit</h1>
          <p className="text-neutral-500 text-sm mt-1">Live checks · {managedSites.length} sites</p>
        </div>
        <PartialFailureBanner failures={partialFailures} />
        <Notice
          tone="warning"
          size="none"
          className="bg-neutral-900 rounded-lg border border-neutral-800 border-l-4 border-l-amber-500 p-6"
        >
          <p className="text-amber-400 font-semibold">No audit data available</p>
          <p className="text-neutral-500 text-sm mt-2">
            Audit results could not be loaded for the configured sites. Use Refresh to retry the cached checks.
          </p>
        </Notice>
      </div>
    );
  }

  const propertyIdBySite = new Map(
    discoveredSites.map((site) => [site.id, site.ga4PropertyId || '']),
  );

  const cwvEntries = await Promise.all(
    managedSites.map((site) => loadCwvSummaryForAudit(site.id))
  );
  const cwvSummaries: Record<string, CwvAuditSummary | null> = {};
  let cwvFailedCount = 0;
  for (const [siteId, result] of cwvEntries) {
    cwvSummaries[siteId] = result.value;
    if (result.failed) cwvFailedCount += 1;
  }
  if (cwvFailedCount > 0) {
    partialFailures.push(`Core Web Vitals (${cwvFailedCount} site${cwvFailedCount === 1 ? '' : 's'})`);
  }

  let totalPass = 0;
  let totalWarn = 0;
  let totalFail = 0;
  let healthySites = 0;
  for (const a of audits) {
    totalPass += a.score.pass;
    totalWarn += a.score.warn;
    totalFail += a.score.fail + a.score.error;
    if (a.score.total > 0 && a.score.pass / a.score.total >= 0.9) healthySites += 1;
  }
  const totalChecks = totalPass + totalWarn + totalFail;
  const healthPct = totalChecks > 0 ? Math.round((totalPass / totalChecks) * 100) : 0;

  const allSiteGaps: SiteGap[] = [];
  const gapCountBySite = new Map<string, number>();
  const siteGapRows = await Promise.all(audits.map(async (audit) => {
    const site = managedSites.find((candidate) => candidate.id === audit.siteId);
    if (!site) return null;

    const propertyId = propertyIdBySite.get(site.id) || site.ga4PropertyId || '';
    const signalsResult = await loadOrFlag(
      `AuditPage gaps ${site.id}`,
      loadSiteGapSignals(site, propertyId, period),
      null,
    );
    if (!signalsResult.value) return { site, gaps: [], failed: signalsResult.failed };
    const { gaps } = analyzeSiteGaps(audit, site, signalsResult.value);
    return { site, gaps, failed: signalsResult.failed };
  }));

  let gapSignalFailures = 0;
  for (const row of siteGapRows) {
    if (row?.failed) gapSignalFailures += 1;
  }
  if (gapSignalFailures > 0) {
    partialFailures.push(`gap analysis signals (${gapSignalFailures} site${gapSignalFailures === 1 ? '' : 's'})`);
  }

  for (const row of siteGapRows) {
    if (!row) continue;
    gapCountBySite.set(row.site.id, row.gaps.length);
    for (const gap of row.gaps) {
      allSiteGaps.push({ gap, siteId: row.site.id, siteName: row.site.name, domain: row.site.domain });
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
  const healthStatus = healthPct >= 90 ? 'pass' : healthPct >= 70 ? 'warn' : 'fail';
  const healthColors = STATUS_COLORS[healthStatus];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white">SEO Audit</h1>
        <p className="text-neutral-500 text-sm mt-1">Live checks · {audits.length} sites</p>
        <div className="mt-3">
          <TextLink href="/audit/cross-links" size="inherit" variant="inherit" className="inline-flex group">
            <Badge size="compact" className="border-neutral-800 px-3 py-1 font-normal text-neutral-300 transition-colors group-hover:bg-neutral-800/50">
              Cross-site links
            </Badge>
          </TextLink>
        </div>
      </div>
      <PartialFailureBanner failures={partialFailures} />
      <div className="flex gap-6 items-center">
        <div className="bg-neutral-900 rounded-lg border border-neutral-800 p-5 flex items-center gap-5 shrink-0">
          <div className="relative size-24">
            <svg viewBox="0 0 100 100" className="size-24 -rotate-90">
              <circle cx="50" cy="50" r="42" fill="none" stroke={CHART_NEUTRALS.grid} strokeWidth="8" />
              <circle
                cx="50" cy="50" r="42" fill="none"
                stroke={healthColors.chart}
                strokeWidth="8" strokeLinecap="round"
                strokeDasharray={`${healthPct * 2.64} 264`}
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className={`text-lg font-bold font-mono ${healthColors.text}`}>
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
          const canonical = summarizeCanonicalChecks(audit.metaTags);
          const images = checksSummary(audit.imageSeo, { fail: 'missing alt', warn: 'need alt', pass: 'All images have alt' });
          const links = checksSummary(audit.internalLinks, { fail: 'no links', warn: 'low links', pass: 'Good linking' });
          const site = managedSites.find(s => s.id === audit.siteId);
          const gapCount = gapCountBySite.get(audit.siteId) ?? 0;
          const cwv = cwvSummaries[audit.siteId] ?? null;
          const freshness = auditFreshness(audit.timestamp);
          return (
            <TextLink
              key={audit.siteId}
              href={`/${encodeURIComponent(audit.siteId)}`}
              size="inherit"
              variant="inherit"
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
                    <Badge className="border-neutral-700 text-neutral-500">
                      {gapCount} {gapCount === 1 ? 'recommendation' : 'recommendations'}
                    </Badge>
                  )}
                  {audit.sampledPages.length > 0 && (
                    <Badge className="border-neutral-800 text-neutral-600">
                      {audit.sampledPages.length} {audit.sampledPages.length === 1 ? 'page' : 'pages'} sampled
                    </Badge>
                  )}
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className="text-neutral-600 text-xs">View details →</span>
                  <span className={`${freshness.className} text-[10px]`}>
                    {freshness.prefix}Checked {formatRelativeTime(audit.timestamp)}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-10 gap-3">
                <CheckItem label="robots.txt" status={audit.robotsTxt.status} />
                <CheckItem label="Sitemap" status={audit.sitemap.status} />
                <CheckItem label="SC Sitemap" status={audit.scSitemapFreshness.status} />
                <CheckItem label="Indexing" status={audit.indexingCoverage.status} sublabel={audit.indexingCoverage.coveragePct != null ? `${audit.indexingCoverage.coveragePct}%` : undefined} />
                <CheckItem label="Meta Tags" status={meta.status} sublabel={meta.label} />
                <CheckItem label="Canonical" status={canonical.status} sublabel={canonical.compactLabel} />
                <CheckItem label="OG Image" status={audit.ogImage.status} />
                <CheckItem label="Images" status={images.status} sublabel={images.label} />
                <CheckItem label="Int. Links" status={links.status} sublabel={links.label} />
                <CheckItem label="TTFB" status={audit.ttfb.status} sublabel={audit.ttfb.ms ? `${audit.ttfb.ms}ms` : undefined} />
              </div>
              {cwv && Object.keys(cwv.metrics).length > 0 && (
                <div className="mt-3 pt-3 border-t border-neutral-800 flex items-center gap-4 flex-wrap">
                  <Badge uppercase className="shrink-0 border-neutral-800 text-neutral-600">
                    CWV
                  </Badge>
                  {(['LCP', 'INP', 'CLS'] as CwvMetricName[]).map(name => {
                    const metric = cwv.metrics[name];
                    if (!metric) return null;
                    const colors = CWV_RATING_COLORS[metric.rating];
                    const t = CWV_THRESHOLDS[name];
                    const display = t.unit === 'ms' ? `${Math.round(metric.value)}ms` : metric.value.toFixed(3);
                    return (
                      <div key={name} className="flex items-center gap-1.5">
                        <span className="text-neutral-500 text-[10px]">{name}</span>
                        <span className={`text-[10px] font-mono font-semibold ${colors.text}`}>{display}</span>
                      </div>
                    );
                  })}
                  <PerformanceSourceBadge source={cwv.source} className="ml-auto" />
                </div>
              )}
            </TextLink>
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
          <TimeRange param="period" options={[{ value: '7', label: '7d' }, { value: '30', label: '30d' }]} />
        </div>

        <div className="grid grid-cols-3 gap-4">
          <MetricCard label="Decaying Pages" current={allDecaying.length} accent="border-l-red-500" valueColor="text-red-400" />
          <MetricCard label="Severe" current={severeCount} accent="border-l-amber-500" valueColor="text-amber-400" />
          <MetricCard label="Sites Affected" current={decaySitesAffected} accent="border-l-blue-500" valueColor="text-blue-400" />
        </div>

        {allDecaying.length === 0 ? (
          <Notice
            tone="success"
            size="none"
            className="bg-neutral-900 rounded-lg border border-neutral-800 border-l-4 border-l-emerald-500 p-8 text-center"
          >
            <svg className="size-12 mx-auto text-emerald-500 mb-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
              <polyline points="22 4 12 14.01 9 11.01" />
            </svg>
            <p className="text-emerald-400 font-bold text-lg">All clear — no content decay</p>
            <p className="text-neutral-500 text-sm mt-2 max-w-md mx-auto">
              Every page across all {decayResults.length} sites is maintaining or growing traffic over the last {period} days.
            </p>
          </Notice>
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
                <Badge key="severity" className={`${colors.badgeBg} ${colors.badge} !border-0 uppercase`}>
                  {page.severity}
                </Badge>,
              ];
            })}
            rowKeys={allDecaying.map((page) => `${page.siteId}:${page.page}`)}
            containerClassName="bg-neutral-900 rounded-lg border border-neutral-800 overflow-hidden"
            tableClassName="w-full text-sm"
            headRowClassName="border-b border-neutral-800 text-neutral-500 text-xs uppercase tracking-wider"
            rowClassName="hover:bg-neutral-800/30 transition-colors"
          />
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
