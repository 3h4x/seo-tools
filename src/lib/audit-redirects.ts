import { GOOGLEBOT_UA, safeFetch } from './audit-fetch';
import type {
  CheckStatus,
  RedirectChainResult,
  RedirectHop,
} from './audit-types';

const MAX_REDIRECT_HOPS = 10;
const PERMANENT_REDIRECT_STATUSES = new Set([301, 308]);

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
