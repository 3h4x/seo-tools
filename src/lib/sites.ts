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
  /** Audit check labels to skip (mark as N/A) — for checks that can't be fixed by the site owner. */
  skipChecks?: string[];
}

/** Returns the URL to use for Search Console API calls for a given site. */
export function getSCUrl(site: Site): string {
  return site.scUrl ?? site.domain;
}

import { dbGetSites } from './db';

export async function getManagedSites(): Promise<Site[]> {
  return dbGetSites();
}

export async function getManagedSite(id: string): Promise<Site | null> {
  const sites = await getManagedSites();
  return sites.find(s => s.id === id) ?? null;
}

