import { NextResponse } from 'next/server';
import { getAuth } from '@/lib/google-auth';
import { searchconsole_v1 } from '@googleapis/searchconsole';
import { dbGetSites } from '@/lib/db';
import { cachedGetDiscoveredGa4Properties } from '@/lib/ga4';
import { normalizeSiteDomain, slugifySiteDomain } from '@/lib/site-domain';
import { getSCUrl, type Site } from '@/lib/sites';

type DiscoveredScSite = {
  scUrl: string;
  domain: string;
};

type DedupeScSite = DiscoveredScSite & {
  scUrls: string[];
};

function normalizeScIdentity(value: string): string {
  return value.trim().toLowerCase().replace(/\/$/, '');
}

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
  return normalizeScIdentity(candidate.scUrl) < normalizeScIdentity(current.scUrl);
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

export async function GET(req: Request) {
  let auth;
  try {
    auth = getAuth();
  } catch {
    return NextResponse.json({ error: 'No SA key configured' }, { status: 400 });
  }

  const existingSites = dbGetSites();
  const existingDomains = new Set(existingSites.map(s => getExistingDomainIdentity(s.domain)));
  const existingScIdentities = new Set(existingSites.map(s => normalizeScIdentity(getSCUrl(s))));

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
  const ga4Map = new Map<string, string>(); // display name → propertyId
  try {
    const properties = await cachedGetDiscoveredGa4Properties();
    for (const property of properties ?? []) {
      const displayName = property.displayName.trim().toLowerCase();
      const propertyId = property.propertyId.trim();
      if (displayName && propertyId) ga4Map.set(displayName, propertyId);
    }
  } catch {
    // GA4 discovery is best-effort; proceed without it.
  }

  // Debug: return raw GA4 property names
  if (new URL(req.url).searchParams.has('ga4debug')) {
    return NextResponse.json(Object.fromEntries(ga4Map));
  }

  // Build proposed sites from SC domains not already in DB
  const proposed: Site[] = scSites
    .filter(({ domain, scUrls }) => (
      !existingDomains.has(domain.toLowerCase()) &&
      scUrls.every(scUrl => !existingScIdentities.has(normalizeScIdentity(scUrl)))
    ))
    .map(({ domain, scUrl }) => {
      const domainLower = domain.toLowerCase();
      let ga4PropertyId: string | undefined;
      for (const [name, propId] of ga4Map.entries()) {
        if (name.includes(domainLower) || domainLower.includes(name)) {
          ga4PropertyId = propId;
          break;
        }
      }

      return {
        id: slugifySiteDomain(domain),
        name: domain,
        domain,
        scUrl: /^https?:\/\//i.test(scUrl) ? scUrl : undefined,
        searchConsole: true,
        testPages: ['/'],
        ga4PropertyId,
      };
    });

  return NextResponse.json(proposed);
}
