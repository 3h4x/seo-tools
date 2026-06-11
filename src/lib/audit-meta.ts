import { GOOGLEBOT_UA, safeFetch } from './audit-fetch';
import type {
  CheckResult,
  CheckStatus,
  FetchResult,
  MetaTagResult,
} from './audit-types';

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

export async function checkCanonicalUrl(
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
