import { searchconsole_v1 } from '@googleapis/searchconsole';
import { BetaAnalyticsDataClient } from '@google-analytics/data';
import { getAuth } from './google-auth';
import { getManagedSites, getSCUrl, type Site } from './sites';

export type DiagnosticStatus = 'ok' | 'missing-config' | 'permission-error' | 'not-found' | 'provider-error';

export interface ProviderDiagnostic {
  status: DiagnosticStatus;
  message: string;
}

export interface SiteDiagnosticResult {
  siteId: string;
  searchConsole: ProviderDiagnostic;
  ga4: ProviderDiagnostic;
}

function getSearchConsoleClient() {
  return new searchconsole_v1.Searchconsole({ auth: getAuth() });
}

function getGa4Client() {
  return new BetaAnalyticsDataClient({ auth: getAuth() });
}

function normalizeErrorCode(value: unknown): number | string | null {
  if (typeof value === 'number') {
    return value;
  }

  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const numeric = Number(trimmed);
  if (Number.isInteger(numeric)) {
    return numeric;
  }

  return trimmed.toUpperCase();
}

function classifyProviderError(error: unknown): ProviderDiagnostic {
  const details = error as { code?: unknown; status?: unknown; message?: unknown };
  const code = normalizeErrorCode(details.code) ?? normalizeErrorCode(details.status);
  const message = typeof details.message === 'string'
    ? details.message
    : error instanceof Error
      ? error.message
      : 'Unknown provider error';
  const normalizedMessage = message.toLowerCase();

  if (
    code === 403
    || code === 'PERMISSION_DENIED'
    || code === 'FORBIDDEN'
    || normalizedMessage.includes('forbidden')
    || normalizedMessage.includes('permission')
    || normalizedMessage.includes('not authorized')
    || normalizedMessage.includes('insufficient permission')
    || normalizedMessage.includes('access denied')
  ) {
    return { status: 'permission-error', message: 'Permission error' };
  }

  if (
    code === 404
    || code === 'NOT_FOUND'
    || normalizedMessage.includes('not found')
    || normalizedMessage.includes('requested entity was not found')
  ) {
    return { status: 'not-found', message: 'Not found' };
  }

  return { status: 'provider-error', message: 'Provider error' };
}

async function checkSearchConsoleAccess(site: Site): Promise<ProviderDiagnostic> {
  if (site.searchConsole === false) {
    return { status: 'missing-config', message: 'Disabled for this site' };
  }

  try {
    await getSearchConsoleClient().sites.get({ siteUrl: getSCUrl(site) });
    return { status: 'ok', message: 'Accessible' };
  } catch (error) {
    return classifyProviderError(error);
  }
}

async function checkGa4Access(site: Site): Promise<ProviderDiagnostic> {
  if (!site.ga4PropertyId) {
    return { status: 'missing-config', message: 'No GA4 property ID' };
  }

  try {
    await getGa4Client().runReport({
      property: site.ga4PropertyId,
      dateRanges: [{ startDate: 'yesterday', endDate: 'yesterday' }],
      metrics: [{ name: 'activeUsers' }],
      limit: 1,
    });
    return { status: 'ok', message: 'Accessible' };
  } catch (error) {
    return classifyProviderError(error);
  }
}

export async function getSiteDiagnostics(): Promise<SiteDiagnosticResult[]> {
  const sites = await getManagedSites();

  return Promise.all(
    sites.map(async (site) => {
      const [searchConsole, ga4] = await Promise.all([
        checkSearchConsoleAccess(site),
        checkGa4Access(site),
      ]);

      return {
        siteId: site.id,
        searchConsole,
        ga4,
      };
    }),
  );
}
