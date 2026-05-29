import { createConfigRouteHandlers } from '@/lib/config-route';

const KEY = 'pagespeed_api_key';

async function validatePagespeedKey(raw: string): Promise<string> {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new Error('Empty key');
  }

  const params = new URLSearchParams({
    url: 'https://www.example.com',
    strategy: 'mobile',
    key: trimmed,
  });
  let res: Response;
  try {
    res = await fetch(`https://www.googleapis.com/pagespeedonline/v5/runPagespeed?${params}`, {
      signal: AbortSignal.timeout(10_000),
    });
  } catch (error) {
    if ((error as Error).name === 'AbortError' || (error as Error).name === 'TimeoutError') {
      throw new Error('Validation timed out');
    }
    throw error;
  }
  if (res.status === 400 || res.status === 401 || res.status === 403) {
    const body = await res.json().catch(() => ({})) as { error?: { message?: string } };
    throw new Error(body.error?.message || `HTTP ${res.status}`);
  }
  if (!res.ok && res.status !== 429) {
    throw new Error(`HTTP ${res.status}`);
  }
  return trimmed;
}

export const { GET, POST, DELETE } = createConfigRouteHandlers({
  configKey: KEY,
  envKey: 'PAGESPEED_API_KEY',
  clearCachePrefix: 'psi-',
  validateAndNormalize: validatePagespeedKey,
});
