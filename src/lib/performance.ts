import { BetaAnalyticsDataClient } from '@google-analytics/data';
import { getAuth } from './google-auth';
import { withCache } from './db';
import { CWV_METRIC_ORDER, type CwvMetricName, type CwvRating, rateCwv } from './constants';
import { normalizeGa4PropertyId } from './ga4-property';

function getDataClient() {
  return new BetaAnalyticsDataClient({ auth: getAuth() });
}

const EVENT_NAME = 'core_web_vitals';
// User-configured GA4 custom definitions (see CWV setup guide).
const DIM_METRIC_NAME = 'customEvent:metric_name';
const MET_METRIC_VALUE = 'customEvent:metric_value';
const CWV_METRIC_NAMES = new Set<string>(CWV_METRIC_ORDER);

export interface CwvMetric {
  value: number;
  rating: CwvRating;
  sampleCount: number;
}

export type CwvMetricMap = Partial<Record<CwvMetricName, CwvMetric>>;

export interface RumCwvData {
  hasData: boolean;
  overall: CwvMetricMap;
  byDevice: { mobile: CwvMetricMap; desktop: CwvMetricMap; tablet: CwvMetricMap };
}

export interface RumCwvByPage {
  path: string;
  metrics: CwvMetricMap;
  totalSamples: number;
}

export interface RumCwvTrendPoint {
  date: string;
  metrics: CwvMetricMap;
}

const eventFilter = {
  filter: {
    fieldName: 'eventName',
    stringFilter: { matchType: 'EXACT' as const, value: EVENT_NAME },
  },
};

function isCwvName(s: string | null | undefined): s is CwvMetricName {
  return !!s && CWV_METRIC_NAMES.has(s);
}

interface Aggregator {
  sum: number;
  count: number;
}

function emptyAggMap(): Record<CwvMetricName, Aggregator> {
  return {
    LCP:  { sum: 0, count: 0 },
    INP:  { sum: 0, count: 0 },
    CLS:  { sum: 0, count: 0 },
    FCP:  { sum: 0, count: 0 },
    TTFB: { sum: 0, count: 0 },
  };
}

function finalize(agg: Record<CwvMetricName, Aggregator>): CwvMetricMap {
  const out: CwvMetricMap = {};
  for (const name of CWV_METRIC_ORDER) {
    const a = agg[name];
    if (a.count === 0) continue;
    const value = a.sum / a.count;
    out[name] = { value, rating: rateCwv(name, value), sampleCount: a.count };
  }
  return out;
}

function deviceKey(raw: string | undefined | null): 'mobile' | 'desktop' | 'tablet' | null {
  const v = (raw || '').toLowerCase();
  if (v === 'mobile' || v === 'desktop' || v === 'tablet') return v;
  return null;
}

// GA4 throws INVALID_ARGUMENT when a property doesn't have the custom dimension/metric
// the query references. Treat that as "not configured" rather than a hard error so
// auto-detect can fall through to PSI without log noise.
function isNotConfiguredError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  // INVALID_ARGUMENT from GA4 typically means the requested customEvent
  // dimension/metric isn't defined on the property — i.e. CWV not wired yet.
  return /INVALID_ARGUMENT/i.test(msg);
}

function emptyRumData(): RumCwvData {
  return {
    hasData: false,
    overall: {},
    byDevice: { mobile: {}, desktop: {}, tablet: {} },
  };
}

async function getRumCoreWebVitals(propertyId: string, days: number): Promise<RumCwvData | null> {
  const normalizedPropertyId = normalizeGa4PropertyId(propertyId);
  if (!normalizedPropertyId) return null;

  try {
    const client = getDataClient();
    const [res] = await client.runReport({
      property: normalizedPropertyId,
      dateRanges: [{ startDate: `${days}daysAgo`, endDate: 'yesterday' }],
      dimensions: [{ name: DIM_METRIC_NAME }, { name: 'deviceCategory' }],
      metrics: [{ name: 'eventCount' }, { name: MET_METRIC_VALUE }],
      dimensionFilter: eventFilter,
      limit: 100,
    });

    const rows = res.rows || [];
    const overall = emptyAggMap();
    const byDevice = {
      mobile: emptyAggMap(),
      desktop: emptyAggMap(),
      tablet: emptyAggMap(),
    };

    let total = 0;
    for (const row of rows) {
      const name = row.dimensionValues?.[0]?.value;
      const device = deviceKey(row.dimensionValues?.[1]?.value);
      const count = parseInt(row.metricValues?.[0]?.value || '0');
      const sumVal = parseFloat(row.metricValues?.[1]?.value || '0');
      if (!isCwvName(name) || count === 0) continue;
      total += count;
      overall[name].sum += sumVal;
      overall[name].count += count;
      if (device) {
        byDevice[device][name].sum += sumVal;
        byDevice[device][name].count += count;
      }
    }

    return {
      hasData: total > 0,
      overall: finalize(overall),
      byDevice: {
        mobile: finalize(byDevice.mobile),
        desktop: finalize(byDevice.desktop),
        tablet: finalize(byDevice.tablet),
      },
    };
  } catch (error) {
    if (isNotConfiguredError(error)) return emptyRumData();
    console.error(`Error fetching RUM CWV for property ${normalizedPropertyId}:`, error);
    return null;
  }
}

async function getRumCwvByPage(propertyId: string, days: number, limit: number = 20): Promise<RumCwvByPage[] | null> {
  const normalizedPropertyId = normalizeGa4PropertyId(propertyId);
  if (!normalizedPropertyId) return null;
  try {
    const client = getDataClient();
    const [res] = await client.runReport({
      property: normalizedPropertyId,
      dateRanges: [{ startDate: `${days}daysAgo`, endDate: 'yesterday' }],
      dimensions: [{ name: 'pagePath' }, { name: DIM_METRIC_NAME }],
      metrics: [{ name: 'eventCount' }, { name: MET_METRIC_VALUE }],
      dimensionFilter: eventFilter,
      limit: limit * CWV_METRIC_ORDER.length,
    });

    const byPath = new Map<string, Record<CwvMetricName, Aggregator>>();
    for (const row of res.rows || []) {
      const path = row.dimensionValues?.[0]?.value || '/';
      const name = row.dimensionValues?.[1]?.value;
      const count = parseInt(row.metricValues?.[0]?.value || '0');
      const sumVal = parseFloat(row.metricValues?.[1]?.value || '0');
      if (!isCwvName(name) || count === 0) continue;
      let agg = byPath.get(path);
      if (!agg) { agg = emptyAggMap(); byPath.set(path, agg); }
      agg[name].sum += sumVal;
      agg[name].count += count;
    }

    return [...byPath.entries()]
      .map(([path, agg]) => {
        const totalSamples = Object.values(agg).reduce((s, a) => s + a.count, 0);
        return { path, metrics: finalize(agg), totalSamples };
      })
      .sort((a, b) => b.totalSamples - a.totalSamples)
      .slice(0, limit);
  } catch (error) {
    if (isNotConfiguredError(error)) return [];
    console.error(`Error fetching RUM CWV pages for property ${normalizedPropertyId}:`, error);
    return null;
  }
}

async function getRumCwvTrend(propertyId: string, days: number): Promise<RumCwvTrendPoint[] | null> {
  const normalizedPropertyId = normalizeGa4PropertyId(propertyId);
  if (!normalizedPropertyId) return null;
  try {
    const client = getDataClient();
    const [res] = await client.runReport({
      property: normalizedPropertyId,
      dateRanges: [{ startDate: `${days}daysAgo`, endDate: 'yesterday' }],
      dimensions: [{ name: 'date' }, { name: DIM_METRIC_NAME }],
      metrics: [{ name: 'eventCount' }, { name: MET_METRIC_VALUE }],
      dimensionFilter: eventFilter,
      orderBys: [{ dimension: { dimensionName: 'date' } }],
      limit: 1000,
    });

    const byDate = new Map<string, Record<CwvMetricName, Aggregator>>();
    for (const row of res.rows || []) {
      const date = row.dimensionValues?.[0]?.value;
      const name = row.dimensionValues?.[1]?.value;
      const count = parseInt(row.metricValues?.[0]?.value || '0');
      const sumVal = parseFloat(row.metricValues?.[1]?.value || '0');
      if (!date || !isCwvName(name) || count === 0) continue;
      let agg = byDate.get(date);
      if (!agg) { agg = emptyAggMap(); byDate.set(date, agg); }
      agg[name].sum += sumVal;
      agg[name].count += count;
    }

    return [...byDate.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, agg]) => ({ date, metrics: finalize(agg) }));
  } catch (error) {
    if (isNotConfiguredError(error)) return [];
    console.error(`Error fetching RUM CWV trend for property ${normalizedPropertyId}:`, error);
    return null;
  }
}

export function cachedGetRumCoreWebVitals(propertyId: string, days: number = 7): Promise<RumCwvData | null> {
  const normalizedPropertyId = normalizeGa4PropertyId(propertyId);
  if (!normalizedPropertyId) return Promise.resolve(null);
  return withCache<RumCwvData>(`rum-cwv-${days}`, normalizedPropertyId, () => getRumCoreWebVitals(normalizedPropertyId, days));
}

export function cachedGetRumCwvByPage(propertyId: string, days: number = 7, limit: number = 20): Promise<RumCwvByPage[] | null> {
  const normalizedPropertyId = normalizeGa4PropertyId(propertyId);
  if (!normalizedPropertyId) return Promise.resolve(null);
  return withCache<RumCwvByPage[]>(`rum-cwv-pages-${days}-${limit}`, normalizedPropertyId, () => getRumCwvByPage(normalizedPropertyId, days, limit));
}

export function cachedGetRumCwvTrend(propertyId: string, days: number = 30): Promise<RumCwvTrendPoint[] | null> {
  const normalizedPropertyId = normalizeGa4PropertyId(propertyId);
  if (!normalizedPropertyId) return Promise.resolve(null);
  return withCache<RumCwvTrendPoint[]>(`rum-cwv-trend-${days}`, normalizedPropertyId, () => getRumCwvTrend(normalizedPropertyId, days));
}

// Returns the count of core_web_vitals events in the last `days` days.
// Used to distinguish "GTM not wired" (count = 0) from "wired but custom
// dimensions still propagating" (count > 0 but full RUM query errors / empty).
async function getCwvEventCount(propertyId: string, days: number): Promise<number | null> {
  const normalizedPropertyId = normalizeGa4PropertyId(propertyId);
  if (!normalizedPropertyId) return null;
  try {
    const client = getDataClient();
    const [res] = await client.runReport({
      property: normalizedPropertyId,
      dateRanges: [{ startDate: `${days}daysAgo`, endDate: 'today' }],
      dimensions: [{ name: 'eventName' }],
      metrics: [{ name: 'eventCount' }],
      dimensionFilter: eventFilter,
      limit: 1,
    });
    const row = (res.rows || [])[0];
    return parseInt(row?.metricValues?.[0]?.value || '0');
  } catch (error) {
    console.error(`Error fetching CWV event count for property ${normalizedPropertyId}:`, error);
    return null;
  }
}

export function cachedGetCwvEventCount(propertyId: string, days: number = 7): Promise<number | null> {
  const normalizedPropertyId = normalizeGa4PropertyId(propertyId);
  if (!normalizedPropertyId) return Promise.resolve(null);
  return withCache<number>(`rum-cwv-events-${days}`, normalizedPropertyId, () => getCwvEventCount(normalizedPropertyId, days));
}
