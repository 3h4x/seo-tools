import { discoverPropertyIds } from './ga4';
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

type PerformanceSource = 'rum' | 'rum-pending' | 'psi-field' | 'psi-lab' | 'none';

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
}

function normalizeDays(days?: number): number {
  const candidate = Number.isFinite(days) ? Number(days) : 7;
  return (PERF_VALID_DAYS as readonly number[]).includes(candidate) ? candidate : 7;
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
        heroSource: 'CrUX field (mobile)',
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
    heroSource: Object.keys(labMetrics).length > 0 ? 'Lighthouse lab (mobile)' : 'no data',
  };
}

export async function getPerformanceSiteData(siteId: string, requestedDays?: number): Promise<PerformanceSiteData | null> {
  const site = await getManagedSite(siteId);
  if (!site) return null;

  const days = normalizeDays(requestedDays);
  const discovered = await discoverPropertyIds();
  const propertyId = discovered.find(candidate => candidate.id === siteId)?.ga4PropertyId || site.ga4PropertyId || '';
  const url = site.domain.startsWith('http') ? site.domain : `https://${site.domain}`;

  const [rum, byPage, trend, eventCount, psiMobile, psiDesktop] = await Promise.all([
    propertyId ? cachedGetRumCoreWebVitals(propertyId, days) : Promise.resolve(null),
    propertyId ? cachedGetRumCwvByPage(propertyId, days, 20) : Promise.resolve(null),
    propertyId ? cachedGetRumCwvTrend(propertyId, Math.max(days, 30)) : Promise.resolve(null),
    propertyId ? cachedGetCwvEventCount(propertyId, days) : Promise.resolve(null),
    cachedGetPagespeed(url, 'mobile'),
    cachedGetPagespeed(url, 'desktop'),
  ]);

  const hasRum = !!rum?.hasData;
  const cwvEventCount = eventCount ?? 0;
  const propagating = !hasRum && cwvEventCount > 0;
  const psiFallback = fromPsi(psiMobile);

  return {
    site: {
      id: site.id,
      name: site.name,
      domain: site.domain,
    },
    days,
    propertyId,
    url,
    source: hasRum ? 'rum' : propagating ? 'rum-pending' : psiFallback.source,
    heroSource: hasRum ? 'RUM (GA4)' : psiFallback.heroSource,
    hasRum,
    propagating,
    eventCount: cwvEventCount,
    needsKey: !!(psiMobile?.needsKey || psiDesktop?.needsKey),
    overall: hasRum ? cloneRumMetrics(rum!.overall) : psiFallback.metrics,
    byDevice: hasRum && rum ? {
      mobile: cloneRumMetrics(rum.byDevice.mobile),
      desktop: cloneRumMetrics(rum.byDevice.desktop),
      tablet: cloneRumMetrics(rum.byDevice.tablet),
    } : null,
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
  };
}

export type {
  PerformanceByPageRow,
  PerformanceMetric,
  PerformanceMetricMap,
  PerformanceSiteData,
  PerformanceSource,
  PerformanceTrendRow,
};
