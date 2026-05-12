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

export function resolveSiteGa4PropertyId(
  site: SiteLike,
  properties: DiscoveredGa4Property[],
): string | undefined {
  if (site.ga4PropertyId) return site.ga4PropertyId;

  const domain = site.domain.toLowerCase();
  const property = properties.find((candidate) => {
    const displayName = candidate.displayName.toLowerCase();
    return displayName.includes(domain) || domain.includes(displayName);
  });

  return property?.propertyId;
}
