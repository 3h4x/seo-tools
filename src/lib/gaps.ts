import type { SiteAuditResult } from './audit';
import { getBrokenCanonicalPages, getMissingCanonicalPages } from './canonical';
import { cachedGetAnalytics, type GA4TopPage } from './ga4';
import { cachedGetSearchConsolePages, type SCPageRow } from './search-console';
import { getSCUrl, type Site } from './sites';

export type GapSeverity = 'high' | 'medium' | 'low';
export type GapCategory = 'crawlability' | 'content' | 'social' | 'indexing' | 'structured-data' | 'performance' | 'security';

export const GAP_SEVERITY_STYLES: Record<GapSeverity, {
  label: string; bg: string; text: string; dot: string; border: string; accentBorder: string;
}> = {
  high:   { label: 'High',   bg: 'bg-red-500/10',   text: 'text-red-400',   dot: 'bg-red-500',   border: 'border-red-500/20',   accentBorder: 'border-l-red-500' },
  medium: { label: 'Medium', bg: 'bg-amber-500/10', text: 'text-amber-400', dot: 'bg-amber-500', border: 'border-amber-500/20', accentBorder: 'border-l-amber-500' },
  low:    { label: 'Low',    bg: 'bg-blue-500/10',  text: 'text-blue-400',  dot: 'bg-blue-500',  border: 'border-blue-500/20',  accentBorder: 'border-l-blue-500' },
};

export const CATEGORY_LABELS: Record<GapCategory, string> = {
  crawlability: 'Crawlability',
  content: 'Content',
  social: 'Social',
  indexing: 'Indexing',
  'structured-data': 'Structured Data',
  performance: 'Performance',
  security: 'Security',
};

export interface GapRecommendation {
  id: string;
  title: string;
  description: string;
  severity: GapSeverity;
  category: GapCategory;
  hint: string;
  affectedPages?: string[];
}

interface SiteGapAnalysis {
  siteId: string;
  domain: string;
  gaps: GapRecommendation[];
  counts: { high: number; medium: number; low: number };
}

export interface SiteGapSignals {
  ga4TopPages?: GA4TopPage[];
  scTopPages?: SCPageRow[];
  days?: number;
}

export function createSiteGapSignals({
  ga4TopPages,
  scTopPages,
  days,
}: SiteGapSignals = {}): SiteGapSignals {
  return {
    ga4TopPages,
    scTopPages: scTopPages ?? undefined,
    days,
  };
}

export async function loadSiteGapSignals(
  site: Site,
  propertyId: string,
  days: number,
): Promise<SiteGapSignals> {
  const [scTopPages, ga4Data] = await Promise.all([
    site.searchConsole ? cachedGetSearchConsolePages(getSCUrl(site), days) : Promise.resolve(null),
    cachedGetAnalytics(propertyId, days),
  ]);

  return createSiteGapSignals({
    ga4TopPages: ga4Data.data?.topPages,
    scTopPages: scTopPages ?? undefined,
    days,
  });
}

function normalizePageKey(value: string): string {
  try {
    const url = value.startsWith('http://') || value.startsWith('https://')
      ? new URL(value)
      : new URL(value, 'https://placeholder.local');
    const pathname = url.pathname.replace(/\/+$/, '') || '/';
    return pathname.toLowerCase();
  } catch {
    const trimmed = value.split('?')[0]?.split('#')[0] ?? value;
    const normalized = trimmed.replace(/\/+$/, '') || '/';
    return normalized.toLowerCase();
  }
}

interface AggregatedScPageSignal {
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

function aggregateScTopPages(scTopPages: SCPageRow[]): Map<string, AggregatedScPageSignal> {
  const aggregated = new Map<string, AggregatedScPageSignal>();

  for (const page of scTopPages) {
    const key = normalizePageKey(page.page);
    const existing = aggregated.get(key);

    if (existing) {
      const totalClicks = existing.clicks + page.clicks;
      const totalImpressions = existing.impressions + page.impressions;
      aggregated.set(key, {
        clicks: totalClicks,
        impressions: totalImpressions,
        ctr: totalImpressions > 0
          ? totalClicks / totalImpressions
          : Math.max(existing.ctr, page.ctr),
        position: Math.min(existing.position, page.position),
      });
      continue;
    }

    aggregated.set(key, {
      clicks: page.clicks,
      impressions: page.impressions,
      ctr: page.ctr,
      position: page.position,
    });
  }

  return aggregated;
}

function getLowEngagementPages(
  ga4TopPages: GA4TopPage[],
  scTopPages: SCPageRow[],
  days: number,
): Array<{ path: string; clicks: number; engagementRate: number; avgSessionDuration: number }> {
  const monthlyClickThreshold = 50;
  const clickThreshold = Math.max(1, Math.ceil((monthlyClickThreshold / 30) * days));
  const scByPage = aggregateScTopPages(scTopPages);

  return ga4TopPages.flatMap((page) => {
    const scPage = scByPage.get(normalizePageKey(page.path));
    if (!scPage) return [];
    if (scPage.clicks < clickThreshold || page.engagementRate >= 0.4) return [];

    return [{
      path: page.path,
      clicks: scPage.clicks,
      engagementRate: page.engagementRate,
      avgSessionDuration: page.avgSessionDuration,
    }];
  });
}

export function analyzeSiteGaps(audit: SiteAuditResult, site: Site, signals: SiteGapSignals = {}): SiteGapAnalysis {
  const gaps: GapRecommendation[] = [];
  const sitemapMissing = audit.sitemap.status === 'fail' && !audit.sitemap.url;

  // HIGH: robots.txt missing
  if (audit.robotsTxt.status === 'fail') {
    gaps.push({
      id: 'missing-robots-txt',
      title: 'Add robots.txt with Sitemap directive',
      description: 'No robots.txt found. Search engines rely on this file to discover your sitemap and understand crawl rules.',
      severity: 'high',
      category: 'crawlability',
      hint: 'Create a robots.txt at the site root with:\nUser-agent: *\nAllow: /\nSitemap: https://' + site.domain + '/sitemap.xml',
    });
  }

  // HIGH: sitemap missing
  if (sitemapMissing) {
    gaps.push({
      id: 'missing-sitemap',
      title: 'Add dynamic sitemap generation',
      description: 'No sitemap found. Sitemaps help search engines discover and index all your pages efficiently.',
      severity: 'high',
      category: 'crawlability',
      hint: 'Generate a sitemap.xml dynamically listing all public pages with <lastmod> dates. For sites with many pages, use a sitemap index with chunked child sitemaps (max 50,000 URLs each).',
    });
  }

  // LOW: robots.txt exists but no Sitemap directive
  if (audit.robotsTxt.status === 'warn' && !audit.robotsTxt.hasSitemapDirective) {
    gaps.push({
      id: 'robots-no-sitemap-directive',
      title: 'Add Sitemap directive to robots.txt',
      description: 'robots.txt exists but lacks a Sitemap directive. Adding it helps search engines find your sitemap without relying on Search Console alone.',
      severity: 'low',
      category: 'crawlability',
      hint: 'Append to robots.txt:\nSitemap: https://' + site.domain + '/sitemap.xml',
    });
  }

  // MEDIUM: meta tags issues
  const metaIssuePages = audit.metaTags.filter(
    (m) => m.title.status === 'fail' || m.description.status === 'fail' || m.ogTitle.status !== 'pass',
  );
  if (metaIssuePages.length > 0) {
    gaps.push({
      id: 'weak-meta-tags',
      title: 'Add bot-aware meta injection',
      description: 'Some pages have missing or generic meta tags. Bot-aware server-side meta injection ensures search engines see rich, page-specific metadata.',
      severity: 'medium',
      category: 'content',
      hint: 'Implement server-side bot detection (check User-Agent for Googlebot, Bingbot, etc.) and inject page-specific <title>, <meta description>, og:title, og:description dynamically before serving HTML.',
      affectedPages: metaIssuePages.map((m) => m.page),
    });
  }

  const redirectChainIssues = (audit.redirectChains ?? []).filter(
    (chain) => chain.status !== 'pass' && (chain.hopCount > 1 || chain.hasTemporaryRedirect || chain.loopDetected),
  );
  if (redirectChainIssues.length > 0) {
    gaps.push({
      id: 'redirect-chains',
      title: 'Flatten redirect chains to single permanent redirects',
      description: 'Some audited pages waste crawl budget with multi-hop or temporary redirects. Long chains slow down crawlers and temporary hops dilute canonical link equity.',
      severity: 'medium',
      category: 'crawlability',
      hint: 'Update redirects so each legacy URL resolves in a single permanent 301 or 308 hop to the final canonical destination. Replace 302/303/307 redirects with 301 or 308 when the move is intended to be permanent.',
      affectedPages: redirectChainIssues.map((chain) => chain.page),
    });
  }

  // MEDIUM: OG image missing
  if (audit.ogImage.status === 'fail') {
    gaps.push({
      id: 'missing-og-image',
      title: 'Add dynamic OG image generation (satori)',
      description: 'No valid OG image found. Social media previews will show a generic placeholder or nothing when your pages are shared.',
      severity: 'medium',
      category: 'social',
      hint: 'Use @vercel/satori to generate 1200x630 PNG images dynamically per page. Cache generated images (LRU, 5-min TTL) to avoid regeneration on every request.',
    });
  }

  // MEDIUM: JSON-LD missing on all pages
  const allJsonLdFail = audit.metaTags.every((m) => m.jsonLd.status === 'fail');
  if (allJsonLdFail) {
    gaps.push({
      id: 'missing-json-ld',
      title: 'Add structured data (Product, WebApplication, BreadcrumbList)',
      description: 'No JSON-LD structured data found on any page. Structured data enables rich snippets in search results (prices, ratings, breadcrumbs).',
      severity: 'medium',
      category: 'structured-data',
      hint: 'Add <script type="application/ld+json"> blocks with schema.org types appropriate for your content: Product for items with prices, WebApplication for the homepage, BreadcrumbList for navigation hierarchy.',
    });
  }

  // LOW: no IndexNow
  gaps.push({
    id: 'missing-indexnow',
    title: 'Add IndexNow ping on new content',
    description: 'IndexNow instantly notifies search engines when new content is published, significantly reducing the time to index.',
    severity: 'low',
    category: 'indexing',
    hint: 'POST to https://api.indexnow.org/indexnow with your site URL and a generated key whenever new content is created. Store the key at /' + site.domain + '/indexnow-key.txt.',
  });

  // MEDIUM/LOW: missing image alt text
  const pagesWithBadAlt = audit.imageSeo?.filter(i => i.status === 'fail' || i.status === 'warn') || [];
  if (pagesWithBadAlt.length > 0) {
    gaps.push({
      id: 'missing-image-alt',
      title: 'Add alt text to all images',
      description: 'Some pages have images without alt text. Alt text improves accessibility, helps search engines understand image content, and enables images to appear in Google Image search.',
      severity: pagesWithBadAlt.some(p => p.status === 'fail') ? 'medium' : 'low',
      category: 'content',
      hint: 'Add descriptive alt attributes to all <img> tags. Each alt text should describe the image content concisely. Avoid generic text like "image" or "photo".',
      affectedPages: pagesWithBadAlt.map(p => p.page),
    });
  }

  // MEDIUM/LOW: low internal linking
  const pagesWithLowLinks = audit.internalLinks?.filter(l => l.status === 'fail' || l.status === 'warn') || [];
  if (pagesWithLowLinks.length > 0) {
    gaps.push({
      id: 'low-internal-linking',
      title: 'Improve internal linking',
      description: 'Some pages have few or no internal links. Internal links help search engines discover content, distribute page authority, and keep users engaged.',
      severity: pagesWithLowLinks.some(p => p.status === 'fail') ? 'medium' : 'low',
      category: 'content',
      hint: 'Add 3-10 relevant internal links per page. Link to related content, category pages, and key conversion pages. Use descriptive anchor text that includes target keywords.',
      affectedPages: pagesWithLowLinks.map(p => p.page),
    });
  }

  const lowEngagementPages = signals.ga4TopPages && signals.scTopPages
    ? getLowEngagementPages(signals.ga4TopPages, signals.scTopPages, signals.days ?? 30)
    : [];
  if (lowEngagementPages.length > 0) {
    const topClickPage = lowEngagementPages.reduce((best, page) => page.clicks > best.clicks ? page : best, lowEngagementPages[0]);
    gaps.push({
      id: 'low-engagement-despite-traffic',
      title: 'Fix pages that rank but do not engage visitors',
      description: `${lowEngagementPages.length} page${lowEngagementPages.length > 1 ? 's' : ''} attract search traffic but convert poorly once users land. The worst page has ${topClickPage.clicks} Search Console clicks with only ${(topClickPage.engagementRate * 100).toFixed(0)}% engagement.`,
      severity: 'medium',
      category: 'content',
      hint: 'Review search intent match, hero copy, above-the-fold clarity, and internal CTA placement on these pages. Pages that win clicks but lose visitors quickly usually need tighter query alignment or clearer next steps.',
      affectedPages: lowEngagementPages.map((page) => page.path),
    });
  }

  // LOW: slow TTFB
  if (audit.ttfb.status === 'fail') {
    gaps.push({
      id: 'slow-ttfb',
      title: 'Optimize server response time',
      description: `TTFB is ${audit.ttfb.ms}ms (over 2000ms threshold). Slow server response hurts both user experience and search rankings.`,
      severity: 'low',
      category: 'performance',
      hint: 'Investigate server-side bottlenecks: database queries, API calls, SSR render time. Consider adding response caching, CDN, or moving to edge rendering.',
    });
  }

  // HIGH: missing canonical tags
  const pagesWithoutCanonical = getMissingCanonicalPages(audit.metaTags);
  if (pagesWithoutCanonical.length > 0) {
    gaps.push({
      id: 'missing-canonical',
      title: 'Add canonical URLs to all pages',
      description: 'Pages without canonical tags risk duplicate content issues. Search engines may index the wrong URL variant, diluting ranking signals.',
      severity: 'high',
      category: 'indexing',
      hint: 'Add <link rel="canonical" href="https://' + site.domain + '/page-path"> to every page. Use absolute URLs including protocol. Self-referencing canonicals are fine.',
      affectedPages: pagesWithoutCanonical.map(m => m.page),
    });
  }

  const pagesWithBrokenCanonical = getBrokenCanonicalPages(audit.metaTags);
  if (pagesWithBrokenCanonical.length > 0) {
    gaps.push({
      id: 'broken-canonical-targets',
      title: 'Fix broken canonical targets',
      description: 'Some pages already declare canonical URLs, but those targets are invalid or unavailable. Broken canonicals send conflicting indexing signals and can prevent search engines from trusting the preferred URL.',
      severity: 'high',
      category: 'indexing',
      hint: 'Update each canonical to a live absolute URL that resolves without errors. Prefer self-referential canonicals for indexable pages and verify the final target returns HTTP 200.',
      affectedPages: pagesWithBrokenCanonical.map((meta) => meta.page),
    });
  }

  // MEDIUM: missing twitter:card
  const pagesWithoutTwitter = audit.metaTags.filter(m => m.twitterCard.status === 'fail');
  if (pagesWithoutTwitter.length > 0) {
    gaps.push({
      id: 'missing-twitter-card',
      title: 'Add Twitter Card meta tags',
      description: 'Pages without twitter:card tags show plain links when shared on X/Twitter. Adding cards significantly improves click-through from social media.',
      severity: 'medium',
      category: 'social',
      hint: 'Add <meta name="twitter:card" content="summary_large_image"> along with twitter:title, twitter:description, and twitter:image tags.',
      affectedPages: pagesWithoutTwitter.map(m => m.page),
    });
  }

  // LOW: images not lazy-loaded
  const pagesWithoutLazy = (audit.imageSeo || []).filter(i => i.totalImages > 0 && i.withLazyLoading < i.totalImages);
  if (pagesWithoutLazy.length > 0) {
    const totalNotLazy = pagesWithoutLazy.reduce((s, p) => s + (p.totalImages - p.withLazyLoading), 0);
    gaps.push({
      id: 'missing-lazy-loading',
      title: 'Add lazy loading to images',
      description: `${totalNotLazy} images across ${pagesWithoutLazy.length} pages lack lazy loading. Lazy loading defers off-screen images, improving initial page load and Core Web Vitals (LCP).`,
      severity: 'low',
      category: 'performance',
      hint: 'Add loading="lazy" to all <img> tags below the fold. Keep above-the-fold hero images eager-loaded for LCP.',
      affectedPages: pagesWithoutLazy.map(p => p.page),
    });
  }

  // MEDIUM: stale sitemap lastmod
  if (audit.sitemap.lastmodSample) {
    const lastmod = new Date(audit.sitemap.lastmodSample);
    const daysSinceUpdate = (Date.now() - lastmod.getTime()) / (1000 * 60 * 60 * 24);
    if (daysSinceUpdate > 30) {
      gaps.push({
        id: 'stale-sitemap',
        title: 'Update sitemap lastmod dates',
        description: `Sitemap lastmod is ${Math.floor(daysSinceUpdate)} days old. Stale lastmod dates signal to search engines that content isn't fresh, potentially reducing crawl frequency.`,
        severity: 'medium',
        category: 'crawlability',
        hint: 'Ensure sitemap <lastmod> dates reflect actual content changes. Use ISO 8601 format (YYYY-MM-DDTHH:mm:ss). Only update lastmod when page content genuinely changes.',
      });
    }
  }

  // HIGH: no HTTPS
  if (audit.security?.https.status === 'fail') {
    gaps.push({
      id: 'no-https',
      title: 'Enable HTTPS with HTTP redirect',
      description: 'Site serves over HTTP without redirecting to HTTPS. Google treats HTTPS as a ranking signal and Chrome marks HTTP sites as "Not Secure".',
      severity: 'high',
      category: 'security',
      hint: 'Configure your server to redirect all HTTP requests to HTTPS using 301 redirects. Obtain an SSL certificate via Let\'s Encrypt (free) or your hosting provider.',
    });
  }

  // MEDIUM: missing HSTS
  if (audit.security?.hsts.status !== 'pass') {
    gaps.push({
      id: 'missing-hsts',
      title: 'Add HSTS header',
      description: 'Missing Strict-Transport-Security header. HSTS forces browsers to always use HTTPS, preventing protocol downgrade attacks and improving security signals.',
      severity: 'medium',
      category: 'security',
      hint: 'Add the response header: Strict-Transport-Security: max-age=31536000; includeSubDomains. Start with a short max-age for testing.',
    });
  }

  // LOW: missing favicon
  if (audit.security?.favicon.status !== 'pass') {
    gaps.push({
      id: 'missing-favicon',
      title: 'Add favicon',
      description: 'Missing /favicon.ico. Browsers and search engines request this file — a missing favicon generates 404 errors in server logs and looks unprofessional in browser tabs.',
      severity: 'low',
      category: 'content',
      hint: 'Create a favicon.ico (16x16 and 32x32) and place it at the site root. Also add <link rel="icon" href="/favicon.ico"> in <head>.',
    });
  }

  const counts = gaps.reduce(
    (acc, g) => { acc[g.severity]++; return acc; },
    { high: 0, medium: 0, low: 0 },
  );

  return { siteId: site.id, domain: site.domain, gaps, counts };
}

const GAP_SECTION_MAP: Record<string, string> = {
  'missing-robots-txt': 'robotsTxt',
  'robots-no-sitemap-directive': 'robotsTxt',
  'missing-sitemap': 'sitemap',
  'stale-sitemap': 'sitemap',
  'redirect-chains': 'redirectChains',
  'weak-meta-tags': 'metaTags',
  'missing-canonical': 'metaTags',
  'broken-canonical-targets': 'metaTags',
  'missing-twitter-card': 'metaTags',
  'missing-og-image': 'ogImage',
  'missing-json-ld': 'metaTags',
  'missing-image-alt': 'imageSeo',
  'missing-lazy-loading': 'imageSeo',
  'low-internal-linking': 'internalLinks',
  'low-engagement-despite-traffic': 'content',
  'slow-ttfb': 'ttfb',
  'missing-indexnow': 'indexing',
  'missing-noindex-dead': 'indexing',
  'no-https': 'security',
  'missing-hsts': 'security',
  'missing-favicon': 'security',
};

export function gapsBySection(gaps: GapRecommendation[]): Record<string, GapRecommendation[]> {
  const map: Record<string, GapRecommendation[]> = {};
  for (const gap of gaps) {
    const section = GAP_SECTION_MAP[gap.id] || 'other';
    (map[section] ??= []).push(gap);
  }
  return map;
}
