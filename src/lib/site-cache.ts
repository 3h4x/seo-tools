import { clearCacheEntry, clearCacheEntriesByPrefix, clearSitemapSyncState } from './db';
import { getSCUrl, type Site } from './sites';

const SEARCH_CONSOLE_CACHE_PREFIXES = ['sc-comparison-', 'sc-data-', 'sc-queries-', 'sc-pages-'] as const;
const GA4_PROPERTY_CACHE_PREFIXES = ['ga4-', 'rum-cwv-'] as const;

function getCacheIdentities(site: Site): {
  auditSiteId: string;
  domain: string;
  scSiteId: string;
  ga4PropertyId?: string;
} {
  const ga4PropertyId = site.ga4PropertyId?.trim();

  return {
    auditSiteId: site.id,
    domain: site.domain.trim(),
    scSiteId: getSCUrl(site),
    ga4PropertyId: ga4PropertyId ? ga4PropertyId : undefined,
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

  const auditSiteIds = unique([previous?.auditSiteId, next?.auditSiteId]);

  for (const siteId of auditSiteIds) {
    clearCacheEntry('audit', siteId);
  }

  if (shouldClearSitemapSyncState(previous, next)) {
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

  for (const propertyId of unique([previous?.ga4PropertyId, next?.ga4PropertyId])) {
    for (const prefix of GA4_PROPERTY_CACHE_PREFIXES) {
      clearCacheEntriesByPrefix(prefix, propertyId);
    }
  }
}
