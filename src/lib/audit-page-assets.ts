import { GOOGLEBOT_UA, safeFetch } from './audit-fetch';
import type {
  CheckStatus,
  ImageDetail,
  ImageSeoResult,
  InternalLinkResult,
} from './audit-types';

const INTERNAL_LINK_HEALTH_LIMIT = 20;
const INTERNAL_LINK_HEALTH_CONCURRENCY = 5;

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

export async function enrichInternalLinkResult(html: string, domain: string, page: string): Promise<InternalLinkResult> {
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
