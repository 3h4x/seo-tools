export interface Site {
  id: string;
  name: string;
  domain: string;
  /** Override the Search Console site URL. Use for sites that can't use sc-domain: (e.g. GitHub Pages). */
  scUrl?: string;
  ga4PropertyId?: string;
  searchConsole?: boolean;
  color?: string;
  testPages: string[];
  /** Audit check ids to skip (mark as N/A) — for checks that can't be fixed by the site owner. */
  skipChecks?: string[];
}

export interface SiteFieldErrors {
  id?: string;
  name?: string;
  domain?: string;
  scUrl?: string;
  ga4PropertyId?: string;
  testPages?: string;
}

export interface NormalizedSiteInput {
  site: Site;
}

type SiteIdentityInput = Pick<Site, 'domain' | 'scUrl'>;

/** Returns the URL to use for Search Console API calls for a given site. */
export function getSCUrl(site: SiteIdentityInput): string {
  const url = site.scUrl ?? site.domain;
  if (url.startsWith('sc-domain:') || url.startsWith('http')) return url;
  return `sc-domain:${url}`;
}

export function normalizeSearchConsoleIdentity(value: string): string {
  return value.trim().toLowerCase().replace(/\/$/, '');
}

export function getSearchConsoleUrlIdentities(scUrl: string): string[] {
  const normalizedScUrl = normalizeSearchConsoleIdentity(scUrl);
  if (!normalizedScUrl) return [];

  const identities = new Set<string>([normalizedScUrl]);

  if (normalizedScUrl.startsWith('sc-domain:')) {
    const domain = normalizeSiteDomain(normalizedScUrl.slice('sc-domain:'.length));
    if (domain) identities.add(domain);
    return [...identities];
  }

  if (/^https?:\/\//i.test(normalizedScUrl)) {
    try {
      const domain = normalizeSiteDomain(new URL(normalizedScUrl).hostname);
      if (domain) identities.add(domain);
    } catch {
      // Validation happens elsewhere; identity expansion is best-effort.
    }
  }

  return [...identities];
}

export function getSiteSearchConsoleIdentities(site: SiteIdentityInput): string[] {
  const identities = new Set<string>();
  const normalizedDomain = normalizeSiteDomain(site.domain);
  if (normalizedDomain) identities.add(normalizedDomain);

  for (const identity of getSearchConsoleUrlIdentities(getSCUrl(site))) {
    identities.add(identity);
  }

  return [...identities];
}

import { dbGetSites } from './db';
import { normalizeSiteDomain, isReservedSiteId, isValidSiteId, getSiteScUrlOverride } from './site-domain';
import { normalizeSkipChecks } from './skip-checks';

const GA4_PROPERTY_RE = /^properties\/\d+$/;

export function validateAndNormalizeSiteInput(
  raw: unknown,
  existingSites: Site[],
): { errors: SiteFieldErrors; normalized: null } | { errors: null; normalized: NormalizedSiteInput } {
  const body = raw as Record<string, unknown>;
  const errors: SiteFieldErrors = {};

  const id = typeof body.id === 'string' ? body.id.trim() : '';
  const originalId = typeof body.originalId === 'string' ? body.originalId.trim() : '';
  if (!id) {
    errors.id = 'id is required';
  } else if (!isValidSiteId(id)) {
    errors.id = 'id must contain only letters, digits, hyphens, underscores, or dots and must not start with a special character';
  } else if (isReservedSiteId(id)) {
    errors.id = `"${id}" is reserved for an app route and cannot be used as a site id`;
  }
  if (originalId && !isValidSiteId(originalId)) {
    errors.id = 'originalId must be a valid existing site id';
  } else if (originalId && originalId !== id) {
    errors.id = 'changing site id is not supported';
  }

  const existingById = existingSites.find(site => site.id === id);
  if (existingById && originalId !== id) {
    errors.id = `id is already used by site "${existingById.id}"`;
  }

  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name) errors.name = 'name is required';

  const rawDomain = typeof body.domain === 'string' ? body.domain.trim() : '';
  const normalizedDomain = rawDomain ? normalizeSiteDomain(rawDomain) : null;
  if (!rawDomain) {
    errors.domain = 'domain is required';
  } else if (!normalizedDomain) {
    errors.domain = 'domain must be a valid hostname or URL (e.g. example.com or https://example.com)';
  } else {
    const duplicate = existingSites.find(s => s.domain === normalizedDomain && s.id !== id);
    if (duplicate) errors.domain = `domain is already used by site "${duplicate.id}"`;
  }

  const rawScUrl = typeof body.scUrl === 'string' ? body.scUrl.trim() : '';
  if (rawScUrl && !rawScUrl.startsWith('sc-domain:') && !/^https?:\/\//i.test(rawScUrl)) {
    errors.scUrl = 'scUrl must be a valid URL (https://…) or use the sc-domain: prefix';
  }

  const rawGa4 = typeof body.ga4PropertyId === 'string' ? body.ga4PropertyId.trim() : '';
  if (rawGa4 && !GA4_PROPERTY_RE.test(rawGa4)) {
    errors.ga4PropertyId = 'ga4PropertyId must be in the format properties/NNNNNN';
  }

  const rawTestPages = Array.isArray(body.testPages) ? body.testPages : [];
  const badPage = rawTestPages.find(p => typeof p !== 'string' || !String(p).trim().startsWith('/'));
  if (badPage !== undefined) {
    errors.testPages = 'each testPages entry must be an absolute path starting with /';
  }

  if (Object.keys(errors).length > 0) return { errors, normalized: null };

  const scUrl = getSiteScUrlOverride(rawDomain, rawScUrl || undefined);
  const nextScIdentities = new Set(getSiteSearchConsoleIdentities({ domain: normalizedDomain!, scUrl }));
  const scDuplicate = existingSites.find((site) => (
    site.id !== id &&
    getSiteSearchConsoleIdentities(site).some(identity => nextScIdentities.has(identity))
  ));
  if (scDuplicate) {
    return {
      errors: {
        scUrl: `Search Console identity is already used by site "${scDuplicate.id}"`,
      },
      normalized: null,
    };
  }

  const site: Site = {
    ...(raw as Site),
    id,
    name,
    domain: normalizedDomain!,
    testPages: rawTestPages.map(p => String(p).trim()).filter(Boolean),
  };
  if (scUrl) site.scUrl = scUrl; else delete site.scUrl;
  if (rawGa4) site.ga4PropertyId = rawGa4; else delete site.ga4PropertyId;
  if (Array.isArray(body.skipChecks)) {
    site.skipChecks = normalizeSkipChecks(body.skipChecks.filter((value): value is string => typeof value === 'string'));
  } else {
    delete site.skipChecks;
  }

  delete (site as unknown as Record<string, unknown>).sortOrder;
  delete (site as unknown as Record<string, unknown>).originalId;

  return { errors: null, normalized: { site } };
}

export async function getManagedSites(): Promise<Site[]> {
  return dbGetSites();
}

export async function getManagedSite(id: string): Promise<Site | null> {
  const sites = await getManagedSites();
  return sites.find(s => s.id === id) ?? null;
}
