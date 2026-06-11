import type { FetchResult } from './audit-types';

export const FETCH_TIMEOUT = 30_000;
export const GOOGLEBOT_UA = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';

const MAX_RETRIES = 3;
const BASE_DELAY = 1_000;

export async function safeFetch(
  url: string,
  opts?: { ua?: string; method?: string; redirect?: RequestRedirect; timeoutMs?: number },
): Promise<FetchResult> {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      const delay = BASE_DELAY * Math.pow(2, attempt - 1);
      await new Promise(r => setTimeout(r, delay));
    }
    const start = Date.now();
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(opts?.timeoutMs ?? FETCH_TIMEOUT),
        headers: opts?.ua ? { 'User-Agent': opts.ua } : undefined,
        method: opts?.method,
        redirect: opts?.redirect ?? 'follow',
      });
      const ttfbMs = Date.now() - start;
      if (res.status === 429 && attempt < MAX_RETRIES) continue;
      const text = await res.text();
      return { ok: res.ok, status: res.status, text, headers: res.headers, ttfbMs };
    } catch (e) {
      const isTimeout = e instanceof DOMException && e.name === 'TimeoutError';
      if ((isTimeout || (e instanceof Error && e.message.includes('abort'))) && attempt < MAX_RETRIES) continue;
      return {
        ok: false, status: 0, text: '', headers: new Headers(),
        ttfbMs: Date.now() - start,
        error: e instanceof Error ? e.message : String(e),
      };
    }
  }
  return { ok: false, status: 0, text: '', headers: new Headers(), ttfbMs: 0, error: 'Max retries exceeded' };
}
