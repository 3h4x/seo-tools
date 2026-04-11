import { NextResponse } from 'next/server';
import { getAuth } from '@/lib/google-auth';
import { searchconsole_v1 } from '@googleapis/searchconsole';
import { AnalyticsAdminServiceClient } from '@google-analytics/admin';
import { dbGetSites } from '@/lib/db';
import type { Site } from '@/lib/sites';

function slugify(domain: string): string {
  return domain.replace(/\./g, '-').replace(/[^a-z0-9-]/gi, '').toLowerCase();
}

export async function GET(req: Request) {
  let auth;
  try {
    auth = getAuth();
  } catch {
    return NextResponse.json({ error: 'No SA key configured' }, { status: 400 });
  }

  const existingSites = dbGetSites();
  const existingDomains = new Set(existingSites.map(s => s.domain.toLowerCase()));

  // Fetch SC sites
  let scDomains: string[] = [];
  try {
    const sc = new searchconsole_v1.Searchconsole({ auth });
    const res = await sc.sites.list();
    scDomains = (res.data.siteEntry ?? [])
      .map(entry => {
        const url = entry.siteUrl ?? '';
        return url.startsWith('sc-domain:') ? url.slice('sc-domain:'.length) : url;
      })
      .filter(Boolean);
  } catch (err) {
    return NextResponse.json({ error: `SC API error: ${(err as Error).message}` }, { status: 500 });
  }

  // Fetch GA4 properties (best-effort)
  const ga4Map = new Map<string, string>(); // display name → propertyId
  try {
    const adminClient = new AnalyticsAdminServiceClient({ auth });
    const [summaries] = await adminClient.listAccountSummaries({});
    for (const account of summaries) {
      for (const prop of account.propertySummaries ?? []) {
        const name = (prop.displayName ?? '').toLowerCase();
        const propId = prop.property?.split('/')[1] ?? '';
        if (propId) ga4Map.set(name, propId);
      }
    }
  } catch {
    // GA4 discovery is best-effort; proceed without it
  }

  // Debug: return raw GA4 property names
  if (new URL(req.url).searchParams.has('ga4debug')) {
    return NextResponse.json(Object.fromEntries(ga4Map));
  }

  // Build proposed sites from SC domains not already in DB
  const proposed: Site[] = scDomains
    .filter(domain => !existingDomains.has(domain.toLowerCase()))
    .map(domain => {
      const domainLower = domain.toLowerCase();
      // Strip protocol and trailing slash for matching URL-prefix SC properties
      const domainStripped = domainLower.replace(/^https?:\/\//, '').replace(/\/$/, '');
      let ga4PropertyId: string | undefined;
      for (const [name, propId] of ga4Map.entries()) {
        if (name.includes(domainStripped) || domainStripped.includes(name)) {
          ga4PropertyId = propId;
          break;
        }
      }

      return {
        id: slugify(domain),
        name: domain,
        domain,
        searchConsole: true,
        testPages: ['/'],
        ga4PropertyId,
      };
    });

  return NextResponse.json(proposed);
}
