const DOMAIN_RE = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;
const SITE_ID_RE = /^[a-z0-9][a-z0-9_.-]*$/i;
export const RESERVED_SITE_IDS = ['actions', 'api', 'audit', 'config', 'performance', 'trends'] as const;

export function normalizeSiteDomain(value: string): string | null {
  const input = value.trim();
  if (!input || /\s/.test(input)) return null;

  if (/^https?:\/\//i.test(input)) {
    try {
      const url = new URL(input);
      const hostname = url.hostname.toLowerCase();
      return DOMAIN_RE.test(hostname) ? hostname : null;
    } catch {
      return null;
    }
  }

  const domain = input.toLowerCase();
  return DOMAIN_RE.test(domain) ? domain : null;
}

export function isValidSiteDomain(value: string): boolean {
  return normalizeSiteDomain(value) !== null;
}

export function getSiteScUrlOverride(domainInput: string, explicitScUrl?: string): string | undefined {
  const trimmedScUrl = explicitScUrl?.trim();
  if (trimmedScUrl) return trimmedScUrl;

  const trimmedDomainInput = domainInput.trim();
  return /^https?:\/\//i.test(trimmedDomainInput) ? trimmedDomainInput : undefined;
}

export function slugifySiteDomain(domain: string): string {
  return domain.replace(/\./g, '-').replace(/[^a-z0-9-]/gi, '').toLowerCase();
}

export function isValidSiteId(value: string): boolean {
  return value === value.trim() && SITE_ID_RE.test(value);
}

export function isReservedSiteId(value: string): boolean {
  return RESERVED_SITE_IDS.includes(value.trim().toLowerCase() as typeof RESERVED_SITE_IDS[number]);
}

export function createUniqueSiteId(baseId: string, existingIds: Iterable<string>): string {
  const unavailableIds = new Set([...RESERVED_SITE_IDS, ...existingIds].map(id => id.toLowerCase()));
  let nextId = baseId;
  let suffix = 2;

  while (unavailableIds.has(nextId.toLowerCase())) {
    nextId = `${baseId}-${suffix}`;
    suffix += 1;
  }

  return nextId;
}
