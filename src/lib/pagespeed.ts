import { getConfig, withCache } from './db';
import { CWV_METRIC_ORDER, type CwvMetricName, type CwvRating, rateCwv } from './constants';

export type PsiStrategy = 'mobile' | 'desktop';

export interface PsiFieldMetric {
  value: number;
  rating: CwvRating;
}

export interface PsiData {
  url: string;
  strategy: PsiStrategy;
  performanceScore: number | null;
  field: Partial<Record<CwvMetricName, PsiFieldMetric>> | null;
  lab: Partial<Record<CwvMetricName, number>>;
  fetchedAt: number;
  needsKey?: boolean;
}

export function getPagespeedKey(): string | null {
  const dbVal = getConfig('pagespeed_api_key');
  if (dbVal && dbVal.trim()) return dbVal.trim();
  const envVal = process.env.PAGESPEED_API_KEY;
  return envVal && envVal.trim() ? envVal.trim() : null;
}

const PSI_CACHE_TTL = 6 * 60 * 60 * 1000;

const FIELD_METRIC_MAP: Record<CwvMetricName, string> = {
  LCP:  'LARGEST_CONTENTFUL_PAINT_MS',
  INP:  'INTERACTION_TO_NEXT_PAINT',
  CLS:  'CUMULATIVE_LAYOUT_SHIFT_SCORE',
  FCP:  'FIRST_CONTENTFUL_PAINT_MS',
  TTFB: 'EXPERIMENTAL_TIME_TO_FIRST_BYTE',
};

const LAB_AUDIT_MAP: Partial<Record<CwvMetricName, string>> = {
  LCP:  'largest-contentful-paint',
  CLS:  'cumulative-layout-shift',
  FCP:  'first-contentful-paint',
  TTFB: 'server-response-time',
};

interface PsiResponse {
  loadingExperience?: {
    metrics?: Record<string, { percentile?: number; category?: string }>;
  };
  lighthouseResult?: {
    categories?: { performance?: { score?: number } };
    audits?: Record<string, { numericValue?: number }>;
  };
}

function parseFieldMetric(name: CwvMetricName, raw: { percentile?: number } | undefined): PsiFieldMetric | null {
  if (!raw || typeof raw.percentile !== 'number') return null;
  // CLS field percentile is reported in hundredths (e.g., 12 → 0.12).
  const value = name === 'CLS' ? raw.percentile / 100 : raw.percentile;
  return { value, rating: rateCwv(name, value) };
}

async function getPagespeed(url: string, strategy: PsiStrategy): Promise<PsiData | null> {
  const apiKey = getPagespeedKey();
  const params = new URLSearchParams({ url, strategy, category: 'performance' });
  if (apiKey) params.set('key', apiKey);

  const endpoint = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?${params.toString()}`;

  try {
    const res = await fetch(endpoint);
    if (res.status === 429) {
      return {
        url,
        strategy,
        performanceScore: null,
        field: null,
        lab: {},
        fetchedAt: Date.now(),
        needsKey: !apiKey,
      };
    }
    if (!res.ok) {
      console.error(`PSI ${strategy} ${url} failed: ${res.status}`);
      return null;
    }
    const json = (await res.json()) as PsiResponse;

    const fieldMetrics = json.loadingExperience?.metrics ?? {};
    let hasField = false;
    const field: Partial<Record<CwvMetricName, PsiFieldMetric>> = {};
    for (const name of CWV_METRIC_ORDER) {
      const parsed = parseFieldMetric(name, fieldMetrics[FIELD_METRIC_MAP[name]]);
      if (parsed) {
        field[name] = parsed;
        hasField = true;
      }
    }

    const audits = json.lighthouseResult?.audits ?? {};
    const lab: Partial<Record<CwvMetricName, number>> = {};
    for (const name of CWV_METRIC_ORDER) {
      const auditKey = LAB_AUDIT_MAP[name];
      if (!auditKey) continue;
      const audit = audits[auditKey];
      if (audit && typeof audit.numericValue === 'number') {
        lab[name] = audit.numericValue;
      }
    }

    const score = json.lighthouseResult?.categories?.performance?.score;
    return {
      url,
      strategy,
      performanceScore: typeof score === 'number' ? Math.round(score * 100) : null,
      field: hasField ? field : null,
      lab,
      fetchedAt: Date.now(),
    };
  } catch (error) {
    console.error(`PSI ${strategy} ${url} error:`, error);
    return null;
  }
}

function cacheKeyFor(url: string): string {
  // api_cache PK is (cache_key, site_id) — use url as the second column.
  return url;
}

export function cachedGetPagespeed(url: string, strategy: PsiStrategy): Promise<PsiData | null> {
  return withCache<PsiData>(`psi-${strategy}`, cacheKeyFor(url), () => getPagespeed(url, strategy), PSI_CACHE_TTL);
}
