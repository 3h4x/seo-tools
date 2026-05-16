import {
  clearCache,
  clearCacheEntry,
  clearCacheEntriesByPrefix,
  clearCacheEntriesBySiteIdPrefix,
  clearSitemapSyncState,
} from './db';
import { getSCUrl, type Site } from './sites';
import { normalizeGa4PropertyId } from './ga4-property';

const SEARCH_CONSOLE_CACHE_PREFIXES = ['sc-comparison-', 'sc-data-', 'sc-queries-', 'sc-pages-', 'sc-page-queries-'] as const;
const GA4_PROPERTY_CACHE_PREFIXES = ['ga4-', 'rum-cwv-', 'rum-cwv-events-'] as const;
const PSI_CACHE_KEYS = ['psi-mobile', 'psi-desktop'] as const;

function getDomainUrl(domain: string): string | undefined {
  const normalizedDomain = domain.trim();
  if (!normalizedDomain) return undefined;
  return normalizedDomain.startsWith('http') ? normalizedDomain : `https://${normalizedDomain}`;
}

function getCacheIdentities(site: Site): {
  auditSiteId: string;
  domain: string;
  scSiteId: string;
  ga4PropertyId?: string;
  psiUrl?: string;
} {
  const ga4PropertyId = normalizeGa4PropertyId(site.ga4PropertyId);
  const domain = site.domain.trim();

  return {
    auditSiteId: site.id,
    domain,
    scSiteId: getSCUrl(site),
    ga4PropertyId,
    psiUrl: getDomainUrl(domain),
  };
}

function unique(values: Array<string | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}

function shouldClearSitemapSyncState(
  previous: ReturnType<typeof getCacheIdentities> | null,
  next: ReturnType<typeof getCacheIdentities> | null,
): boolean {
  if (!previous || !next) return true;
  return (
    previous.auditSiteId !== next.auditSiteId ||
    previous.domain !== next.domain ||
    previous.scSiteId !== next.scSiteId
  );
}

export function invalidateManagedSiteCache(previousSite: Site | null, nextSite: Site | null): void {
  const previous = previousSite ? getCacheIdentities(previousSite) : null;
  const next = nextSite ? getCacheIdentities(nextSite) : null;

  clearCache('cross-links-matrix');

  const auditSiteIds = unique([previous?.auditSiteId, next?.auditSiteId]);

  for (const siteId of auditSiteIds) {
    clearCacheEntry('audit', siteId);
    clearCacheEntriesBySiteIdPrefix('url-inspection', `${siteId}:`);
    clearCacheEntriesByPrefix('opportunities-', siteId);
  }

  if (shouldClearSitemapSyncState(previous, next)) {
    // A site identity change must force the next sitemap sync to behave like a
    // first submit, even when the sitemap XML hash itself is unchanged.
    for (const siteId of auditSiteIds) {
      clearSitemapSyncState(siteId);
    }
  }

  for (const siteId of unique([previous?.scSiteId, next?.scSiteId])) {
    clearCacheEntry('sitemap-submissions', siteId);
    for (const prefix of SEARCH_CONSOLE_CACHE_PREFIXES) {
      clearCacheEntriesByPrefix(prefix, siteId);
    }
  }

  for (const psiUrl of unique([previous?.psiUrl, next?.psiUrl])) {
    for (const cacheKey of PSI_CACHE_KEYS) {
      clearCacheEntry(cacheKey, psiUrl);
    }
  }

  for (const propertyId of unique([previous?.ga4PropertyId, next?.ga4PropertyId])) {
    for (const prefix of GA4_PROPERTY_CACHE_PREFIXES) {
      clearCacheEntriesByPrefix(prefix, propertyId);
    }
  }
}
