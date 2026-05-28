import { discoverPropertyIdsWithStatus } from './ga4';
import { cachedGetPagespeed, type PsiData } from './pagespeed';
import {
  cachedGetCwvEventCount,
  cachedGetRumCoreWebVitals,
  cachedGetRumCwvByPage,
  cachedGetRumCwvTrend,
  type CwvMetricMap,
} from './performance';
import { getManagedSite } from './sites';
import { CWV_METRIC_ORDER, PERF_VALID_DAYS, rateCwv, type CwvMetricName } from './constants';
import { normalizeAllowedNumber } from './days';

export type PerformanceSource = 'rum' | 'rum-pending' | 'psi-field' | 'psi-lab' | 'none';

interface PerformanceMetric {
  value: number;
  rating: ReturnType<typeof rateCwv>;
  sampleCount: number;
}

type PerformanceMetricMap = Partial<Record<CwvMetricName, PerformanceMetric>>;

interface PerformanceByPageRow {
  path: string;
  totalSamples: number;
  metrics: PerformanceMetricMap;
}

interface PerformanceTrendRow {
  date: string;
  metrics: PerformanceMetricMap;
}

interface PerformanceSiteData {
  site: {
    id: string;
    name: string;
    domain: string;
  };
  days: number;
  propertyId: string;
  url: string;
  source: PerformanceSource;
  heroSource: string;
  hasRum: boolean;
  propagating: boolean;
  eventCount: number;
  needsKey: boolean;
  overall: PerformanceMetricMap;
  byDevice: {
    mobile: PerformanceMetricMap;
    desktop: PerformanceMetricMap;
    tablet: PerformanceMetricMap;
  } | null;
  slowestPages: PerformanceByPageRow[];
  trend: PerformanceTrendRow[];
  psi: {
    mobile: PsiData | null;
    desktop: PsiData | null;
  };
  failures: string[];
}

function normalizeDays(days?: number): number {
  const candidate = Number.isFinite(days) ? Number(days) : 7;
  return normalizeAllowedNumber(candidate, PERF_VALID_DAYS, 7);
}

function cloneRumMetrics(map: CwvMetricMap): PerformanceMetricMap {
  const out: PerformanceMetricMap = {};
  for (const name of CWV_METRIC_ORDER) {
    const metric = map[name];
    if (!metric) continue;
    out[name] = {
      value: metric.value,
      rating: metric.rating,
      sampleCount: metric.sampleCount,
    };
  }
  return out;
}

function fromPsi(psi: PsiData | null): { metrics: PerformanceMetricMap; source: PerformanceSource; heroSource: string } {
  if (!psi) {
    return { metrics: {}, source: 'none', heroSource: 'no data' };
  }

  const fieldMetrics: PerformanceMetricMap = {};
  if (psi.field) {
    for (const name of CWV_METRIC_ORDER) {
      const metric = psi.field[name];
      if (!metric) continue;
      fieldMetrics[name] = {
        value: metric.value,
        rating: metric.rating,
        sampleCount: 0,
      };
    }
    if (Object.keys(fieldMetrics).length > 0) {
      return {
        metrics: fieldMetrics,
        source: 'psi-field',
        heroSource: `CrUX field (${psi.strategy})`,
      };
    }
  }

  const labMetrics: PerformanceMetricMap = {};
  for (const name of CWV_METRIC_ORDER) {
    const value = psi.lab[name];
    if (typeof value !== 'number') continue;
    labMetrics[name] = {
      value,
      rating: rateCwv(name, value),
      sampleCount: 0,
    };
  }

  return {
    metrics: labMetrics,
    source: Object.keys(labMetrics).length > 0 ? 'psi-lab' : 'none',
    heroSource: Object.keys(labMetrics).length > 0 ? `Lighthouse lab (${psi.strategy})` : 'no data',
  };
}

function firstPsiWithMetrics(...results: Array<PsiData | null>): ReturnType<typeof fromPsi> {
  let firstFallback: ReturnType<typeof fromPsi> | null = null;

  for (const result of results) {
    const fallback = fromPsi(result);
    firstFallback ??= fallback;
    if (fallback.source !== 'none') {
      return fallback;
    }
  }

  return firstFallback ?? { metrics: {}, source: 'none', heroSource: 'no data' };
}

async function providerOrNull<T>(
  label: string,
  promise: Promise<T | null>,
  failures?: string[],
  failureLabel: string = label,
): Promise<T | null> {
  try {
    return await promise;
  } catch (error) {
    console.error(`[PerformanceSite] ${label}:`, error);
    failures?.push(failureLabel);
    return null;
  }
}

export async function getPerformanceSiteData(siteId: string, requestedDays?: number): Promise<PerformanceSiteData | null> {
  const site = await getManagedSite(siteId);
  if (!site) return null;

  const days = normalizeDays(requestedDays);
  const failures: string[] = [];
  const discovered = await providerOrNull(
    `GA4 discovery ${site.id}`,
    discoverPropertyIdsWithStatus(),
    failures,
    'GA4 property discovery',
  );
  if (discovered?.failed) failures.push('GA4 property discovery');
  const discoveredSites = discovered?.sites ?? [];
  const propertyId = discoveredSites.find(candidate => candidate.id === siteId)?.ga4PropertyId || site.ga4PropertyId || '';
  const url = site.domain.startsWith('http') ? site.domain : `https://${site.domain}`;

  const [rum, eventCount] = await Promise.all([
    propertyId
      ? providerOrNull(`RUM ${site.id}`, cachedGetRumCoreWebVitals(propertyId, days), failures, 'RUM data')
      : Promise.resolve(null),
    propertyId
      ? providerOrNull(`CWV event count ${site.id}`, cachedGetCwvEventCount(propertyId, days), failures, 'CWV event count')
      : Promise.resolve(null),
  ]);

  const hasRum = !!rum?.hasData;
  const cwvEventCount = eventCount ?? 0;
  const propagating = !hasRum && cwvEventCount > 0;

  if (hasRum) {
    const [byPage, trend, psiMobile, psiDesktop] = await Promise.all([
      propertyId
        ? providerOrNull(`RUM pages ${site.id}`, cachedGetRumCwvByPage(propertyId, days, 20), failures, 'RUM slowest pages')
        : Promise.resolve(null),
      propertyId
        ? providerOrNull(`RUM trend ${site.id}`, cachedGetRumCwvTrend(propertyId, Math.max(days, 30)), failures, 'RUM trend')
        : Promise.resolve(null),
      providerOrNull(`PSI mobile ${site.id}`, cachedGetPagespeed(url, 'mobile'), failures, 'PageSpeed Insights mobile'),
      providerOrNull(`PSI desktop ${site.id}`, cachedGetPagespeed(url, 'desktop'), failures, 'PageSpeed Insights desktop'),
    ]);

    return {
      site: {
        id: site.id,
        name: site.name,
        domain: site.domain,
      },
      days,
      propertyId,
      url,
      source: 'rum',
      heroSource: 'RUM (GA4)',
      hasRum,
      propagating,
      eventCount: cwvEventCount,
      needsKey: !!(psiMobile?.needsKey || psiDesktop?.needsKey),
      overall: cloneRumMetrics(rum!.overall),
      byDevice: {
        mobile: cloneRumMetrics(rum!.byDevice.mobile),
        desktop: cloneRumMetrics(rum!.byDevice.desktop),
        tablet: cloneRumMetrics(rum!.byDevice.tablet),
      },
      slowestPages: (byPage ?? []).map((row) => ({
        path: row.path,
        totalSamples: row.totalSamples,
        metrics: cloneRumMetrics(row.metrics),
      })),
      trend: (trend ?? []).map((row) => ({
        date: row.date.length === 8 ? `${row.date.slice(0, 4)}-${row.date.slice(4, 6)}-${row.date.slice(6, 8)}` : row.date,
        metrics: cloneRumMetrics(row.metrics),
      })),
      psi: {
        mobile: psiMobile,
        desktop: psiDesktop,
      },
      failures,
    };
  }

  const [psiMobile, psiDesktop] = await Promise.all([
    providerOrNull(`PSI mobile ${site.id}`, cachedGetPagespeed(url, 'mobile'), failures, 'PageSpeed Insights mobile'),
    providerOrNull(`PSI desktop ${site.id}`, cachedGetPagespeed(url, 'desktop'), failures, 'PageSpeed Insights desktop'),
  ]);
  const psiFallback = firstPsiWithMetrics(psiMobile, psiDesktop);

  return {
    site: {
      id: site.id,
      name: site.name,
      domain: site.domain,
    },
    days,
    propertyId,
    url,
    source: propagating ? 'rum-pending' : psiFallback.source,
    heroSource: psiFallback.heroSource,
    hasRum,
    propagating,
    eventCount: cwvEventCount,
    needsKey: !!(psiMobile?.needsKey || psiDesktop?.needsKey),
    overall: psiFallback.metrics,
    byDevice: null,
    slowestPages: [],
    trend: [],
    psi: {
      mobile: psiMobile,
      desktop: psiDesktop,
    },
    failures,
  };
}

export interface CwvAuditSummary {
  metrics: PerformanceMetricMap;
  source: PerformanceSource;
}

export async function getCwvAuditSummary(siteId: string): Promise<CwvAuditSummary | null> {
  const site = await getManagedSite(siteId);
  if (!site) return null;

  const url = site.domain.startsWith('http') ? site.domain : `https://${site.domain}`;
  const discovered = await providerOrNull(`audit GA4 discovery ${site.id}`, discoverPropertyIdsWithStatus());
  const discoveredSites = discovered?.sites ?? [];
  const propertyId = discoveredSites.find(c => c.id === siteId)?.ga4PropertyId || site.ga4PropertyId || '';

  const [rum, eventCount, psiMobile] = await Promise.all([
    propertyId
      ? providerOrNull(`audit RUM ${site.id}`, cachedGetRumCoreWebVitals(propertyId, 7))
      : Promise.resolve(null),
    propertyId
      ? providerOrNull(`audit CWV event count ${site.id}`, cachedGetCwvEventCount(propertyId, 7))
      : Promise.resolve(null),
    providerOrNull(`audit PSI mobile ${site.id}`, cachedGetPagespeed(url, 'mobile')),
  ]);

  if (rum?.hasData) {
    return { metrics: cloneRumMetrics(rum.overall), source: 'rum' };
  }

  const psiDesktop = psiMobile && fromPsi(psiMobile).source !== 'none'
    ? null
    : await providerOrNull(`audit PSI desktop ${site.id}`, cachedGetPagespeed(url, 'desktop'));
  const fallback = firstPsiWithMetrics(psiMobile, psiDesktop);
  return { metrics: fallback.metrics, source: (eventCount ?? 0) > 0 ? 'rum-pending' : fallback.source };
}

export type {
  PerformanceByPageRow,
  PerformanceMetric,
  PerformanceMetricMap,
  PerformanceSiteData,
  PerformanceTrendRow,
};
