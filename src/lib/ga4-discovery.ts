import { normalizeSiteDomain } from './site-domain';
import { normalizeGa4PropertyId } from './ga4-property';

export const GA4_DISCOVERY_CACHE_KEY = 'ga4-discovery';
export const GA4_DISCOVERY_CACHE_SITE_ID = 'managed-sites';

export interface DiscoveredGa4Property {
  displayName: string;
  propertyId: string;
}

interface SiteLike {
  domain: string;
  ga4PropertyId?: string;
}

type PreparedGa4Property = DiscoveredGa4Property & {
  exactDomain?: string;
  matchDomain?: string;
};

export function getSafeDomainVariants(domain: string): Set<string> {
  const normalized = normalizeSiteDomain(domain);
  if (!normalized) return new Set();

  const variants = new Set([normalized]);
  if (normalized.startsWith('www.')) {
    variants.add(normalized.slice(4));
  } else {
    variants.add(`www.${normalized}`);
  }

  return variants;
}

function parseLeadingDomainDisplayName(displayName: string): string | undefined {
  const match = displayName.match(/^([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+)(.*)$/i);
  if (!match) return undefined;

  const domain = normalizeSiteDomain(match[1]);
  if (!domain) return undefined;

  const descriptor = match[2].trim().replace(/^[-_:|/()[\]\s]+/, '').trim().toLowerCase();
  if (!descriptor) return domain;

  return /^(?:ga4|web|analytics)\b/.test(descriptor) ? domain : undefined;
}

function prepareGa4Properties(properties: DiscoveredGa4Property[]): PreparedGa4Property[] {
  const prepared: PreparedGa4Property[] = [];

  for (const property of properties) {
    const displayName = property.displayName.trim();
    const propertyId = property.propertyId.trim();
    if (!displayName || !propertyId) continue;

    const exactDomain = normalizeSiteDomain(displayName) ?? undefined;
    prepared.push({
      displayName,
      propertyId,
      exactDomain,
      matchDomain: exactDomain ?? parseLeadingDomainDisplayName(displayName),
    });
  }

  return prepared;
}

export function buildUniqueExactGa4Matches(properties: DiscoveredGa4Property[]): Map<string, DiscoveredGa4Property> {
  const matches = new Map<string, DiscoveredGa4Property>();
  const ambiguousDomains = new Set<string>();

  for (const property of prepareGa4Properties(properties)) {
    if (!property.exactDomain || ambiguousDomains.has(property.exactDomain)) continue;

    const current = matches.get(property.exactDomain);
    if (current) {
      matches.delete(property.exactDomain);
      ambiguousDomains.add(property.exactDomain);
      continue;
    }

    matches.set(property.exactDomain, {
      displayName: property.displayName,
      propertyId: property.propertyId,
    });
  }

  return matches;
}

export function findMatchingGa4Property(domain: string, properties: DiscoveredGa4Property[]): DiscoveredGa4Property | undefined {
  const safeVariants = getSafeDomainVariants(domain);
  if (safeVariants.size === 0) return undefined;

  const matches = prepareGa4Properties(properties).filter((property) => {
    return property.matchDomain ? safeVariants.has(property.matchDomain) : false;
  });

  if (matches.length !== 1) return undefined;

  return {
    displayName: matches[0].displayName,
    propertyId: matches[0].propertyId,
  };
}

export function resolveSiteGa4PropertyId(
  site: SiteLike,
  properties: DiscoveredGa4Property[],
): string | undefined {
  if (site.ga4PropertyId) return normalizeGa4PropertyId(site.ga4PropertyId);

  return normalizeGa4PropertyId(findMatchingGa4Property(site.domain, properties)?.propertyId);
}
