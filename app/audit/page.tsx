import Link from 'next/link';
import { cachedAuditAllSites, type CheckStatus, type SiteAuditResult } from '@/lib/audit';
import { getManagedSites } from '@/lib/sites';
import { analyzeSiteGaps } from '@/lib/gaps';
import { CopyButton } from '../components/copy-button';

export const revalidate = 300;

function formatRelativeTime(timestampMs: number): string {
  const now = Date.now();
  const diff = now - timestampMs;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (seconds < 60) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days === 1) return 'yesterday';
  return `${days}d ago`;
}

const statusColors: Record<CheckStatus, string> = {
  pass: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  warn: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  fail: 'bg-red-500/10 text-red-400 border-red-500/20',
  error: 'bg-neutral-500/10 text-neutral-400 border-neutral-500/20',
};

const statusDots: Record<CheckStatus, string> = {
  pass: 'bg-emerald-500',
  warn: 'bg-amber-500',
  fail: 'bg-red-500',
  error: 'bg-neutral-500',
};

const accentBorder: Record<string, string> = {
  pass: 'border-l-emerald-500',
  warn: 'border-l-amber-500',
  fail: 'border-l-red-500',
  error: 'border-l-neutral-600',
};

function StatusBadge({ status, label }: { status: CheckStatus; label?: string }) {
  const labels: Record<CheckStatus, string> = { pass: 'Pass', warn: 'Warn', fail: 'Fail', error: 'Error' };
  return (
    <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${statusColors[status]}`}>
      {label || labels[status]}
    </span>
  );
}

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

export default async function AuditPage() {
  const [audits, managedSites] = await Promise.all([cachedAuditAllSites(), getManagedSites()]);

  const totalPass = audits.reduce((s, a) => s + a.score.pass, 0);
  const totalWarn = audits.reduce((s, a) => s + a.score.warn, 0);
  const totalFail = audits.reduce((s, a) => s + a.score.fail + a.score.error, 0);
  const totalChecks = totalPass + totalWarn + totalFail;
  const healthPct = totalChecks > 0 ? Math.round((totalPass / totalChecks) * 100) : 0;
  const healthySites = audits.filter(a => a.score.total > 0 && a.score.pass / a.score.total >= 0.9).length;
  const totalRecs = audits.reduce((s, a) => {
    const site = managedSites.find(si => si.id === a.siteId);
    return s + (site ? analyzeSiteGaps(a, site).gaps.length : 0);
  }, 0);

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

      {/* Summary with health ring */}
      <div className="flex gap-6 items-center">
        {/* Health ring */}
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

        {/* Stat cards */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 flex-1">
          <div className="bg-neutral-900 rounded-lg border border-neutral-800 border-l-4 border-l-emerald-500 p-4">
            <div className="text-neutral-500 text-xs uppercase tracking-wider mb-1">Passed</div>
            <div className="text-emerald-400 text-2xl font-mono font-bold">{totalPass}</div>
          </div>
          <div className="bg-neutral-900 rounded-lg border border-neutral-800 border-l-4 border-l-amber-500 p-4">
            <div className="text-neutral-500 text-xs uppercase tracking-wider mb-1">Warnings</div>
            <div className="text-amber-400 text-2xl font-mono font-bold">{totalWarn}</div>
          </div>
          <div className="bg-neutral-900 rounded-lg border border-neutral-800 border-l-4 border-l-red-500 p-4">
            <div className="text-neutral-500 text-xs uppercase tracking-wider mb-1">Failures</div>
            <div className="text-red-400 text-2xl font-mono font-bold">{totalFail}</div>
          </div>
        </div>
      </div>

      {/* Site cards */}
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
