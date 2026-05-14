import { NextResponse } from 'next/server';
import { getAuth } from '@/lib/google-auth';
import { searchconsole_v1 } from '@googleapis/searchconsole';
import { dbGetSites } from '@/lib/db';
import { cachedGetDiscoveredGa4Properties } from '@/lib/ga4';
import { createUniqueSiteId, normalizeSiteDomain, slugifySiteDomain } from '@/lib/site-domain';
import { getSearchConsoleUrlIdentities, getSiteSearchConsoleIdentities, normalizeSearchConsoleIdentity, type Site } from '@/lib/sites';
import { buildUniqueExactGa4Matches, findMatchingGa4Property, getSafeDomainVariants, type DiscoveredGa4Property } from '@/lib/ga4-discovery';

type DiscoveredScSite = {
  scUrl: string;
  domain: string;
};

type DedupeScSite = DiscoveredScSite & {
  scUrls: string[];
};

type DiscoverySource = 'sc' | 'ga4' | 'sc+ga4';

type DiscoveryCandidate = Site & {
  isUpdate?: boolean;
  discoverySource: DiscoverySource;
  ga4DisplayName?: string;
};

type MatchedGa4Property = {
  propertyId: string;
  displayName: string;
};

function isDomainProperty(scUrl: string): boolean {
  return scUrl.toLowerCase().startsWith('sc-domain:');
}

function getScSiteRank(site: DiscoveredScSite): number {
  if (isDomainProperty(site.scUrl)) return 2;
  try {
    const url = new URL(site.scUrl);
    return url.pathname === '/' && !url.search && !url.hash ? 1 : 0;
  } catch {
    return 0;
  }
}

function shouldPreferScSite(candidate: DiscoveredScSite, current: DiscoveredScSite): boolean {
  const candidateRank = getScSiteRank(candidate);
  const currentRank = getScSiteRank(current);
  if (candidateRank !== currentRank) return candidateRank > currentRank;
  return normalizeSearchConsoleIdentity(candidate.scUrl) < normalizeSearchConsoleIdentity(current.scUrl);
}

function dedupeScSites(scSites: DiscoveredScSite[]): DedupeScSite[] {
  const byDomain = new Map<string, DedupeScSite>();
  for (const site of scSites) {
    const key = site.domain.toLowerCase();
    const current = byDomain.get(key);
    if (!current) {
      byDomain.set(key, { ...site, scUrls: [site.scUrl] });
      continue;
    }

    current.scUrls.push(site.scUrl);
    if (shouldPreferScSite(site, current)) {
      byDomain.set(key, { ...site, scUrls: current.scUrls });
    }
  }
  return [...byDomain.values()];
}

function getExistingDomainIdentity(domain: string): string {
  return normalizeSiteDomain(domain) ?? domain.trim().toLowerCase();
}

function normalizeGa4PropertyId(propertyId: string): string | undefined {
  const trimmed = propertyId.trim();
  if (!trimmed) return undefined;
  return trimmed.startsWith('properties/') ? trimmed : `properties/${trimmed}`;
}

function toMatchedGa4Property(property: DiscoveredGa4Property | undefined): MatchedGa4Property | undefined {
  if (!property) return undefined;

  const propertyId = normalizeGa4PropertyId(property.propertyId);
  const displayName = property.displayName.trim();
  if (!propertyId || !displayName) return undefined;

  return {
    propertyId,
    displayName,
  };
}

function createDiscoveryIdAllocator(existingIds: Iterable<string>): (domain: string) => string {
  const allocatedIds = new Set(existingIds);

  return (domain: string): string => {
    const baseId = slugifySiteDomain(domain);
    const nextId = createUniqueSiteId(baseId, allocatedIds);
    allocatedIds.add(nextId);
    return nextId;
  };
}

function hasDomainVariant(domain: string, domains: Set<string>): boolean {
  for (const variant of getSafeDomainVariants(domain)) {
    if (domains.has(variant)) return true;
  }
  return false;
}

export async function GET(req: Request) {
  let auth;
  try {
    auth = getAuth();
  } catch {
    return NextResponse.json({ error: 'No SA key configured' }, { status: 400 });
  }

  const existingSites = dbGetSites();
  const existingSiteIds = new Set(existingSites.map(site => site.id));
  const existingDomains = new Set(existingSites.map(s => getExistingDomainIdentity(s.domain)));
  const existingScIdentities = new Set(existingSites.flatMap(getSiteSearchConsoleIdentities));

  // Fetch SC sites
  let scSites: DedupeScSite[] = [];
  try {
    const sc = new searchconsole_v1.Searchconsole({ auth });
    const res = await sc.sites.list();
    const rawScSites = (res.data.siteEntry ?? [])
      .map(entry => {
        const scUrl = (entry.siteUrl ?? '').trim();
        const domain = isDomainProperty(scUrl)
          ? normalizeSiteDomain(scUrl.slice('sc-domain:'.length))
          : normalizeSiteDomain(scUrl);
        return domain ? { scUrl, domain } : null;
      })
      .filter((site): site is { scUrl: string; domain: string } => site !== null);
    scSites = dedupeScSites(rawScSites);
  } catch (err) {
    return NextResponse.json({ error: `SC API error: ${(err as Error).message}` }, { status: 500 });
  }

  // Fetch GA4 properties (best-effort)
  let ga4Properties: DiscoveredGa4Property[] | null = null;
  try {
    ga4Properties = await cachedGetDiscoveredGa4Properties();
  } catch {
    // GA4 discovery is best-effort; proceed without it.
  }

  const exactGa4Matches = buildUniqueExactGa4Matches(ga4Properties ?? []);
  const allocateDiscoveryId = createDiscoveryIdAllocator(existingSiteIds);

  // Debug: return raw GA4 property names
  if (new URL(req.url).searchParams.has('ga4debug')) {
    return NextResponse.json(Object.fromEntries(
      (ga4Properties ?? [])
        .map((property) => {
          const propertyId = property.propertyId.trim();
          const displayName = property.displayName.trim().toLowerCase();
          return displayName && propertyId ? [displayName, propertyId] : null;
        })
        .filter((entry): entry is [string, string] => entry !== null),
    ));
  }

  // Build proposed sites from the union of SC domains and GA4 properties not already in DB
  const proposedFromSc: DiscoveryCandidate[] = scSites
    .filter(({ domain, scUrls }) => {
      if (hasDomainVariant(domain, existingDomains) || hasDomainVariant(domain, existingScIdentities)) {
        return false;
      }

      const scIdentities = new Set<string>([domain.toLowerCase()]);
      for (const scUrl of scUrls) {
        for (const identity of getSearchConsoleUrlIdentities(scUrl)) {
          scIdentities.add(identity);
        }
      }

      return [...scIdentities].every(identity => !existingScIdentities.has(identity));
    })
    .map(({ domain, scUrl }) => {
      const ga4Match = toMatchedGa4Property(findMatchingGa4Property(domain, ga4Properties ?? []));
      return {
        id: allocateDiscoveryId(domain),
        name: domain,
        domain,
        scUrl: /^https?:\/\//i.test(scUrl) ? scUrl : undefined,
        searchConsole: true,
        testPages: ['/'],
        ga4PropertyId: ga4Match?.propertyId,
        ga4DisplayName: ga4Match?.displayName,
        discoverySource: ga4Match ? 'sc+ga4' : 'sc',
      };
    });
  const proposedScDomains = new Set(proposedFromSc.map(site => site.domain));
  const proposed: DiscoveryCandidate[] = [...proposedFromSc];

  for (const [domain, ga4Match] of exactGa4Matches.entries()) {
    if (
      hasDomainVariant(domain, proposedScDomains) ||
      hasDomainVariant(domain, existingDomains) ||
      hasDomainVariant(domain, existingScIdentities)
    ) {
      continue;
    }

    const matchedGa4Property = toMatchedGa4Property(ga4Match);
    if (!matchedGa4Property) continue;

    proposed.push({
      id: allocateDiscoveryId(domain),
      name: domain,
      domain,
      searchConsole: false,
      testPages: ['/'],
      ga4PropertyId: matchedGa4Property.propertyId,
      ga4DisplayName: matchedGa4Property.displayName,
      discoverySource: 'ga4',
    });
  }

  // Backfill existing sites that are missing a GA4 property ID but now have a discovered match
  const scDomains = new Set(scSites.map(site => site.domain));
  const backfill: DiscoveryCandidate[] = existingSites
    .filter(site => !site.ga4PropertyId)
    .flatMap(site => {
      const ga4Match = toMatchedGa4Property(findMatchingGa4Property(site.domain, ga4Properties ?? []));
      if (!ga4Match) return [];
      return [{
        ...site,
        ga4PropertyId: ga4Match.propertyId,
        ga4DisplayName: ga4Match.displayName,
        discoverySource: hasDomainVariant(site.domain, scDomains) ? 'sc+ga4' : 'ga4',
        isUpdate: true,
      }];
    });

  return NextResponse.json([...proposed, ...backfill]);
}
