import { withCache } from './db';
import { auditPageMetaTags, type CheckResult, type SiteAuditResult } from './audit';
import { cachedGetSearchConsolePages } from './search-console';
import { getSCUrl, type Site } from './sites';
import { normalizeSkipChecks, type SkipCheckId } from './skip-checks';

const PAGE_LIMIT = 20;
const META_AUDIT_LIMIT = 10;
const META_AUDIT_TIMEOUT_MS = 3_000;
const META_AUDIT_CANONICAL_TIMEOUT_MS = 1_500;
const QUICK_WIN_IMPRESSIONS = 100;
const QUICK_WIN_CTR = 0.03;

type PageMetaTagResult = SiteAuditResult['metaTags'][number];

interface PageCheckSummary {
  title: CheckResult;
  description: CheckResult;
  ogImage: CheckResult;
  canonical: CheckResult;
}

export interface PageOpportunityRow {
  page: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
  issueCount: number;
  opportunityScore: number;
  quickWin: boolean;
  checks: PageCheckSummary;
}

function normalizePageKey(value: string): string {
  try {
    const url = value.startsWith('http://') || value.startsWith('https://')
      ? new URL(value)
      : new URL(value, 'https://placeholder.local');
    return (url.pathname.replace(/\/+$/, '') || '/').toLowerCase();
  } catch {
    return (value.split('?')[0]?.split('#')[0]?.replace(/\/+$/, '') || '/').toLowerCase();
  }
}

function countIssues(checks: PageCheckSummary): number {
  return Object.values(checks).filter((check) => check.status === 'warn' || check.status === 'fail' || check.status === 'error').length;
}

function applySkipToCheck(check: CheckResult, skip: Set<SkipCheckId>, checkId: SkipCheckId): CheckResult {
  if (!skip.has(checkId)) return check;
  return {
    ...check,
    status: 'pass',
    message: `N/A — ${check.message}`,
  };
}

function applySkipChecks(checks: PageCheckSummary, skip: Set<SkipCheckId>): PageCheckSummary {
  return {
    title: applySkipToCheck(checks.title, skip, 'title'),
    description: applySkipToCheck(checks.description, skip, 'description'),
    ogImage: applySkipToCheck(checks.ogImage, skip, 'ogImageMeta'),
    canonical: applySkipToCheck(checks.canonical, skip, 'canonical'),
  };
}

function buildMetaMap(metaTags: PageMetaTagResult[]): Map<string, PageMetaTagResult> {
  return new Map(metaTags.map((meta) => [normalizePageKey(meta.page), meta]));
}

function fallbackCheck(label: string): CheckResult {
  return {
    status: 'pass',
    label,
    message: 'N/A — Audit not run for this page',
  };
}

function fallbackChecks(): PageCheckSummary {
  return {
    title: fallbackCheck('title'),
    description: fallbackCheck('description'),
    ogImage: fallbackCheck('og:image'),
    canonical: fallbackCheck('canonical'),
  };
}

export async function getPageOpportunityRows(
  site: Site,
  days: number,
): Promise<PageOpportunityRow[]> {
  if (!site.searchConsole) return [];
  const skip = new Set(normalizeSkipChecks(site.skipChecks));

  return withCache<PageOpportunityRow[]>(
    `page-opportunities-${days}`,
    site.id,
    async () => {
      const scPages = await cachedGetSearchConsolePages(getSCUrl(site), days, PAGE_LIMIT);
      if (!scPages || scPages.length === 0) return [];

      const pagesToAudit = scPages.slice(0, META_AUDIT_LIMIT);
      const metaTags = await auditPageMetaTags(
        site.domain,
        pagesToAudit.map((page) => page.page),
        {
          concurrency: 3,
          timeoutMs: META_AUDIT_TIMEOUT_MS,
          canonicalTimeoutMs: META_AUDIT_CANONICAL_TIMEOUT_MS,
          retries: 0,
        },
      ).catch((error) => {
        console.error(`Error auditing page opportunities for ${site.id}:`, error);
        return [];
      });
      const metaByPage = buildMetaMap(metaTags);

      return scPages.map((page) => {
        const meta = metaByPage.get(normalizePageKey(page.page));
        const rawChecks: PageCheckSummary = meta
          ? {
            title: meta.title,
            description: meta.description,
            ogImage: meta.ogImage,
            canonical: meta.canonical,
          }
          : fallbackChecks();
        const checks = applySkipChecks(rawChecks, skip);

        const issueCount = countIssues(checks);
        const quickWin = page.impressions >= QUICK_WIN_IMPRESSIONS && page.ctr < QUICK_WIN_CTR && issueCount > 0;

        return {
          page: page.page,
          clicks: page.clicks,
          impressions: page.impressions,
          ctr: page.ctr,
          position: page.position,
          issueCount,
          opportunityScore: (quickWin ? 1000 : 0) + page.impressions + issueCount * 100 - Math.round(page.ctr * 100),
          quickWin,
          checks,
        };
      });
    },
  ).then((rows) => rows ?? []);
}
