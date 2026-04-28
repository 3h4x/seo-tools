import type { SiteAuditResult } from './audit';
import type { Site } from './sites';

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

export interface SiteGapAnalysis {
  siteId: string;
  domain: string;
  gaps: GapRecommendation[];
  counts: { high: number; medium: number; low: number };
}

export function analyzeSiteGaps(audit: SiteAuditResult, site: Site): SiteGapAnalysis {
  const gaps: GapRecommendation[] = [];

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
  if (audit.sitemap.status === 'fail') {
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
  const pagesWithoutCanonical = audit.metaTags.filter(m => m.canonical.status === 'fail');
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

export function gapsBySection(gaps: GapRecommendation[]): Record<string, GapRecommendation[]> {
  const map: Record<string, GapRecommendation[]> = {};
  for (const gap of gaps) {
    const section = GAP_SECTION_MAP[gap.id] || 'other';
    (map[section] ??= []).push(gap);
  }
  return map;
}
