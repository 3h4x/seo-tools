import { normalizeSiteDomain } from './site-domain';

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
};

function prepareGa4Properties(properties: DiscoveredGa4Property[]): PreparedGa4Property[] {
  const prepared: PreparedGa4Property[] = [];

  for (const property of properties) {
    const displayName = property.displayName.trim();
    const propertyId = property.propertyId.trim();
    if (!displayName || !propertyId) continue;

    prepared.push({
      displayName,
      propertyId,
      exactDomain: normalizeSiteDomain(displayName) ?? undefined,
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
  const domainLower = domain.trim().toLowerCase();
  if (!domainLower) return undefined;

  const matches = prepareGa4Properties(properties).filter((property) => {
    if (property.exactDomain === domainLower) return true;

    const displayName = property.displayName.toLowerCase();
    return displayName.includes(domainLower) || domainLower.includes(displayName);
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
  if (site.ga4PropertyId) return site.ga4PropertyId;

  return findMatchingGa4Property(site.domain, properties)?.propertyId;
}
