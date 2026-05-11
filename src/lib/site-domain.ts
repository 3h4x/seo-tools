const DOMAIN_RE = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;

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
