export type SkipCheckId =
  | 'robotsTxt'
  | 'sitemap'
  | 'scSitemap'
  | 'indexing'
  | 'redirectChain'
  | 'title'
  | 'description'
  | 'ogTitle'
  | 'ogDescription'
  | 'ogImageMeta'
  | 'ogImage'
  | 'twitterCard'
  | 'canonical'
  | 'jsonLd'
  | 'https'
  | 'hsts'
  | 'favicon'
  | 'ttfb'
  | 'images'
  | 'brokenLinks'
  | 'internalLinks';

export interface SkipCheckOption {
  id: SkipCheckId;
  label: string;
  aliases?: string[];
}

export const SKIP_CHECK_OPTIONS: SkipCheckOption[] = [
  { id: 'robotsTxt', label: 'robots.txt' },
  { id: 'sitemap', label: 'Sitemap', aliases: ['sitemap-coverage'] },
  { id: 'scSitemap', label: 'SC Sitemap' },
  { id: 'indexing', label: 'Indexing' },
  { id: 'redirectChain', label: 'Redirect Chain', aliases: ['redirect-chain'] },
  { id: 'title', label: 'title' },
  { id: 'description', label: 'description' },
  { id: 'ogTitle', label: 'og:title' },
  { id: 'ogDescription', label: 'og:description' },
  { id: 'ogImageMeta', label: 'og:image', aliases: ['meta-og-image'] },
  { id: 'ogImage', label: 'OG Image' },
  { id: 'twitterCard', label: 'twitter:card' },
  { id: 'canonical', label: 'canonical' },
  { id: 'jsonLd', label: 'JSON-LD' },
  { id: 'https', label: 'HTTPS' },
  { id: 'hsts', label: 'HSTS' },
  { id: 'favicon', label: 'Favicon' },
  { id: 'ttfb', label: 'TTFB' },
  { id: 'images', label: 'Images' },
  { id: 'brokenLinks', label: 'Broken Links', aliases: ['broken-links'] },
  { id: 'internalLinks', label: 'Internal Links' },
];

function normalizeLooseKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

const EXACT_ID_LOOKUP = new Map<string, SkipCheckId>();
const LOOSE_ID_LOOKUP = new Map<string, SkipCheckId>();

for (const option of SKIP_CHECK_OPTIONS) {
  const rawKeys = [option.id, option.label, ...(option.aliases ?? [])];
  for (const rawKey of rawKeys) {
    EXACT_ID_LOOKUP.set(rawKey.toLowerCase(), option.id);
  }

  const looseKeys =
    option.id === 'ogImageMeta'
      ? ['metaogimage', 'metaog']
      : rawKeys.map(normalizeLooseKey);

  for (const looseKey of looseKeys) {
    if (looseKey) {
      LOOSE_ID_LOOKUP.set(looseKey, option.id);
    }
  }
}

export function getSkipCheckId(value: string): SkipCheckId | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  return EXACT_ID_LOOKUP.get(trimmed.toLowerCase()) ?? LOOSE_ID_LOOKUP.get(normalizeLooseKey(trimmed)) ?? null;
}

export function normalizeSkipChecks(values: string[] | undefined): SkipCheckId[] {
  if (!values?.length) return [];

  const normalized: SkipCheckId[] = [];
  const seen = new Set<SkipCheckId>();

  for (const value of values) {
    const id = getSkipCheckId(value);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    normalized.push(id);
  }

  return normalized;
}

export function hasSkipCheck(values: string[] | undefined, id: SkipCheckId): boolean {
  return normalizeSkipChecks(values).includes(id);
}

export function toggleSkipCheck(values: string[] | undefined, id: SkipCheckId, checked: boolean): SkipCheckId[] {
  const normalized = normalizeSkipChecks(values);
  if (checked) {
    return normalized.includes(id) ? normalized : [...normalized, id];
  }
  return normalized.filter((value) => value !== id);
}
