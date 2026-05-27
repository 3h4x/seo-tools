import { discoverPropertyIds } from './ga4';
import { cachedGetCwvEventCount, cachedGetRumCoreWebVitals, type CwvMetricMap } from './performance';
import { cachedGetPagespeed, type PsiData } from './pagespeed';
import {
  CWV_METRIC_ORDER,
  rateCwv,
  type CwvMetricName,
  type CwvRating,
} from './constants';
import { loadOrFlag } from './page-helpers';

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

export interface PerformanceOverviewResult {
  rows: PerformanceOverviewRow[];
  failures: string[];
}

interface RowWithFailures {
  row: PerformanceOverviewRow;
  rumDataFailed: boolean;
  psiFailed: boolean;
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
): Promise<RowWithFailures> {
  const propertyId = site.ga4PropertyId || '';
  const url = site.domain.startsWith('http') ? site.domain : `https://${site.domain}`;

  let rumDataFailed = false;
  let psiRequestFailed = false;

  const [rum, eventCount] = await Promise.all([
    propertyId
      ? cachedGetRumCoreWebVitals(propertyId, days).catch((error) => {
          console.error(`[PerformanceOverview] RUM ${site.id}:`, error);
          rumDataFailed = true;
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
      row: {
        id: site.id,
        name: site.name,
        domain: site.domain,
        source: 'rum',
        metrics: fromRum(rum.overall),
        perfScore: null,
        needsKey: false,
        cwvEventCount,
      },
      rumDataFailed,
      psiFailed: false,
    };
  }

  const psiMobile = await cachedGetPagespeed(url, 'mobile').catch((error) => {
    console.error(`[PerformanceOverview] PSI ${site.id}:`, error);
    psiRequestFailed = true;
    return null;
  });
  let psiDesktop: PsiData | null = null;
  let psiFallback = firstPsiWithMetrics(psiMobile);

  if (psiFallback.source === 'none') {
    psiDesktop = await cachedGetPagespeed(url, 'desktop').catch((error) => {
      console.error(`[PerformanceOverview] PSI desktop ${site.id}:`, error);
      psiRequestFailed = true;
      return null;
    });
    psiFallback = firstPsiWithMetrics(psiMobile, psiDesktop);
  }

  const psiFailed = psiRequestFailed && psiFallback.source === 'none';

  if (psiFallback.psi) {
    return {
      row: {
        id: site.id,
        name: site.name,
        domain: site.domain,
        source: cwvEventCount > 0 ? 'rum-pending' : psiFallback.source,
        metrics: psiFallback.metrics,
        perfScore: psiFallback.psi.performanceScore,
        needsKey: !!(psiMobile?.needsKey || psiDesktop?.needsKey),
        cwvEventCount,
      },
      rumDataFailed,
      psiFailed,
    };
  }

  return {
    row: emptyRow(site, cwvEventCount, !!(psiMobile?.needsKey || psiDesktop?.needsKey)),
    rumDataFailed,
    psiFailed,
  };
}

export async function getPerformanceOverviewRows(days: number): Promise<PerformanceOverviewResult> {
  const discovered = await loadOrFlag<PerformanceOverviewSite[]>(
    'PerformanceOverview discoverPropertyIds',
    discoverPropertyIds(),
    [],
  );
  const sites = discovered.value;
  const results = await Promise.all(sites.map((site) => getPerformanceOverviewRow(site, days)));

  const failures: string[] = [];
  if (discovered.failed) failures.push('site discovery');
  const rumFailedCount = results.filter((r) => r.rumDataFailed).length;
  const psiFailedCount = results.filter((r) => r.psiFailed).length;
  if (rumFailedCount > 0) {
    failures.push(`RUM data (${rumFailedCount} site${rumFailedCount === 1 ? '' : 's'})`);
  }
  if (psiFailedCount > 0) {
    failures.push(`PageSpeed Insights (${psiFailedCount} site${psiFailedCount === 1 ? '' : 's'})`);
  }

  return { rows: results.map((r) => r.row), failures };
}
