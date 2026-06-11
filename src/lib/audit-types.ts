export type CheckStatus = 'pass' | 'warn' | 'fail' | 'error';

export interface CheckResult {
  status: CheckStatus;
  label: string;
  message: string;
  details?: string;
  rawLength?: number;
  rawValue?: string;
}

export interface RobotsTxtResult extends CheckResult {
  raw?: string;
  hasSitemapDirective: boolean;
  sitemapUrl?: string;
}

export interface SitemapResult extends CheckResult {
  url?: string;
  urlCount?: number;
  isIndex?: boolean;
  hasLastmod?: boolean;
  lastmodSample?: string;
  locs?: string[];
  checkedUrlCount?: number;
  deadUrlCount?: number;
  deadUrls?: string[];
  crawledPagesInSitemap?: number;
  crawledPagesChecked?: number;
  crawlCoveragePct?: number;
  staleLastmodCount?: number;
  checkedLastmodCount?: number;
  staleLastmodThresholdDays?: number;
}

export interface MetaTagResult {
  page: string;
  ogImageUrl?: string;
  noindex: boolean;
  canonicalValid: boolean | null;
  canonicalStatus: number | null;
  canonicalTarget: string | null;
  title: CheckResult;
  description: CheckResult;
  ogTitle: CheckResult;
  ogImage: CheckResult;
  ogDescription: CheckResult;
  twitterCard: CheckResult;
  canonical: CheckResult;
  jsonLd: CheckResult;
}

export interface OgImageResult extends CheckResult {
  url?: string;
  contentType?: string;
  dimensions?: string;
}

export interface TtfbResult extends CheckResult {
  ms?: number;
}

export interface RedirectHop {
  url: string;
  status: number;
  location?: string;
}

export interface RedirectChainResult extends CheckResult {
  page: string;
  requestedUrl: string;
  finalUrl: string;
  hops: RedirectHop[];
  hopCount: number;
  hasTemporaryRedirect: boolean;
  loopDetected: boolean;
}

export interface ImageDetail {
  src: string;
  hasAlt: boolean;
  altText?: string;
  isLazy: boolean;
}

export interface ImageSeoResult {
  page: string;
  totalImages: number;
  withAlt: number;
  withoutAlt: number;
  withLazyLoading: number;
  status: CheckStatus;
  label: string;
  message: string;
  images: ImageDetail[];
}

export interface InternalLinkResult {
  page: string;
  internalLinks: number;
  externalLinks: number;
  checkedInternalLinks: number;
  brokenLinks: Array<{
    url: string;
    status: number;
  }>;
  brokenLinksMessage: string;
  status: CheckStatus;
  label: string;
  message: string;
}

export interface SecurityResult {
  https: CheckResult;
  hsts: CheckResult;
  favicon: CheckResult;
}

export interface IndexingCoverageResult extends CheckResult {
  sitemapUrls?: number;
  indexedPages?: number;
  coveragePct?: number;
}

export interface UrlInspectionPageResult extends CheckResult {
  page: string;
  inspectionUrl: string;
  verdict?: string;
  coverageState?: string;
  indexingState?: string;
  lastCrawlTime?: string;
  mobileUsabilityVerdict?: string;
  richResultsVerdict?: string;
  referringUrls?: string[];
  googleCanonical?: string;
  userCanonical?: string;
  inspectionResultLink?: string;
}

export interface SiteAuditResult {
  siteId: string;
  domain: string;
  timestamp: number;
  robotsTxt: RobotsTxtResult;
  sitemap: SitemapResult;
  scSitemapFreshness: CheckResult;
  indexingCoverage: IndexingCoverageResult;
  indexNow: CheckResult;
  urlInspection: UrlInspectionPageResult[];
  redirectChains: RedirectChainResult[];
  metaTags: MetaTagResult[];
  ogImage: OgImageResult;
  ttfb: TtfbResult;
  imageSeo: ImageSeoResult[];
  internalLinks: InternalLinkResult[];
  security: SecurityResult;
  score: { pass: number; warn: number; fail: number; error: number; total: number };
  sampledPages: string[];
}

export interface FetchResult {
  ok: boolean;
  status: number;
  text: string;
  headers: Headers;
  ttfbMs: number;
  error?: string;
}
