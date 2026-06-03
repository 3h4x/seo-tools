import { getManagedSites, getSCUrl, type Site } from './sites';
import { searchconsole_v1 } from '@googleapis/searchconsole';
import { getAuth } from './google-auth';
import { normalizeSkipChecks, type SkipCheckId } from './skip-checks';
import { checkIndexNowKey } from './indexnow.js';
import { dateOnlyDaysBack, dateStr } from './date-only';

export type CheckStatus = 'pass' | 'warn' | 'fail' | 'error';

export interface CheckResult {
  status: CheckStatus;
  label: string;
  message: string;
  details?: string;
  rawLength?: number;
  rawValue?: string;
}

interface RobotsTxtResult extends CheckResult {
  raw?: string;
  hasSitemapDirective: boolean;
  sitemapUrl?: string;
}

interface SitemapResult extends CheckResult {
  url?: string;
  urlCount?: number;
  isIndex?: boolean;
  hasLastmod?: boolean;
  lastmodSample?: string;
  locs?: string[];
  checkedUrlCount?: number;
  deadUrlCount?: number;
  deadUrls?: string[];
  crawledPagesInSitemap?: number;
  crawledPagesChecked?: number;
  crawlCoveragePct?: number;
  staleLastmodCount?: number;
  checkedLastmodCount?: number;
  staleLastmodThresholdDays?: number;
}

interface MetaTagResult {
  page: string;
  ogImageUrl?: string;
  noindex: boolean;
  canonicalValid: boolean | null;
  canonicalStatus: number | null;
  canonicalTarget: string | null;
  title: CheckResult;
  description: CheckResult;
  ogTitle: CheckResult;
  ogImage: CheckResult;
  ogDescription: CheckResult;
  twitterCard: CheckResult;
  canonical: CheckResult;
  jsonLd: CheckResult;
}

interface OgImageResult extends CheckResult {
  url?: string;
  contentType?: string;
  dimensions?: string;
}

interface TtfbResult extends CheckResult {
  ms?: number;
}

interface RedirectHop {
  url: string;
  status: number;
  location?: string;
}

interface RedirectChainResult extends CheckResult {
  page: string;
  requestedUrl: string;
  finalUrl: string;
  hops: RedirectHop[];
  hopCount: number;
  hasTemporaryRedirect: boolean;
  loopDetected: boolean;
}

interface ImageDetail {
  src: string;
  hasAlt: boolean;
  altText?: string;
  isLazy: boolean;
}

interface ImageSeoResult {
  page: string;
  totalImages: number;
  withAlt: number;
  withoutAlt: number;
  withLazyLoading: number;
  status: CheckStatus;
  label: string;
  message: string;
  images: ImageDetail[];
}

interface InternalLinkResult {
  page: string;
  internalLinks: number;
  externalLinks: number;
  checkedInternalLinks: number;
  brokenLinks: Array<{
    url: string;
    status: number;
  }>;
  brokenLinksMessage: string;
  status: CheckStatus;
  label: string;
  message: string;
}

interface SecurityResult {
  https: CheckResult;
  hsts: CheckResult;
  favicon: CheckResult;
}

interface IndexingCoverageResult extends CheckResult {
  sitemapUrls?: number;
  indexedPages?: number;
  coveragePct?: number;
}

interface UrlInspectionPageResult extends CheckResult {
  page: string;
  inspectionUrl: string;
  verdict?: string;
  coverageState?: string;
  indexingState?: string;
  lastCrawlTime?: string;
  mobileUsabilityVerdict?: string;
  richResultsVerdict?: string;
  referringUrls?: string[];
  googleCanonical?: string;
  userCanonical?: string;
  inspectionResultLink?: string;
}

function applySkipToCheck<T extends CheckResult>(check: T, skip: Set<SkipCheckId>, checkId: SkipCheckId): T {
  if (!skip.has(checkId)) return check;
  return {
    ...check,
    status: 'pass',
    message: `N/A — ${check.message}`,
  };
}

export interface SiteAuditResult {
  siteId: string;
  domain: string;
  timestamp: number;
  robotsTxt: RobotsTxtResult;
  sitemap: SitemapResult;
  scSitemapFreshness: CheckResult;
  indexingCoverage: IndexingCoverageResult;
  indexNow: CheckResult;
  urlInspection: UrlInspectionPageResult[];
  redirectChains: RedirectChainResult[];
  metaTags: MetaTagResult[];
  ogImage: OgImageResult;
  ttfb: TtfbResult;
  imageSeo: ImageSeoResult[];
  internalLinks: InternalLinkResult[];
  security: SecurityResult;
  score: { pass: number; warn: number; fail: number; error: number; total: number };
  sampledPages: string[];
}

const LEGACY_INDEXNOW_DEFAULT: CheckResult = {
  status: 'warn',
  label: 'IndexNow',
  message: 'Not audited (legacy cache — refresh to update)',
};

function makeAuditUnavailableCheck(label: string): CheckResult {
  return {
    status: 'error',
    label,
    message: 'Audit unavailable',
  };
}

export function createFailedSiteAuditResult(site: Site): SiteAuditResult {
  return {
    siteId: site.id,
    domain: site.domain,
    timestamp: Date.now(),
    robotsTxt: {
      ...makeAuditUnavailableCheck('robots.txt'),
      hasSitemapDirective: false,
    },
    sitemap: makeAuditUnavailableCheck('Sitemap'),
    scSitemapFreshness: makeAuditUnavailableCheck('SC Sitemap'),
    indexingCoverage: makeAuditUnavailableCheck('Indexing'),
    indexNow: makeAuditUnavailableCheck('IndexNow'),
    urlInspection: [],
    redirectChains: [],
    metaTags: [],
    ogImage: makeAuditUnavailableCheck('OG Image'),
    ttfb: makeAuditUnavailableCheck('TTFB'),
    imageSeo: [],
    internalLinks: [],
    security: {
      https: makeAuditUnavailableCheck('HTTPS'),
      hsts: makeAuditUnavailableCheck('HSTS'),
      favicon: makeAuditUnavailableCheck('Favicon'),
    },
    score: { pass: 0, warn: 0, fail: 0, error: 1, total: 1 },
    sampledPages: site.testPages ?? [],
  };
}

export function normalizeSiteAuditResult(audit: SiteAuditResult): SiteAuditResult {
  return {
    ...audit,
    indexNow: audit.indexNow ?? LEGACY_INDEXNOW_DEFAULT,
    urlInspection: audit.urlInspection ?? [],
    redirectChains: audit.redirectChains ?? [],
    internalLinks: (audit.internalLinks ?? []).map((link) => ({
      ...link,
      checkedInternalLinks: link.checkedInternalLinks ?? 0,
      brokenLinks: link.brokenLinks ?? [],
      brokenLinksMessage: link.brokenLinksMessage ?? 'Broken-link verification unavailable in cached audit',
    })),
  };
}

export const MAX_SAMPLED_PAGES = 10;
const SITEMAP_SAMPLE_LIMIT = 5;
const SC_SAMPLE_LIMIT = 5;
const INTERNAL_LINK_HEALTH_LIMIT = 20;
const INTERNAL_LINK_HEALTH_CONCURRENCY = 5;
const CACHE_TTL_DAY = 24 * 60 * 60 * 1000;

export function extractLocsFromSitemap(xml: string): string[] {
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/gi)].map(m => m[1].trim());
}

function getDateAgeInDays(value: string): number | null {
  const timestamp = new Date(value).getTime();
  if (Number.isNaN(timestamp)) return null;
  return (Date.now() - timestamp) / (1000 * 60 * 60 * 24);
}

function summarizeStatuses(statuses: CheckStatus[]): CheckStatus {
  if (statuses.includes('fail')) return 'fail';
  if (statuses.includes('warn')) return 'warn';
  if (statuses.includes('error')) return 'error';
  return 'pass';
}

function getSc() {
  return new searchconsole_v1.Searchconsole({ auth: getAuth() });
}

function toAbsoluteAuditUrl(domain: string, page: string): string {
  return `https://${domain}${page.startsWith('/') ? page : `/${page}`}`;
}

function describeUrlInspectionStatus(
  result: searchconsole_v1.Schema$UrlInspectionResult | undefined,
): Pick<UrlInspectionPageResult, 'status' | 'message' | 'verdict' | 'coverageState' | 'indexingState' | 'lastCrawlTime' | 'mobileUsabilityVerdict' | 'richResultsVerdict' | 'referringUrls' | 'googleCanonical' | 'userCanonical' | 'inspectionResultLink'> {
  const indexStatus = result?.indexStatusResult;
  const coverageState = indexStatus?.coverageState ?? undefined;
  const indexingState = indexStatus?.indexingState ?? undefined;
  const verdict = indexStatus?.verdict ?? undefined;
  const mobileUsabilityVerdict = result?.mobileUsabilityResult?.verdict ?? undefined;
  const richResultsVerdict = result?.richResultsResult?.verdict ?? undefined;
  const lastCrawlTime = indexStatus?.lastCrawlTime ?? undefined;
  const normalizedSummary = `${coverageState ?? ''} ${indexingState ?? ''} ${verdict ?? ''}`.toLowerCase();

  let status: CheckStatus = 'warn';
  if (
    normalizedSummary.includes('not indexed')
    || normalizedSummary.includes('blocked')
    || normalizedSummary.includes('noindex')
  ) {
    status = 'fail';
  } else if (normalizedSummary.includes('indexed') || verdict === 'PASS') {
    status = 'pass';
  } else if (verdict === 'FAIL') {
    status = 'fail';
  }

  const primaryMessage = coverageState ?? indexingState ?? verdict ?? 'Inspection data unavailable';
  const secondaryMessage = indexingState && indexingState !== coverageState ? ` · ${indexingState}` : '';

  return {
    status,
    message: `${primaryMessage}${secondaryMessage}`,
    verdict,
    coverageState,
    indexingState,
    lastCrawlTime,
    mobileUsabilityVerdict,
    richResultsVerdict,
    referringUrls: indexStatus?.referringUrls ?? undefined,
    googleCanonical: indexStatus?.googleCanonical ?? undefined,
    userCanonical: indexStatus?.userCanonical ?? undefined,
    inspectionResultLink: result?.inspectionResultLink ?? undefined,
  };
}

async function checkUrlInspection(scUrl: string, pageUrl: string, page: string): Promise<UrlInspectionPageResult> {
  try {
    const response = await getSc().urlInspection.index.inspect({
      requestBody: {
        inspectionUrl: pageUrl,
        siteUrl: scUrl,
        languageCode: 'en-US',
      },
    });
    const described = describeUrlInspectionStatus(response.data.inspectionResult);
    return {
      page,
      inspectionUrl: pageUrl,
      label: 'URL Inspection',
      ...described,
    };
  } catch (error) {
    console.error(`Error inspecting URL ${pageUrl}:`, error);
    return {
      page,
      inspectionUrl: pageUrl,
      status: 'error',
      label: 'URL Inspection',
      message: 'Search Console inspection unavailable',
    };
  }
}

async function checkUrlInspectionForSite(site: Site): Promise<UrlInspectionPageResult[]> {
  if (site.searchConsole === false || site.testPages.length === 0) return [];

  const scUrl = getSCUrl(site);
  return Promise.all(
    site.testPages.map(async (page) => {
      const pageUrl = toAbsoluteAuditUrl(site.domain, page);
      const cacheId = `${site.id}:${page}`;
      const cached = await withCache<UrlInspectionPageResult>(
        'url-inspection',
        cacheId,
        () => checkUrlInspection(scUrl, pageUrl, page),
        CACHE_TTL_DAY,
      );

      return cached ?? {
        page,
        inspectionUrl: pageUrl,
        status: 'error',
        label: 'URL Inspection',
        message: 'Search Console inspection unavailable',
      };
    }),
  );
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) return [];

  const results = new Array<R>(items.length);
  let nextIndex = 0;

  async function runWorker() {
    while (true) {
      const currentIndex = nextIndex++;
      if (currentIndex >= items.length) return;
      results[currentIndex] = await worker(items[currentIndex], currentIndex);
    }
  }

  const workerCount = Math.min(concurrency, items.length);
  await Promise.all(Array.from({ length: workerCount }, () => runWorker()));
  return results;
}

function extractInternalPagePaths(html: string, domain: string): string[] {
  const matches = [...html.matchAll(/<a\s+[^>]*href=["']([^"']+)["']/gi)];
  const seen = new Set<string>();
  const paths: string[] = [];

  for (const match of matches) {
    const href = match[1]?.trim();
    if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:') || href.startsWith('javascript:')) {
      continue;
    }

    try {
      const url = href.startsWith('/')
        ? new URL(`https://${domain}${href}`)
        : new URL(href);

      if (url.hostname !== domain) continue;

      const path = `${url.pathname || '/'}${url.search || ''}`;
      if (seen.has(path)) continue;
      seen.add(path);
      paths.push(path);
    } catch {
      continue;
    }
  }

  return paths;
}

interface ResolvedSitemapUrls {
  entries: Array<{
    url: string;
    lastmod?: string;
  }>;
}

function extractSitemapUrlEntries(xml: string): Array<{ url: string; lastmod?: string }> {
  return [...xml.matchAll(/<url\b[^>]*>([\s\S]*?)<\/url>/gi)].flatMap((match) => {
    const block = match[1] ?? '';
    const locMatch = block.match(/<loc>([^<]+)<\/loc>/i);
    const url = locMatch?.[1]?.trim();
    if (!url) return [];

    const lastmodMatch = block.match(/<lastmod>([^<]+)<\/lastmod>/i);
    const lastmod = lastmodMatch?.[1]?.trim();

    return [{ url, ...(lastmod ? { lastmod } : {}) }];
  });
}

async function collectSitemapUrls(
  sitemapUrl: string,
  remaining: number,
  visited = new Set<string>(),
): Promise<ResolvedSitemapUrls> {
  if (remaining <= 0 || visited.has(sitemapUrl)) {
    return { entries: [] };
  }

  visited.add(sitemapUrl);

  const res = await safeFetch(sitemapUrl);
  if (!res.ok) {
    return { entries: [] };
  }

  const isIndex = res.text.includes('<sitemapindex');
  const isUrlset = res.text.includes('<urlset');
  if (!isIndex && !isUrlset) {
    return { entries: [] };
  }

  if (isUrlset) {
    return { entries: extractSitemapUrlEntries(res.text).slice(0, remaining) };
  }

  const locs = extractLocsFromSitemap(res.text);
  const entries: Array<{ url: string; lastmod?: string }> = [];

  for (const childUrl of locs) {
    if (entries.length >= remaining) break;
    const child = await collectSitemapUrls(childUrl, remaining - entries.length, visited);
    entries.push(...child.entries);
  }

  return { entries };
}

async function getUrlHealthStatus(url: string): Promise<number> {
  const headRes = await safeFetch(url, { method: 'HEAD', ua: GOOGLEBOT_UA });
  if (headRes.status !== 405 && headRes.status !== 501 && headRes.status !== 0) {
    return headRes.status;
  }

  const getRes = await safeFetch(url, { ua: GOOGLEBOT_UA });
  return getRes.status;
}

async function getInternalLinkHealthStatus(url: string): Promise<number> {
  const headRes = await safeFetch(url, {
    method: 'HEAD',
    ua: GOOGLEBOT_UA,
    timeoutMs: 5_000,
  });
  if (headRes.status !== 405 && headRes.status !== 501 && headRes.status !== 0) {
    return headRes.status;
  }

  const getRes = await safeFetch(url, { ua: GOOGLEBOT_UA, timeoutMs: 5_000 });
  return getRes.status;
}

async function enrichSitemapResult(sitemap: SitemapResult): Promise<SitemapResult> {
  if (!sitemap.url || sitemap.status === 'fail') {
    return sitemap;
  }

  const resolved = await collectSitemapUrls(sitemap.url, SITEMAP_URL_HEALTH_LIMIT);
  const checkedUrlCount = resolved.entries.length;

  let deadUrlCount = 0;
  const deadUrls: string[] = [];

  const urlHealthStatuses = await Promise.all(
    resolved.entries.map(({ url }) => getUrlHealthStatus(url)),
  );

  for (const [index, status] of urlHealthStatuses.entries()) {
    if (status >= 400) {
      deadUrlCount++;
      deadUrls.push(`${resolved.entries[index].url} (${status})`);
    }
  }

  // These coverage fields summarize the sitemap URL health sample:
  // how many sampled URLs were reachable versus dead.
  const crawledPagesChecked = checkedUrlCount;
  const crawledPagesInSitemap = Math.max(checkedUrlCount - deadUrlCount, 0);
  const crawlCoveragePct = crawledPagesChecked > 0
    ? Math.round((crawledPagesInSitemap / crawledPagesChecked) * 100)
    : undefined;

  const sampledLastmods = resolved.entries.flatMap((entry) => entry.lastmod ? [entry.lastmod] : []);
  const staleLastmodCount = sampledLastmods.reduce((count, lastmod) => {
    const ageInDays = getDateAgeInDays(lastmod);
    return ageInDays != null && ageInDays > SITEMAP_STALE_LASTMOD_DAYS ? count + 1 : count;
  }, 0);
  const checkedLastmodCount = sampledLastmods.length;
  const allLastmodsStale = checkedLastmodCount > 0 && staleLastmodCount === checkedLastmodCount;

  const detailParts: string[] = [sitemap.message];
  if (checkedUrlCount > 0) {
    detailParts.push(`Checked ${checkedUrlCount} sitemap URL${checkedUrlCount === 1 ? '' : 's'}`);
  } else {
    detailParts.push('No sitemap URLs sampled for health checks');
  }

  if (checkedUrlCount > 0) {
    detailParts.push(
      deadUrlCount === 0
        ? 'No dead sitemap URLs found'
        : `${deadUrlCount} dead sitemap URL${deadUrlCount === 1 ? '' : 's'} found`,
    );
  }

  if (crawledPagesChecked > 0 && crawlCoveragePct != null) {
    detailParts.push(`Coverage ${crawledPagesInSitemap}/${crawledPagesChecked} sampled sitemap URLs reachable`);
  }

  if (checkedLastmodCount > 0) {
    detailParts.push(
      allLastmodsStale
        ? `All ${checkedLastmodCount} sampled lastmod dates are older than ${SITEMAP_STALE_LASTMOD_DAYS} days`
        : `${staleLastmodCount}/${checkedLastmodCount} sampled lastmod dates are older than ${SITEMAP_STALE_LASTMOD_DAYS} days`,
    );
  }

  const status = summarizeStatuses([
    sitemap.status,
    deadUrlCount > 0 ? 'fail' : 'pass',
    crawlCoveragePct != null && crawlCoveragePct < 100 ? 'warn' : 'pass',
    allLastmodsStale ? 'warn' : 'pass',
  ]);

  return {
    ...sitemap,
    status,
    message: detailParts.join(', '),
    details: deadUrls.length > 0 ? deadUrls.slice(0, 5).join('\n') : sitemap.details,
    checkedUrlCount,
    deadUrlCount,
    deadUrls,
    crawledPagesInSitemap,
    crawledPagesChecked,
    crawlCoveragePct,
    staleLastmodCount,
    checkedLastmodCount,
    staleLastmodThresholdDays: SITEMAP_STALE_LASTMOD_DAYS,
  };
}

export function sampleAuditPages(
  testPages: string[],
  sitemapLocs: string[],
  scPageUrls: string[],
  domain: string,
): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  const addPath = (path: string) => {
    if (seen.has(path) || result.length >= MAX_SAMPLED_PAGES) return false;
    seen.add(path);
    result.push(path);
    return true;
  };

  for (const p of testPages) {
    addPath(p.startsWith('/') ? p : `/${p}`);
  }

  let sitemapAdded = 0;
  for (const loc of sitemapLocs) {
    if (sitemapAdded >= SITEMAP_SAMPLE_LIMIT || result.length >= MAX_SAMPLED_PAGES) break;
    try {
      const url = new URL(loc);
      if (url.hostname !== domain) continue;
      const path = url.pathname + (url.search || '');
      if (addPath(path)) sitemapAdded++;
    } catch { /* skip invalid URLs */ }
  }

  let scAdded = 0;
  for (const page of scPageUrls) {
    if (scAdded >= SC_SAMPLE_LIMIT || result.length >= MAX_SAMPLED_PAGES) break;
    try {
      const url = new URL(page);
      if (url.hostname !== domain) continue;
      const path = url.pathname + (url.search || '');
      if (addPath(path)) scAdded++;
    } catch { /* skip invalid URLs */ }
  }

  return result;
}

const FETCH_TIMEOUT = 30_000;
const GOOGLEBOT_UA = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';
const MAX_REDIRECT_HOPS = 10;
const PERMANENT_REDIRECT_STATUSES = new Set([301, 308]);
const SITEMAP_URL_HEALTH_LIMIT = 50;
const SITEMAP_STALE_LASTMOD_DAYS = 90;

export interface FetchResult {
  ok: boolean;
  status: number;
  text: string;
  headers: Headers;
  ttfbMs: number;
  error?: string;
}

const MAX_RETRIES = 3;
const BASE_DELAY = 1_000;

async function safeFetch(
  url: string,
  opts?: { ua?: string; method?: string; redirect?: RequestRedirect; timeoutMs?: number },
): Promise<FetchResult> {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      const delay = BASE_DELAY * Math.pow(2, attempt - 1);
      await new Promise(r => setTimeout(r, delay));
    }
    const start = Date.now();
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(opts?.timeoutMs ?? FETCH_TIMEOUT),
        headers: opts?.ua ? { 'User-Agent': opts.ua } : undefined,
        method: opts?.method,
        redirect: opts?.redirect ?? 'follow',
      });
      const ttfbMs = Date.now() - start;
      if (res.status === 429 && attempt < MAX_RETRIES) continue;
      const text = await res.text();
      return { ok: res.ok, status: res.status, text, headers: res.headers, ttfbMs };
    } catch (e) {
      const isTimeout = e instanceof DOMException && e.name === 'TimeoutError';
      if ((isTimeout || (e instanceof Error && e.message.includes('abort'))) && attempt < MAX_RETRIES) continue;
      return {
        ok: false, status: 0, text: '', headers: new Headers(),
        ttfbMs: Date.now() - start,
        error: e instanceof Error ? e.message : String(e),
      };
    }
  }
  return { ok: false, status: 0, text: '', headers: new Headers(), ttfbMs: 0, error: 'Max retries exceeded' };
}

async function checkRobotsTxt(domain: string): Promise<RobotsTxtResult> {
  const res = await safeFetch(`https://${domain}/robots.txt`);

  if (!res.ok) {
    return {
      status: 'fail', label: 'robots.txt',
      message: res.error ? `Error: ${res.error}` : `Not found (${res.status})`,
      hasSitemapDirective: false,
    };
  }

  const lines = res.text.split('\n');
  const sitemapLine = lines.find(l => /^sitemap:/i.test(l.trim()));
  const sitemapUrl = sitemapLine?.replace(/^sitemap:\s*/i, '').trim();

  if (!sitemapLine) {
    return {
      status: 'warn', label: 'robots.txt', message: 'Found but no Sitemap directive',
      raw: res.text.slice(0, 500), hasSitemapDirective: false,
    };
  }

  return {
    status: 'pass', label: 'robots.txt', message: `Found with Sitemap: ${sitemapUrl}`,
    raw: res.text.slice(0, 500), hasSitemapDirective: true, sitemapUrl,
  };
}

async function checkSitemap(domain: string, sitemapUrl?: string): Promise<SitemapResult> {
  const urls = sitemapUrl
    ? [sitemapUrl]
    : [`https://${domain}/sitemap.xml`, `https://${domain}/sitemap-index.xml`];

  for (const url of urls) {
    const res = await safeFetch(url);
    if (!res.ok) continue;

    const isIndex = res.text.includes('<sitemapindex');
    const isUrlset = res.text.includes('<urlset');

    if (!isIndex && !isUrlset) continue;

    const urlCount = isIndex
      ? (res.text.match(/<sitemap>/gi) || []).length
      : (res.text.match(/<url>/gi) || []).length;

    const lastmods = [...res.text.matchAll(/<lastmod>([^<]+)<\/lastmod>/gi)].map(m => m[1]);
    const mostRecent = lastmods.sort().reverse()[0];
    const hasLastmod = lastmods.length > 0;

    let fresh = false;
    if (mostRecent) {
      const d = new Date(mostRecent);
      fresh = Date.now() - d.getTime() < SITEMAP_STALE_LASTMOD_DAYS * 24 * 60 * 60 * 1000;
    }

    const locs = isIndex ? [] : extractLocsFromSitemap(res.text);
    const countLabel = isIndex ? `${urlCount} child sitemaps` : `${urlCount} URLs`;
    const lastmodMsg = hasLastmod ? (fresh ? `, latest: ${mostRecent}` : `, stale lastmod: ${mostRecent}`) : ', no lastmod';

    if (urlCount === 0) {
      return { status: 'warn', label: 'Sitemap', message: `Found at ${url} but empty`, url, urlCount: 0, isIndex, locs: [] };
    }

    return {
      status: hasLastmod && !fresh ? 'warn' : 'pass',
      label: 'Sitemap', message: `${countLabel}${lastmodMsg}`,
      url, urlCount, isIndex, hasLastmod, lastmodSample: mostRecent, locs,
    };
  }

  return { status: 'fail', label: 'Sitemap', message: 'No sitemap found' };
}

export function extractMeta(html: string, property: string, attr: string = 'property'): string | null {
  const re = new RegExp(
    `<meta\\s+(?=[^>]*${attr}=["']${property}["'])(?=[^>]*content=["']([^"']*?)["'])[^>]*>`,
    'i'
  );
  return re.exec(html)?.[1] ?? null;
}

export function makeCheck(label: string, value: string | null, minLen: number = 1): CheckResult {
  if (!value) return { status: 'fail', label, message: 'Not found' };
  if (value.length < minLen) return { status: 'warn', label, message: `Found but too short: "${value}"`, rawLength: value.length, rawValue: value };
  return { status: 'pass', label, message: value.length > 80 ? value.slice(0, 77) + '...' : value, rawLength: value.length, rawValue: value };
}

const GENERIC_TITLES = ['react app', 'vite app', 'document', 'untitled', 'home', 'index'];

interface JsonLdValidationResult {
  status: CheckStatus;
  message: string;
  details?: string;
}

type JsonLdSchemaType = 'WebApplication' | 'Product' | 'BreadcrumbList';

const JSON_LD_SCHEMA_LABELS: Record<JsonLdSchemaType, string> = {
  WebApplication: 'WebApplication',
  Product: 'Product',
  BreadcrumbList: 'BreadcrumbList',
};

function hasNoindexDirective(value: string | null | undefined): boolean {
  return value ? /\b(?:noindex|none)\b/i.test(value) : false;
}

function xRobotsTagHasApplicableNoindex(value: string | null | undefined): boolean {
  if (!value) return false;

  let activeScope: 'generic' | 'googlebot' | 'other' = 'generic';

  for (const part of value.split(',')) {
    const token = part.trim();
    if (!token) continue;

    const scopedDirective = token.match(/^([^:]+):\s*(.+)$/);
    if (scopedDirective) {
      const scope = scopedDirective[1].trim().toLowerCase();
      activeScope = scope === 'googlebot' ? 'googlebot' : 'other';
      if (activeScope === 'googlebot' && hasNoindexDirective(scopedDirective[2])) {
        return true;
      }
      continue;
    }

    if ((activeScope === 'generic' || activeScope === 'googlebot') && hasNoindexDirective(token)) {
      return true;
    }
  }

  return false;
}

function extractJsonLdBlocks(html: string): string[] {
  return [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)]
    .map((match) => match[1]?.trim() ?? '')
    .filter(Boolean);
}

function getJsonLdTypes(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) {
    return value.filter((entry): entry is string => typeof entry === 'string');
  }
  return [];
}

function collectJsonLdEntries(value: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(value)) {
    return value.flatMap((entry) => collectJsonLdEntries(entry));
  }

  if (!value || typeof value !== 'object') return [];

  const entry = value as Record<string, unknown>;
  const graphEntries = Array.isArray(entry['@graph']) ? collectJsonLdEntries(entry['@graph']) : [];
  return [entry, ...graphEntries];
}

function validateJsonLdEntry(entry: Record<string, unknown>): string[] {
  const types = getJsonLdTypes(entry['@type']);
  if (types.length === 0) return [];

  const issues = new Set<string>();

  for (const type of types) {
    if (type === 'WebApplication') {
      if (typeof entry.name !== 'string' || entry.name.trim().length === 0) {
        issues.add(`${JSON_LD_SCHEMA_LABELS.WebApplication} missing "name"`);
      }
      if (typeof entry.applicationCategory !== 'string' || entry.applicationCategory.trim().length === 0) {
        issues.add(`${JSON_LD_SCHEMA_LABELS.WebApplication} missing "applicationCategory"`);
      }
    }

    if (type === 'Product') {
      if (typeof entry.name !== 'string' || entry.name.trim().length === 0) {
        issues.add(`${JSON_LD_SCHEMA_LABELS.Product} missing "name"`);
      }
      if (!entry.offers && !entry.brand && !entry.image) {
        issues.add(`${JSON_LD_SCHEMA_LABELS.Product} missing one of "offers", "brand", or "image"`);
      }
    }

    if (type === 'BreadcrumbList') {
      const itemListElement = entry.itemListElement;
      if (!Array.isArray(itemListElement) || itemListElement.length === 0) {
        issues.add(`${JSON_LD_SCHEMA_LABELS.BreadcrumbList} missing "itemListElement"`);
        continue;
      }

      for (const item of itemListElement) {
        if (!item || typeof item !== 'object') {
          issues.add(`${JSON_LD_SCHEMA_LABELS.BreadcrumbList} itemListElement entries must include "item" and "position"`);
          break;
        }

        const listItem = item as Record<string, unknown>;
        if (!('item' in listItem)) {
          issues.add(`${JSON_LD_SCHEMA_LABELS.BreadcrumbList} missing "itemListElement.item"`);
        }
        if (!('position' in listItem)) {
          issues.add(`${JSON_LD_SCHEMA_LABELS.BreadcrumbList} missing "itemListElement.position"`);
        }
      }
    }
  }

  return [...issues];
}

function validateJsonLd(html: string): JsonLdValidationResult {
  const blocks = extractJsonLdBlocks(html);
  if (blocks.length === 0) {
    return { status: 'fail', message: 'Not found' };
  }

  const parseErrors: string[] = [];
  const validationIssues = new Set<string>();
  const discoveredTypes = new Set<string>();

  for (const block of blocks) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(block);
    } catch {
      parseErrors.push('Invalid JSON in structured data');
      continue;
    }

    for (const entry of collectJsonLdEntries(parsed)) {
      for (const type of getJsonLdTypes(entry['@type'])) {
        discoveredTypes.add(type);
      }

      for (const issue of validateJsonLdEntry(entry)) {
        validationIssues.add(issue);
      }
    }
  }

  if (parseErrors.length > 0) {
    return {
      status: 'fail',
      message: 'Invalid JSON in structured data',
      details: parseErrors.join('\n'),
    };
  }

  if (validationIssues.size > 0) {
    const issueList = [...validationIssues];
    return {
      status: 'warn',
      message: issueList[0],
      details: issueList.join('\n'),
    };
  }

  const typeLabel = discoveredTypes.size > 0
    ? `Valid (${[...discoveredTypes].join(', ')})`
    : 'Valid';

  return {
    status: 'pass',
    message: typeLabel,
  };
}

export function parseMetaTags(res: FetchResult, page: string): MetaTagResult {
  if (!res.ok) {
    const errResult: CheckResult = { status: 'error', label: '', message: res.error || `HTTP ${res.status}` };
    return {
      page,
      noindex: false,
      canonicalValid: null,
      canonicalStatus: null,
      canonicalTarget: null,
      title: { ...errResult, label: 'title' }, description: { ...errResult, label: 'description' },
      ogTitle: { ...errResult, label: 'og:title' }, ogImage: { ...errResult, label: 'og:image' },
      ogDescription: { ...errResult, label: 'og:description' }, twitterCard: { ...errResult, label: 'twitter:card' },
      canonical: { ...errResult, label: 'canonical' }, jsonLd: { ...errResult, label: 'JSON-LD' },
    };
  }

  const html = res.text;

  const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  const titleVal = titleMatch?.[1]?.trim() || null;
  const titleCheck: CheckResult = !titleVal
    ? { status: 'fail', label: 'title', message: 'Not found' }
    : GENERIC_TITLES.includes(titleVal.toLowerCase())
      ? { status: 'warn', label: 'title', message: `Generic title: "${titleVal}"`, rawLength: titleVal.length, rawValue: titleVal }
      : { status: 'pass', label: 'title', message: titleVal.length > 80 ? titleVal.slice(0, 77) + '...' : titleVal, rawLength: titleVal.length, rawValue: titleVal };

  const desc = extractMeta(html, 'description', 'name');
  const ogTitle = extractMeta(html, 'og:title');
  const ogImage = extractMeta(html, 'og:image');
  const ogDesc = extractMeta(html, 'og:description');
  const twitterCard = extractMeta(html, 'twitter:card', 'name') || extractMeta(html, 'twitter:card');
  const robotsDirectives = [extractMeta(html, 'robots', 'name'), extractMeta(html, 'googlebot', 'name')]
    .filter((value): value is string => Boolean(value));
  const xRobotsTag = res.headers.get('x-robots-tag');
  const noindex = robotsDirectives.some(hasNoindexDirective) || xRobotsTagHasApplicableNoindex(xRobotsTag);

  const canonicalMatch = html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']*?)["'][^>]*>/i);
  const canonical = canonicalMatch?.[1] ?? null;

  const jsonLd = validateJsonLd(html);

  return {
    page,
    ogImageUrl: ogImage || undefined,
    noindex,
    canonicalValid: null,
    canonicalStatus: null,
    canonicalTarget: canonical,
    title: titleCheck,
    description: makeCheck('description', desc, 10),
    ogTitle: makeCheck('og:title', ogTitle),
    ogImage: makeCheck('og:image', ogImage),
    ogDescription: makeCheck('og:description', ogDesc, 10),
    twitterCard: makeCheck('twitter:card', twitterCard),
    canonical: makeCheck('canonical', canonical),
    jsonLd: { status: jsonLd.status, label: 'JSON-LD', message: jsonLd.message, details: jsonLd.details },
  };
}

function normalizeComparableUrl(url: URL): string {
  const pathname = url.pathname !== '/' && url.pathname.endsWith('/') ? url.pathname.slice(0, -1) : url.pathname;
  return `${url.origin}${pathname}${url.search}`;
}

async function checkCanonicalUrl(
  pageUrl: string,
  canonicalHref: string | null,
): Promise<{ check: CheckResult; canonicalValid: boolean | null; canonicalStatus: number | null; canonicalTarget: string | null }> {
  if (!canonicalHref) {
    return {
      check: { status: 'fail', label: 'canonical', message: 'Not found' },
      canonicalValid: null,
      canonicalStatus: null,
      canonicalTarget: null,
    };
  }

  let canonicalUrl: URL;
  try {
    canonicalUrl = new URL(canonicalHref, pageUrl);
  } catch {
    return {
      check: { status: 'fail', label: 'canonical', message: 'Invalid canonical URL' },
      canonicalValid: false,
      canonicalStatus: null,
      canonicalTarget: canonicalHref,
    };
  }

  const target = canonicalUrl.toString();
  const page = new URL(pageUrl);
  const selfReferential = normalizeComparableUrl(page) === normalizeComparableUrl(canonicalUrl);
  let res = await safeFetch(target, {
    ua: GOOGLEBOT_UA,
    method: 'HEAD',
    redirect: 'manual',
    timeoutMs: 5_000,
  });
  if (res.status === 405 || res.status === 501) {
    res = await safeFetch(target, {
      ua: GOOGLEBOT_UA,
      method: 'GET',
      redirect: 'manual',
      timeoutMs: 5_000,
    });
  }

  if (res.status >= 300 && res.status < 400) {
    const location = res.headers.get('location');
    return {
      check: {
        status: 'warn',
        label: 'canonical',
        message: `Canonical redirects (${res.status})`,
        details: location ? `${target} -> ${location}` : target,
      },
      canonicalValid: false,
      canonicalStatus: res.status,
      canonicalTarget: target,
    };
  }

  if (!res.ok) {
    return {
      check: {
        status: 'fail',
        label: 'canonical',
        message: res.error ? `Canonical check failed: ${res.error}` : `Canonical returns HTTP ${res.status}`,
        details: target,
      },
      canonicalValid: false,
      canonicalStatus: res.status || null,
      canonicalTarget: target,
    };
  }

  if (!selfReferential) {
    return {
      check: {
        status: 'warn',
        label: 'canonical',
        message: 'Canonical points to a different URL',
        details: target,
      },
      canonicalValid: false,
      canonicalStatus: res.status,
      canonicalTarget: target,
    };
  }

  return {
    check: {
      status: 'pass',
      label: 'canonical',
      message: 'Self-referential canonical resolves',
      details: target,
    },
    canonicalValid: true,
    canonicalStatus: res.status,
    canonicalTarget: target,
  };
}

export function checkImageSeo(html: string, page: string): ImageSeoResult {
  const imgTags = html.match(/<img\b[^>]*>/gi) || [];
  const totalImages = imgTags.length;

  if (totalImages === 0) {
    return { page, totalImages: 0, withAlt: 0, withoutAlt: 0, withLazyLoading: 0, status: 'pass', label: 'Images', message: 'No images found', images: [] };
  }

  let withAlt = 0;
  let withLazyLoading = 0;
  const images: ImageDetail[] = [];

  for (const tag of imgTags) {
    const srcMatch = tag.match(/\bsrc=["']([^"']*?)["']/i);
    const altMatch = tag.match(/\balt=["']([^"']*)["']/i);
    const hasAlt = altMatch !== null && altMatch[1].length > 0;
    const isLazy = /\bloading=["']lazy["']/i.test(tag);

    if (hasAlt) withAlt++;
    if (isLazy) withLazyLoading++;

    images.push({
      src: srcMatch?.[1] || '(inline/unknown)',
      hasAlt,
      altText: altMatch?.[1] || undefined,
      isLazy,
    });
  }

  const withoutAlt = totalImages - withAlt;
  const altRatio = withAlt / totalImages;

  let status: CheckStatus;
  if (altRatio === 1) status = 'pass';
  else if (altRatio >= 0.5) status = 'warn';
  else status = 'fail';

  return {
    page, totalImages, withAlt, withoutAlt, withLazyLoading, status,
    label: 'Images',
    message: `${withAlt}/${totalImages} with alt text, ${withLazyLoading} lazy-loaded`,
    images,
  };
}

export function checkInternalLinks(html: string, domain: string, page: string): InternalLinkResult {
  const linkMatches = html.match(/<a\b[^>]*\bhref=["']([^"'#]*?)["'][^>]*>/gi) || [];
  let internalLinks = 0;
  let externalLinks = 0;

  for (const tag of linkMatches) {
    const hrefMatch = tag.match(/href=["']([^"'#]*?)["']/i);
    if (!hrefMatch) continue;
    const href = hrefMatch[1];
    if (!href || href.startsWith('mailto:') || href.startsWith('javascript:') || href === '') continue;

    if (href.startsWith('/') || href.includes(domain)) {
      internalLinks++;
    } else if (href.startsWith('http')) {
      externalLinks++;
    }
  }

  let status: CheckStatus;
  if (internalLinks >= 3) status = 'pass';
  else if (internalLinks >= 1) status = 'warn';
  else status = 'fail';

  return {
    page, internalLinks, externalLinks, status,
    checkedInternalLinks: 0,
    brokenLinks: [],
    brokenLinksMessage: 'Broken-link verification unavailable',
    label: 'Internal Links',
    message: `${internalLinks} internal, ${externalLinks} external`,
  };
}

async function enrichInternalLinkResult(html: string, domain: string, page: string): Promise<InternalLinkResult> {
  const base = checkInternalLinks(html, domain, page);
  const internalPaths = extractInternalPagePaths(html, domain).slice(0, INTERNAL_LINK_HEALTH_LIMIT);

  if (internalPaths.length === 0) {
    return {
      ...base,
      checkedInternalLinks: 0,
      brokenLinksMessage: 'No internal links to verify',
    };
  }

  const linkStatuses = await mapWithConcurrency(
    internalPaths,
    INTERNAL_LINK_HEALTH_CONCURRENCY,
    async (path) => {
      const url = `https://${domain}${path}`;
      const status = await getInternalLinkHealthStatus(url);
      return { url, status };
    },
  );

  const brokenLinks = linkStatuses.filter(({ status }) => status >= 400 || status === 0);

  return {
    ...base,
    checkedInternalLinks: internalPaths.length,
    brokenLinks,
    brokenLinksMessage:
      brokenLinks.length === 0
        ? `Checked ${internalPaths.length} unique internal link${internalPaths.length === 1 ? '' : 's'}`
        : `Checked ${internalPaths.length} unique internal link${internalPaths.length === 1 ? '' : 's'} · ${brokenLinks.length} broken`,
  };
}

async function checkOgImage(imageUrl?: string): Promise<OgImageResult> {
  if (!imageUrl) {
    return { status: 'fail', label: 'OG Image', message: 'No og:image URL found' };
  }

  const res = await safeFetch(imageUrl);
  if (!res.ok) {
    return { status: 'fail', label: 'OG Image', message: `Failed to fetch: ${res.error || `HTTP ${res.status}`}`, url: imageUrl };
  }

  const contentType = res.headers.get('content-type') || '';
  if (!contentType.startsWith('image/')) {
    return { status: 'fail', label: 'OG Image', message: `Not an image (${contentType})`, url: imageUrl, contentType };
  }

  let dimensions: string | undefined;
  if (contentType.includes('png')) {
    try {
      const imgRes = await fetch(imageUrl, { signal: AbortSignal.timeout(FETCH_TIMEOUT) });
      const buf = await imgRes.arrayBuffer();
      if (buf.byteLength >= 24) {
        const view = new DataView(buf);
        const width = view.getUint32(16);
        const height = view.getUint32(20);
        dimensions = `${width}x${height}`;
      }
    } catch { /* ignore */ }
  }

  if (dimensions === '1200x630') {
    return { status: 'pass', label: 'OG Image', message: `Valid (${dimensions})`, url: imageUrl, contentType, dimensions };
  }
  if (dimensions) {
    return { status: 'warn', label: 'OG Image', message: `Valid but ${dimensions} (expected 1200x630)`, url: imageUrl, contentType, dimensions };
  }

  return { status: 'pass', label: 'OG Image', message: `Valid image (${contentType})`, url: imageUrl, contentType };
}

async function checkTtfb(domain: string): Promise<TtfbResult> {
  const res = await safeFetch(`https://${domain}/`);

  if (!res.ok) {
    return { status: 'error', label: 'TTFB', message: res.error || `HTTP ${res.status}`, ms: res.ttfbMs };
  }

  const ms = res.ttfbMs;
  if (ms < 800) return { status: 'pass', label: 'TTFB', message: `${ms}ms`, ms };
  if (ms < 2000) return { status: 'warn', label: 'TTFB', message: `${ms}ms (slow)`, ms };
  return { status: 'fail', label: 'TTFB', message: `${ms}ms (very slow)`, ms };
}

function formatRedirectChainDetails(hops: RedirectHop[], finalUrl: string): string {
  if (hops.length === 0) return finalUrl;

  const parts = hops.map((hop) => `${hop.url} (${hop.status})`);
  const lastLocation = hops[hops.length - 1]?.location;
  if (lastLocation && lastLocation === finalUrl) {
    parts.push(finalUrl);
  }

  return parts.join(' -> ');
}

function isPermanentRedirectStatus(status: number): boolean {
  return PERMANENT_REDIRECT_STATUSES.has(status);
}

async function checkRedirectChain(pageUrl: string, page: string): Promise<RedirectChainResult> {
  const seen = new Set<string>();
  const hops: RedirectHop[] = [];
  let currentUrl = pageUrl;
  let finalUrl = pageUrl;
  let hasTemporaryRedirect = false;

  for (let depth = 0; depth < MAX_REDIRECT_HOPS; depth++) {
    if (seen.has(currentUrl)) {
      return {
        status: 'fail',
        label: 'Redirect Chain',
        message: 'Redirect loop detected',
        details: formatRedirectChainDetails(hops, finalUrl),
        page,
        requestedUrl: pageUrl,
        finalUrl,
        hops,
        hopCount: hops.length,
        hasTemporaryRedirect,
        loopDetected: true,
      };
    }

    seen.add(currentUrl);
    const res = await safeFetch(currentUrl, { ua: GOOGLEBOT_UA, redirect: 'manual' });

    if (res.status < 300 || res.status >= 400) {
      finalUrl = currentUrl;

      if (!res.ok) {
        return {
          status: 'error',
          label: 'Redirect Chain',
          message: res.error ? `Could not check: ${res.error}` : `Final response HTTP ${res.status}`,
          details: formatRedirectChainDetails(hops, finalUrl),
          page,
          requestedUrl: pageUrl,
          finalUrl,
          hops,
          hopCount: hops.length,
          hasTemporaryRedirect,
          loopDetected: false,
        };
      }

      const hopCount = hops.length;
      if (hopCount === 0) {
        return {
          status: 'pass',
          label: 'Redirect Chain',
          message: 'No redirects',
          details: finalUrl,
          page,
          requestedUrl: pageUrl,
          finalUrl,
          hops,
          hopCount,
          hasTemporaryRedirect,
          loopDetected: false,
        };
      }

      if (hasTemporaryRedirect) {
        return {
          status: 'fail',
          label: 'Redirect Chain',
          message: `${hopCount} hop${hopCount === 1 ? '' : 's'} with temporary redirect`,
          details: formatRedirectChainDetails(hops, finalUrl),
          page,
          requestedUrl: pageUrl,
          finalUrl,
          hops,
          hopCount,
          hasTemporaryRedirect,
          loopDetected: false,
        };
      }

      const status: CheckStatus = hopCount === 1 ? 'pass' : hopCount === 2 ? 'warn' : 'fail';
      return {
        status,
        label: 'Redirect Chain',
        message:
          hopCount === 1
            ? '1 permanent redirect hop'
            : `${hopCount} redirect hops`,
        details: formatRedirectChainDetails(hops, finalUrl),
        page,
        requestedUrl: pageUrl,
        finalUrl,
        hops,
        hopCount,
        hasTemporaryRedirect,
        loopDetected: false,
      };
    }

    const location = res.headers.get('location');
    if (!location) {
      return {
        status: 'fail',
        label: 'Redirect Chain',
        message: `Redirect missing Location header (${res.status})`,
        details: formatRedirectChainDetails(hops, finalUrl),
        page,
        requestedUrl: pageUrl,
        finalUrl,
        hops,
        hopCount: hops.length,
        hasTemporaryRedirect,
        loopDetected: false,
      };
    }

    let nextUrl: string;
    try {
      nextUrl = new URL(location, currentUrl).toString();
    } catch {
      return {
        status: 'fail',
        label: 'Redirect Chain',
        message: `Invalid redirect target (${res.status})`,
        details: location,
        page,
        requestedUrl: pageUrl,
        finalUrl,
        hops,
        hopCount: hops.length,
        hasTemporaryRedirect,
        loopDetected: false,
      };
    }

    if (!isPermanentRedirectStatus(res.status)) {
      hasTemporaryRedirect = true;
    }

    hops.push({
      url: currentUrl,
      status: res.status,
      location: nextUrl,
    });
    finalUrl = nextUrl;
    currentUrl = nextUrl;
  }

  return {
    status: 'fail',
    label: 'Redirect Chain',
    message: `Exceeded ${MAX_REDIRECT_HOPS} redirect hops`,
    details: formatRedirectChainDetails(hops, finalUrl),
    page,
    requestedUrl: pageUrl,
    finalUrl,
    hops,
    hopCount: hops.length,
    hasTemporaryRedirect,
    loopDetected: false,
  };
}

async function checkSecurity(domain: string): Promise<SecurityResult> {
  // HTTPS: fetch http:// and check if it redirects to https://
  let httpsCheck: CheckResult;
  try {
    const res = await fetch(`http://${domain}/`, {
      signal: AbortSignal.timeout(10_000),
      redirect: 'manual',
    });
    const location = res.headers.get('location') || '';
    if (res.status >= 300 && res.status < 400 && location.startsWith('https://')) {
      httpsCheck = { status: 'pass', label: 'HTTPS', message: 'HTTP redirects to HTTPS' };
    } else if (res.status >= 300 && res.status < 400) {
      httpsCheck = { status: 'warn', label: 'HTTPS', message: `Redirects to ${location.slice(0, 60)}` };
    } else {
      httpsCheck = { status: 'fail', label: 'HTTPS', message: 'No HTTPS redirect — site serves over HTTP' };
    }
  } catch {
    // Connection refused on port 80 usually means HTTPS-only (good)
    httpsCheck = { status: 'pass', label: 'HTTPS', message: 'HTTPS only (HTTP not available)' };
  }

  // HSTS + favicon: fetch the HTTPS page
  const httpsRes = await safeFetch(`https://${domain}/`);
  const hstsHeader = httpsRes.headers.get('strict-transport-security');
  const hstsCheck: CheckResult = hstsHeader
    ? { status: 'pass', label: 'HSTS', message: `Present: ${hstsHeader.slice(0, 80)}` }
    : { status: 'warn', label: 'HSTS', message: 'Missing Strict-Transport-Security header' };

  // Favicon
  const faviconRes = await safeFetch(`https://${domain}/favicon.ico`);
  const faviconCheck: CheckResult = faviconRes.ok
    ? { status: 'pass', label: 'Favicon', message: 'Found' }
    : { status: 'warn', label: 'Favicon', message: 'Missing /favicon.ico' };

  return { https: httpsCheck, hsts: hstsCheck, favicon: faviconCheck };
}

const SC_STALE_DAYS = 30;

async function checkScSitemapFreshness(site: Site): Promise<CheckResult> {
  if (site.searchConsole === false) {
    return { status: 'pass', label: 'SC Sitemap', message: 'N/A — Search Console disabled' };
  }

  try {
    const scUrl = getSCUrl(site);
    const formattedUrl = scUrl.startsWith('sc-domain:') || scUrl.startsWith('http') ? scUrl : `sc-domain:${scUrl}`;
    const res = await getSc().sitemaps.list({ siteUrl: formattedUrl });
    const sitemaps = res.data.sitemap || [];

    if (sitemaps.length === 0) {
      return { status: 'fail', label: 'SC Sitemap', message: 'No sitemaps submitted to Google Search Console' };
    }

    // Check the most recently downloaded sitemap
    let mostRecentDownload: Date | null = null;
    let mostRecentPath = '';
    for (const sm of sitemaps) {
      if (sm.lastDownloaded) {
        const d = new Date(sm.lastDownloaded);
        if (!mostRecentDownload || d > mostRecentDownload) {
          mostRecentDownload = d;
          mostRecentPath = sm.path || '';
        }
      }
    }

    if (!mostRecentDownload) {
      return { status: 'fail', label: 'SC Sitemap', message: 'Google has never downloaded the sitemap' };
    }

    const daysSince = Math.floor((Date.now() - mostRecentDownload.getTime()) / (1000 * 60 * 60 * 24));

    if (daysSince > SC_STALE_DAYS) {
      return {
        status: 'fail', label: 'SC Sitemap',
        message: `Google last downloaded ${daysSince}d ago (${dateStr(mostRecentDownload)})`,
        details: mostRecentPath,
      };
    }

    return {
      status: 'pass', label: 'SC Sitemap',
      message: `Google downloaded ${daysSince}d ago (${dateStr(mostRecentDownload)})`,
      details: mostRecentPath,
    };
  } catch (e) {
    return { status: 'error', label: 'SC Sitemap', message: `Could not check: ${(e as Error).message.slice(0, 60)}` };
  }
}

async function checkIndexingCoverage(site: Site, sitemapUrlCount?: number): Promise<IndexingCoverageResult> {
  if (site.searchConsole === false) {
    return { status: 'pass', label: 'Indexing', message: 'N/A — Search Console disabled' };
  }

  try {
    const scUrl = getSCUrl(site);
    const formattedUrl = scUrl.startsWith('sc-domain:') || scUrl.startsWith('http') ? scUrl : `sc-domain:${scUrl}`;

    const res = await getSc().searchanalytics.query({
      siteUrl: formattedUrl,
      requestBody: {
        startDate: dateOnlyDaysBack(90),
        endDate: dateOnlyDaysBack(1),
        dimensions: ['page'],
        rowLimit: 5000,
      },
    });

    const indexedPages = res.data.rows?.length || 0;

    if (!sitemapUrlCount || sitemapUrlCount === 0) {
      return {
        status: indexedPages > 0 ? 'pass' : 'warn',
        label: 'Indexing',
        message: `${indexedPages} pages in search results (no sitemap to compare)`,
        indexedPages,
      };
    }

    const indexedSitemapUrls = Math.min(indexedPages, sitemapUrlCount);
    const coveragePct = Math.round((indexedSitemapUrls / sitemapUrlCount) * 100);
    const unindexedPages = Math.max(sitemapUrlCount - indexedSitemapUrls, 0);

    if (coveragePct < 30) {
      return {
        status: 'fail', label: 'Indexing',
        message: `${indexedSitemapUrls}/${sitemapUrlCount} sitemap URLs indexed (${coveragePct}%)`,
        details: `${unindexedPages} pages submitted but not appearing in search results`,
        sitemapUrls: sitemapUrlCount, indexedPages, coveragePct,
      };
    }

    if (coveragePct < 60) {
      return {
        status: 'warn', label: 'Indexing',
        message: `${indexedSitemapUrls}/${sitemapUrlCount} sitemap URLs indexed (${coveragePct}%)`,
        details: `${unindexedPages} pages not appearing in search results`,
        sitemapUrls: sitemapUrlCount, indexedPages, coveragePct,
      };
    }

    return {
      status: 'pass', label: 'Indexing',
      message: `${indexedSitemapUrls}/${sitemapUrlCount} sitemap URLs indexed (${coveragePct}%)`,
      sitemapUrls: sitemapUrlCount, indexedPages, coveragePct,
    };
  } catch (e) {
    return { status: 'error', label: 'Indexing', message: `Could not check: ${(e as Error).message.slice(0, 60)}` };
  }
}

async function fetchScTopPageUrls(site: Site): Promise<string[]> {
  if (site.searchConsole === false) return [];
  try {
    const scUrl = getSCUrl(site);
    const formattedUrl = scUrl.startsWith('sc-domain:') || scUrl.startsWith('http') ? scUrl : `sc-domain:${scUrl}`;
    const res = await getSc().searchanalytics.query({
      siteUrl: formattedUrl,
      requestBody: {
        startDate: dateOnlyDaysBack(30),
        endDate: dateOnlyDaysBack(1),
        dimensions: ['page'],
        rowLimit: SC_SAMPLE_LIMIT * 2,
      },
    });
    return (res.data.rows || []).map(r => r.keys?.[0] || '').filter(Boolean);
  } catch {
    return [];
  }
}

async function auditSite(site: Site): Promise<SiteAuditResult> {
  const skip = new Set(normalizeSkipChecks(site.skipChecks));
  const shouldVerifyBrokenLinks = !skip.has('internalLinks') && !skip.has('brokenLinks');
  const robotsTxt = await checkRobotsTxt(site.domain);

  const [rawSitemap, ttfb, security, scSitemapFreshness, scTopPageUrls, indexNow, urlInspection] = await Promise.all([
    checkSitemap(site.domain, robotsTxt.sitemapUrl),
    checkTtfb(site.domain),
    checkSecurity(site.domain),
    checkScSitemapFreshness(site),
    fetchScTopPageUrls(site),
    checkIndexNowKey(site) as Promise<CheckResult>,
    checkUrlInspectionForSite(site),
  ]);
  const sitemap = await enrichSitemapResult(rawSitemap);

  const sampledPages = sampleAuditPages(
    site.testPages,
    sitemap.locs ?? [],
    scTopPageUrls,
    site.domain,
  );

  // Indexing coverage: compare sitemap URLs vs pages in search results
  const indexingCoverage = await checkIndexingCoverage(site, sitemap.urlCount);

  // Fetch sampled pages sequentially to avoid rate-limiting
  const pageResults: { redirectChain: RedirectChainResult; meta: MetaTagResult; images: ImageSeoResult; links: InternalLinkResult }[] = [];
  for (const page of sampledPages) {
    const pageUrl = `https://${site.domain}${page}`;
    const redirectChain = await checkRedirectChain(pageUrl, page);
    const res = await safeFetch(pageUrl, { ua: GOOGLEBOT_UA });
    const meta = parseMetaTags(res, page);
    if (res.ok) {
      const canonicalCheck = await checkCanonicalUrl(pageUrl, meta.canonicalTarget);
      meta.canonical = canonicalCheck.check;
      meta.canonicalValid = canonicalCheck.canonicalValid;
      meta.canonicalStatus = canonicalCheck.canonicalStatus;
      meta.canonicalTarget = canonicalCheck.canonicalTarget;
    }
    pageResults.push({
      redirectChain,
      meta,
      images: res.ok ? checkImageSeo(res.text, page) : { page, totalImages: 0, withAlt: 0, withoutAlt: 0, withLazyLoading: 0, status: 'error' as CheckStatus, label: 'Images', message: res.error || `HTTP ${res.status}`, images: [] },
      links: res.ok
        ? shouldVerifyBrokenLinks
          ? await enrichInternalLinkResult(res.text, site.domain, page)
          : checkInternalLinks(res.text, site.domain, page)
        : {
            page,
            internalLinks: 0,
            externalLinks: 0,
            checkedInternalLinks: 0,
            brokenLinks: [],
            brokenLinksMessage: res.error || `HTTP ${res.status}`,
            status: 'error' as CheckStatus,
            label: 'Internal Links',
            message: res.error || `HTTP ${res.status}`,
          },
    });
  }

  const redirectChains = pageResults.map(r => r.redirectChain);
  const metaTags = pageResults.map(r => r.meta);
  const imageSeo = pageResults.map(r => r.images);
  const internalLinks = pageResults.map(r => r.links);

  const ogImageUrl = metaTags.find(m => m.ogImageUrl)?.ogImageUrl;
  const ogImage = await checkOgImage(ogImageUrl);

  // Apply skipChecks: replace skipped checks with a neutral pass so they don't affect the score
  const skippedRobotsTxt = applySkipToCheck(robotsTxt, skip, 'robotsTxt');
  const skippedSitemap = applySkipToCheck(sitemap, skip, 'sitemap');
  const skippedScSitemapFreshness = applySkipToCheck(scSitemapFreshness, skip, 'scSitemap');
  const skippedIndexingCoverage = applySkipToCheck(indexingCoverage, skip, 'indexing');
  const skippedIndexNow = applySkipToCheck(indexNow, skip, 'indexNow');
  const skippedUrlInspection = urlInspection.map((result) => applySkipToCheck(result, skip, 'urlInspection'));
  const skippedRedirectChains = redirectChains.map(chain => applySkipToCheck(chain, skip, 'redirectChain'));
  const skippedOgImage = applySkipToCheck(ogImage, skip, 'ogImage');
  const skippedTtfb = applySkipToCheck(ttfb, skip, 'ttfb');
  const skippedSecurity = {
    https: applySkipToCheck(security.https, skip, 'https'),
    hsts: applySkipToCheck(security.hsts, skip, 'hsts'),
    favicon: applySkipToCheck(security.favicon, skip, 'favicon'),
  };
  const skippedMetaTags = metaTags.map(meta => ({
    ...meta,
    title: applySkipToCheck(meta.title, skip, 'title'),
    description: applySkipToCheck(meta.description, skip, 'description'),
    ogTitle: applySkipToCheck(meta.ogTitle, skip, 'ogTitle'),
    ogImage: applySkipToCheck(meta.ogImage, skip, 'ogImageMeta'),
    ogDescription: applySkipToCheck(meta.ogDescription, skip, 'ogDescription'),
    twitterCard: applySkipToCheck(meta.twitterCard, skip, 'twitterCard'),
    canonical: applySkipToCheck(meta.canonical, skip, 'canonical'),
    jsonLd: applySkipToCheck(meta.jsonLd, skip, 'jsonLd'),
  }));
  const skippedImageSeo = imageSeo.map(image => applySkipToCheck(image, skip, 'images'));
  const shouldSkipBrokenLinkReporting = skip.has('internalLinks') || skip.has('brokenLinks');
  const skippedInternalLinks = internalLinks.map(link => {
    const skippedLink = applySkipToCheck(link, skip, 'internalLinks');
    if (shouldSkipBrokenLinkReporting) {
      return {
        ...skippedLink,
        checkedInternalLinks: 0,
        brokenLinks: [],
        brokenLinksMessage: 'N/A — broken-link verification skipped',
      };
    }
    return skippedLink;
  });

  const brokenLinkPenaltyChecks = shouldSkipBrokenLinkReporting
    ? []
    : skippedInternalLinks.flatMap((link) =>
        link.brokenLinks.map((brokenLink) => ({
          status: 'fail' as const,
          label: 'Broken Link',
          message: `${link.page} -> ${brokenLink.url} (${brokenLink.status || 'timeout'})`,
        })),
      );

  const allChecks: CheckResult[] = [
    skippedRobotsTxt,
    skippedSitemap,
    skippedScSitemapFreshness,
    skippedIndexingCoverage,
    skippedIndexNow,
    ...skippedUrlInspection,
    ...skippedRedirectChains,
    skippedOgImage,
    skippedTtfb,
    skippedSecurity.https,
    skippedSecurity.hsts,
    skippedSecurity.favicon,
    ...skippedMetaTags.flatMap(m => [m.title, m.description, m.ogTitle, m.ogImage, m.ogDescription, m.twitterCard, m.canonical, m.jsonLd]),
    ...skippedImageSeo,
    ...skippedInternalLinks,
    ...brokenLinkPenaltyChecks,
  ];

  const score = allChecks.reduce(
    (acc, c) => { acc[c.status]++; acc.total++; return acc; },
    { pass: 0, warn: 0, fail: 0, error: 0, total: 0 }
  );

  return {
    siteId: site.id,
    domain: site.domain,
    timestamp: Date.now(),
    robotsTxt: skippedRobotsTxt,
    sitemap: skippedSitemap,
    scSitemapFreshness: skippedScSitemapFreshness,
    indexingCoverage: skippedIndexingCoverage,
    indexNow: skippedIndexNow,
    urlInspection: skippedUrlInspection,
    redirectChains: skippedRedirectChains,
    metaTags: skippedMetaTags,
    ogImage: skippedOgImage,
    ttfb: skippedTtfb,
    imageSeo: skippedImageSeo,
    internalLinks: skippedInternalLinks,
    security: skippedSecurity,
    score,
    sampledPages,
  };
}

export async function runSiteAudit(site: Site): Promise<SiteAuditResult> {
  return auditSite(site);
}

async function auditAllSites(): Promise<SiteAuditResult[]> {
  const sites = await getManagedSites();
  return Promise.all(sites.map(async (site) => {
    try {
      return await auditSite(site);
    } catch (error) {
      console.error(`[Audit] ${site.id}:`, error);
      return createFailedSiteAuditResult(site);
    }
  }));
}

// --- Cached versions ---

import { withCache, CACHE_TTL_WEEK } from './db';

export async function cachedAuditSite(site: Site): Promise<SiteAuditResult> {
  const audit = (await withCache<SiteAuditResult>('audit', site.id, () => runSiteAudit(site), CACHE_TTL_WEEK))!;
  return normalizeSiteAuditResult(audit);
}

export async function cachedAuditAllSites(): Promise<SiteAuditResult[]> {
  const sites = await getManagedSites();
  return Promise.all(sites.map(async (site) => {
    try {
      return await cachedAuditSite(site);
    } catch (error) {
      console.error(`[Audit] ${site.id}:`, error);
      return createFailedSiteAuditResult(site);
    }
  }));
}
