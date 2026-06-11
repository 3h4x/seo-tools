import { FETCH_TIMEOUT, GOOGLEBOT_UA, safeFetch } from './audit-fetch';
import type {
  CheckResult,
  CheckStatus,
  OgImageResult,
  RedirectChainResult,
  RedirectHop,
  RobotsTxtResult,
  SecurityResult,
  TtfbResult,
} from './audit-types';

const MAX_REDIRECT_HOPS = 10;
const PERMANENT_REDIRECT_STATUSES = new Set([301, 308]);

export async function checkRobotsTxt(domain: string): Promise<RobotsTxtResult> {
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

export async function checkOgImage(imageUrl?: string): Promise<OgImageResult> {
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

export async function checkTtfb(domain: string): Promise<TtfbResult> {
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

export async function checkRedirectChain(pageUrl: string, page: string): Promise<RedirectChainResult> {
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

export async function checkSecurity(domain: string): Promise<SecurityResult> {
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
    httpsCheck = { status: 'pass', label: 'HTTPS', message: 'HTTPS only (HTTP not available)' };
  }

  const [httpsRes, faviconRes] = await Promise.all([
    safeFetch(`https://${domain}/`),
    safeFetch(`https://${domain}/favicon.ico`),
  ]);
  const hstsHeader = httpsRes.headers.get('strict-transport-security');
  const hstsCheck: CheckResult = hstsHeader
    ? { status: 'pass', label: 'HSTS', message: `Present: ${hstsHeader.slice(0, 80)}` }
    : { status: 'warn', label: 'HSTS', message: 'Missing Strict-Transport-Security header' };

  const faviconCheck: CheckResult = faviconRes.ok
    ? { status: 'pass', label: 'Favicon', message: 'Found' }
    : { status: 'warn', label: 'Favicon', message: 'Missing /favicon.ico' };

  return { https: httpsCheck, hsts: hstsCheck, favicon: faviconCheck };
}
