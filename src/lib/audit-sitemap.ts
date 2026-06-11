import { GOOGLEBOT_UA, safeFetch } from './audit-fetch';
import type { CheckStatus, SitemapResult } from './audit-types';

const SITEMAP_URL_HEALTH_LIMIT = 50;
const SITEMAP_STALE_LASTMOD_DAYS = 90;

interface ResolvedSitemapUrls {
  entries: Array<{
    url: string;
    lastmod?: string;
  }>;
}

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

export async function checkSitemap(domain: string, sitemapUrl?: string): Promise<SitemapResult> {
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

export async function enrichSitemapResult(sitemap: SitemapResult): Promise<SitemapResult> {
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
