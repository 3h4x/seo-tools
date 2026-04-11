import type { GapRecommendation } from '@/lib/gaps';

// Map gap IDs to the audit section they belong to
export function gapsBySection(gaps: GapRecommendation[]): Record<string, GapRecommendation[]> {
  const map: Record<string, GapRecommendation[]> = {};
  const sectionMap: Record<string, string> = {
    'missing-robots-txt': 'robotsTxt',
    'robots-no-sitemap-directive': 'robotsTxt',
    'missing-sitemap': 'sitemap',
    'stale-sitemap': 'sitemap',
    'weak-meta-tags': 'metaTags',
    'missing-canonical': 'metaTags',
    'missing-twitter-card': 'metaTags',
    'missing-og-image': 'ogImage',
    'missing-json-ld': 'metaTags',
    'missing-image-alt': 'imageSeo',
    'missing-lazy-loading': 'imageSeo',
    'low-internal-linking': 'internalLinks',
    'slow-ttfb': 'ttfb',
    'missing-indexnow': 'indexing',
    'missing-noindex-dead': 'indexing',
    'no-https': 'security',
    'missing-hsts': 'security',
    'missing-favicon': 'security',
  };
  for (const gap of gaps) {
    const section = sectionMap[gap.id] || 'other';
    (map[section] ??= []).push(gap);
  }
  return map;
}
