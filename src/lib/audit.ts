import { getManagedSites, getSCUrl, type Site } from './sites';
import { searchconsole_v1 } from '@googleapis/searchconsole';
import { getAuth } from './google-auth';

export type CheckStatus = 'pass' | 'warn' | 'fail' | 'error';

export interface CheckResult {
  status: CheckStatus;
  label: string;
  message: string;
  details?: string;
}

export interface RobotsTxtResult extends CheckResult {
  raw?: string;
  hasSitemapDirective: boolean;
  sitemapUrl?: string;
}

export interface SitemapResult extends CheckResult {
  url?: string;
  urlCount?: number;
  isIndex?: boolean;
  hasLastmod?: boolean;
  lastmodSample?: string;
}

export interface MetaTagResult {
  page: string;
  ogImageUrl?: string;
  title: CheckResult;
  description: CheckResult;
  ogTitle: CheckResult;
  ogImage: CheckResult;
  ogDescription: CheckResult;
  twitterCard: CheckResult;
  canonical: CheckResult;
  jsonLd: CheckResult;
}

export interface OgImageResult extends CheckResult {
  url?: string;
  contentType?: string;
  dimensions?: string;
}

export interface TtfbResult extends CheckResult {
  ms?: number;
}

export interface ImageDetail {
  src: string;
  hasAlt: boolean;
  altText?: string;
  isLazy: boolean;
}

export interface ImageSeoResult {
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

export interface InternalLinkResult {
  page: string;
  internalLinks: number;
  externalLinks: number;
  status: CheckStatus;
  label: string;
  message: string;
}

export interface SecurityResult {
  https: CheckResult;
  hsts: CheckResult;
  favicon: CheckResult;
}

export interface IndexingCoverageResult extends CheckResult {
  sitemapUrls?: number;
  indexedPages?: number;
  coveragePct?: number;
}

export interface SiteAuditResult {
  siteId: string;
  domain: string;
  timestamp: number;
  robotsTxt: RobotsTxtResult;
  sitemap: SitemapResult;
  scSitemapFreshness: CheckResult;
  indexingCoverage: IndexingCoverageResult;
  metaTags: MetaTagResult[];
  ogImage: OgImageResult;
  ttfb: TtfbResult;
  imageSeo: ImageSeoResult[];
  internalLinks: InternalLinkResult[];
  security: SecurityResult;
  score: { pass: number; warn: number; fail: number; error: number; total: number };
}

function getSc() {
  return new searchconsole_v1.Searchconsole({ auth: getAuth() });
}

const FETCH_TIMEOUT = 30_000;
const GOOGLEBOT_UA = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';

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

async function safeFetch(url: string, opts?: { ua?: string }): Promise<FetchResult> {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      const delay = BASE_DELAY * Math.pow(2, attempt - 1);
      await new Promise(r => setTimeout(r, delay));
    }
    const start = Date.now();
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(FETCH_TIMEOUT),
        headers: opts?.ua ? { 'User-Agent': opts.ua } : undefined,
        redirect: 'follow',
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
      fresh = Date.now() - d.getTime() < 30 * 24 * 60 * 60 * 1000;
    }

    const countLabel = isIndex ? `${urlCount} child sitemaps` : `${urlCount} URLs`;
    const lastmodMsg = hasLastmod ? (fresh ? `, latest: ${mostRecent}` : `, stale lastmod: ${mostRecent}`) : ', no lastmod';

    if (urlCount === 0) {
      return { status: 'warn', label: 'Sitemap', message: `Found at ${url} but empty`, url, urlCount: 0, isIndex };
    }

    return {
      status: hasLastmod && !fresh ? 'warn' : 'pass',
      label: 'Sitemap', message: `${countLabel}${lastmodMsg}`,
      url, urlCount, isIndex, hasLastmod, lastmodSample: mostRecent,
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
  if (value.length < minLen) return { status: 'warn', label, message: `Found but too short: "${value}"` };
  return { status: 'pass', label, message: value.length > 80 ? value.slice(0, 77) + '...' : value };
}

const GENERIC_TITLES = ['react app', 'vite app', 'document', 'untitled', 'home', 'index'];

export function parseMetaTags(res: FetchResult, page: string): MetaTagResult {
  if (!res.ok) {
    const errResult: CheckResult = { status: 'error', label: '', message: res.error || `HTTP ${res.status}` };
    return {
      page,
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
      ? { status: 'warn', label: 'title', message: `Generic title: "${titleVal}"` }
      : { status: 'pass', label: 'title', message: titleVal.length > 80 ? titleVal.slice(0, 77) + '...' : titleVal };

  const desc = extractMeta(html, 'description', 'name');
  const ogTitle = extractMeta(html, 'og:title');
  const ogImage = extractMeta(html, 'og:image');
  const ogDesc = extractMeta(html, 'og:description');
  const twitterCard = extractMeta(html, 'twitter:card', 'name') || extractMeta(html, 'twitter:card');

  const canonicalMatch = html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']*?)["'][^>]*>/i);
  const canonical = canonicalMatch?.[1] ?? null;

  const hasJsonLd = /<script[^>]+type=["']application\/ld\+json["'][^>]*>/i.test(html);
  let jsonLdType: string | undefined;
  if (hasJsonLd) {
    const jsonLdMatch = html.match(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/i);
    try {
      const parsed = JSON.parse(jsonLdMatch?.[1] || '{}');
      jsonLdType = parsed['@type'] || (Array.isArray(parsed) ? parsed[0]?.['@type'] : undefined);
    } catch { /* ignore parse errors */ }
  }

  return {
    page,
    ogImageUrl: ogImage || undefined,
    title: titleCheck,
    description: makeCheck('description', desc, 10),
    ogTitle: makeCheck('og:title', ogTitle),
    ogImage: makeCheck('og:image', ogImage),
    ogDescription: makeCheck('og:description', ogDesc, 10),
    twitterCard: makeCheck('twitter:card', twitterCard),
    canonical: makeCheck('canonical', canonical),
    jsonLd: hasJsonLd
      ? { status: 'pass', label: 'JSON-LD', message: jsonLdType ? `Found (${jsonLdType})` : 'Found' }
      : { status: 'fail', label: 'JSON-LD', message: 'Not found' },
  };
}

async function checkMetaTags(domain: string, path: string): Promise<MetaTagResult> {
  const res = await safeFetch(`https://${domain}${path}`, { ua: GOOGLEBOT_UA });
  return parseMetaTags(res, path);
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
    label: 'Internal Links',
    message: `${internalLinks} internal, ${externalLinks} external`,
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
        message: `Google last downloaded ${daysSince}d ago (${mostRecentDownload.toISOString().split('T')[0]})`,
        details: mostRecentPath,
      };
    }

    return {
      status: 'pass', label: 'SC Sitemap',
      message: `Google downloaded ${daysSince}d ago (${mostRecentDownload.toISOString().split('T')[0]})`,
      details: mostRecentPath,
    };
  } catch (e) {
    return { status: 'error', label: 'SC Sitemap', message: `Could not check: ${(e as Error).message.slice(0, 60)}` };
  }
}

async function checkIndexingCoverage(site: Site, sitemapUrlCount?: number): Promise<IndexingCoverageResult> {
  if (!site.searchConsole) {
    return { status: 'error', label: 'Indexing', message: 'No Search Console configured' };
  }

  try {
    const scUrl = getSCUrl(site);
    const formattedUrl = scUrl.startsWith('sc-domain:') || scUrl.startsWith('http') ? scUrl : `sc-domain:${scUrl}`;

    // Get pages with any impressions in last 90 days = indexed pages
    const end = new Date();
    end.setDate(end.getDate() - 1);
    const start = new Date();
    start.setDate(start.getDate() - 90);

    const res = await getSc().searchanalytics.query({
      siteUrl: formattedUrl,
      requestBody: {
        startDate: start.toISOString().split('T')[0],
        endDate: end.toISOString().split('T')[0],
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

    const coveragePct = Math.round((indexedPages / sitemapUrlCount) * 100);

    if (coveragePct < 30) {
      return {
        status: 'fail', label: 'Indexing',
        message: `${indexedPages}/${sitemapUrlCount} sitemap URLs indexed (${coveragePct}%)`,
        details: `${sitemapUrlCount - indexedPages} pages submitted but not appearing in search results`,
        sitemapUrls: sitemapUrlCount, indexedPages, coveragePct,
      };
    }

    if (coveragePct < 60) {
      return {
        status: 'warn', label: 'Indexing',
        message: `${indexedPages}/${sitemapUrlCount} sitemap URLs indexed (${coveragePct}%)`,
        details: `${sitemapUrlCount - indexedPages} pages not appearing in search results`,
        sitemapUrls: sitemapUrlCount, indexedPages, coveragePct,
      };
    }

    return {
      status: 'pass', label: 'Indexing',
      message: `${indexedPages}/${sitemapUrlCount} sitemap URLs indexed (${coveragePct}%)`,
      sitemapUrls: sitemapUrlCount, indexedPages, coveragePct,
    };
  } catch (e) {
    return { status: 'error', label: 'Indexing', message: `Could not check: ${(e as Error).message.slice(0, 60)}` };
  }
}

async function auditSite(site: Site): Promise<SiteAuditResult> {
  const robotsTxt = await checkRobotsTxt(site.domain);

  const [sitemap, ttfb, security, scSitemapFreshness] = await Promise.all([
    checkSitemap(site.domain, robotsTxt.sitemapUrl),
    checkTtfb(site.domain),
    checkSecurity(site.domain),
    checkScSitemapFreshness(site),
  ]);

  // Indexing coverage: compare sitemap URLs vs pages in search results
  const indexingCoverage = await checkIndexingCoverage(site, sitemap.urlCount);

  // Fetch test pages sequentially to avoid rate-limiting
  const pageResults: { meta: MetaTagResult; images: ImageSeoResult; links: InternalLinkResult }[] = [];
  for (const page of site.testPages) {
    const res = await safeFetch(`https://${site.domain}${page}`, { ua: GOOGLEBOT_UA });
    pageResults.push({
      meta: parseMetaTags(res, page),
      images: res.ok ? checkImageSeo(res.text, page) : { page, totalImages: 0, withAlt: 0, withoutAlt: 0, withLazyLoading: 0, status: 'error' as CheckStatus, label: 'Images', message: res.error || `HTTP ${res.status}`, images: [] },
      links: res.ok ? checkInternalLinks(res.text, site.domain, page) : { page, internalLinks: 0, externalLinks: 0, status: 'error' as CheckStatus, label: 'Internal Links', message: res.error || `HTTP ${res.status}` },
    });
  }

  const metaTags = pageResults.map(r => r.meta);
  const imageSeo = pageResults.map(r => r.images);
  const internalLinks = pageResults.map(r => r.links);

  const ogImageUrl = metaTags.find(m => m.ogImageUrl)?.ogImageUrl;
  const ogImage = await checkOgImage(ogImageUrl);

  // Apply skipChecks: replace skipped checks with a neutral pass so they don't affect the score
  const skip = new Set((site.skipChecks || []).map(s => s.toLowerCase()));
  const maybeSkip = (c: CheckResult): CheckResult =>
    skip.has(c.label.toLowerCase())
      ? { ...c, status: 'pass', message: `N/A — ${c.message}` }
      : c;

  const allChecks: CheckResult[] = [
    robotsTxt, sitemap, scSitemapFreshness, indexingCoverage, ogImage, ttfb,
    maybeSkip(security.https), maybeSkip(security.hsts), maybeSkip(security.favicon),
    ...metaTags.flatMap(m => [m.title, m.description, m.ogTitle, m.ogImage, m.ogDescription, m.twitterCard, m.canonical, m.jsonLd].map(maybeSkip)),
    ...imageSeo.map(i => maybeSkip({ status: i.status, label: i.label, message: i.message })),
    ...internalLinks.map(l => maybeSkip({ status: l.status, label: l.label, message: l.message })),
  ];

  const score = allChecks.reduce(
    (acc, c) => { acc[c.status]++; acc.total++; return acc; },
    { pass: 0, warn: 0, fail: 0, error: 0, total: 0 }
  );

  const skippedSecurity = {
    https: maybeSkip(security.https),
    hsts: maybeSkip(security.hsts),
    favicon: maybeSkip(security.favicon),
  };

  return { siteId: site.id, domain: site.domain, timestamp: Date.now(), robotsTxt, sitemap, scSitemapFreshness, indexingCoverage, metaTags, ogImage, ttfb, imageSeo, internalLinks, security: skippedSecurity, score };
}

async function auditAllSites(): Promise<SiteAuditResult[]> {
  const sites = await getManagedSites();
  return Promise.all(sites.map(site => auditSite(site)));
}

// --- Cached versions ---

import { withCache, CACHE_TTL_WEEK } from './db';

export async function cachedAuditSite(site: Site): Promise<SiteAuditResult> {
  return (await withCache<SiteAuditResult>('audit', site.id, () => auditSite(site), CACHE_TTL_WEEK))!;
}

export async function cachedAuditAllSites(): Promise<SiteAuditResult[]> {
  const sites = await getManagedSites();
  return Promise.all(sites.map(site => cachedAuditSite(site)));
}
