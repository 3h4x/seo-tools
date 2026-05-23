import { discoverPropertyIds } from './ga4';
import { cachedGetCwvEventCount, cachedGetRumCoreWebVitals, type CwvMetricMap } from './performance';
import { cachedGetPagespeed, type PsiData } from './pagespeed';
import {
  CWV_METRIC_ORDER,
  rateCwv,
  type CwvMetricName,
  type CwvRating,
} from './constants';
import { loadOrFallback } from './page-helpers';

type PerformanceOverviewSite = Awaited<ReturnType<typeof discoverPropertyIds>>[number];

export interface PerformanceOverviewRow {
  id: string;
  name: string;
  domain: string;
  source: 'rum' | 'rum-pending' | 'psi-field' | 'psi-lab' | 'none';
  metrics: Partial<Record<CwvMetricName, { value: number; rating: CwvRating }>>;
  perfScore: number | null;
  needsKey: boolean;
  cwvEventCount: number;
}

function emptyRow(
  site: PerformanceOverviewSite,
  cwvEventCount: number = 0,
  needsKey: boolean = false,
): PerformanceOverviewRow {
  return {
    id: site.id,
    name: site.name,
    domain: site.domain,
    source: cwvEventCount > 0 ? 'rum-pending' : 'none',
    metrics: {},
    perfScore: null,
    needsKey,
    cwvEventCount,
  };
}

function fromRum(map: CwvMetricMap): PerformanceOverviewRow['metrics'] {
  const out: PerformanceOverviewRow['metrics'] = {};
  for (const name of CWV_METRIC_ORDER) {
    const metric = map[name];
    if (metric) {
      out[name] = { value: metric.value, rating: metric.rating };
    }
  }
  return out;
}

function fromPsi(psi: PsiData): {
  metrics: PerformanceOverviewRow['metrics'];
  source: 'psi-field' | 'psi-lab' | 'none';
} {
  const out: PerformanceOverviewRow['metrics'] = {};
  if (psi.field) {
    for (const name of CWV_METRIC_ORDER) {
      const metric = psi.field[name];
      if (metric) {
        out[name] = { value: metric.value, rating: metric.rating };
      }
    }
    if (Object.keys(out).length > 0) {
      return { metrics: out, source: 'psi-field' };
    }
  }

  for (const name of CWV_METRIC_ORDER) {
    const value = psi.lab[name];
    if (typeof value === 'number') {
      out[name] = { value, rating: rateCwv(name, value) };
    }
  }

  return {
    metrics: out,
    source: Object.keys(out).length > 0 ? 'psi-lab' : 'none',
  };
}

function emptyPsiFallback(psi: PsiData | null = null): {
  psi: PsiData | null;
  metrics: PerformanceOverviewRow['metrics'];
  source: 'psi-field' | 'psi-lab' | 'none';
} {
  if (!psi) return { psi: null, metrics: {}, source: 'none' };
  return { psi, ...fromPsi(psi) };
}

function firstPsiWithMetrics(...results: Array<PsiData | null>): ReturnType<typeof emptyPsiFallback> {
  let firstFallback: ReturnType<typeof emptyPsiFallback> | null = null;

  for (const result of results) {
    const fallback = emptyPsiFallback(result);
    firstFallback ??= fallback;
    if (fallback.source !== 'none') {
      return fallback;
    }
  }

  return firstFallback ?? emptyPsiFallback();
}

async function getPerformanceOverviewRow(
  site: PerformanceOverviewSite,
  days: number,
): Promise<PerformanceOverviewRow> {
  const propertyId = site.ga4PropertyId || '';
  const url = site.domain.startsWith('http') ? site.domain : `https://${site.domain}`;

  const [rum, eventCount] = await Promise.all([
    propertyId
      ? cachedGetRumCoreWebVitals(propertyId, days).catch((error) => {
          console.error(`[PerformanceOverview] RUM ${site.id}:`, error);
          return null;
        })
      : Promise.resolve(null),
    propertyId
      ? cachedGetCwvEventCount(propertyId, days).catch((error) => {
          console.error(`[PerformanceOverview] CWV event count ${site.id}:`, error);
          return null;
        })
      : Promise.resolve(null),
  ]);

  const cwvEventCount = eventCount ?? 0;

  if (rum?.hasData) {
    return {
      id: site.id,
      name: site.name,
      domain: site.domain,
      source: 'rum',
      metrics: fromRum(rum.overall),
      perfScore: null,
      needsKey: false,
      cwvEventCount,
    };
  }

  const psiMobile = await cachedGetPagespeed(url, 'mobile').catch((error) => {
    console.error(`[PerformanceOverview] PSI ${site.id}:`, error);
    return null;
  });
  let psiDesktop: PsiData | null = null;
  let psiFallback = firstPsiWithMetrics(psiMobile);

  if (psiFallback.source === 'none') {
    psiDesktop = await cachedGetPagespeed(url, 'desktop').catch((error) => {
      console.error(`[PerformanceOverview] PSI desktop ${site.id}:`, error);
      return null;
    });
    psiFallback = firstPsiWithMetrics(psiMobile, psiDesktop);
  }

  if (psiFallback.psi) {
    return {
      id: site.id,
      name: site.name,
      domain: site.domain,
      source: cwvEventCount > 0 ? 'rum-pending' : psiFallback.source,
      metrics: psiFallback.metrics,
      perfScore: psiFallback.psi.performanceScore,
      needsKey: !!(psiMobile?.needsKey || psiDesktop?.needsKey),
      cwvEventCount,
    };
  }

  return emptyRow(site, cwvEventCount, !!(psiMobile?.needsKey || psiDesktop?.needsKey));
}

export async function getPerformanceOverviewRows(days: number): Promise<PerformanceOverviewRow[]> {
  const sites = await loadOrFallback<PerformanceOverviewSite[]>(
    'PerformanceOverview discoverPropertyIds',
    discoverPropertyIds(),
    [],
  );
  return Promise.all(sites.map((site) => getPerformanceOverviewRow(site, days)));
}
