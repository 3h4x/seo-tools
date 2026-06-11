export const MAX_SAMPLED_PAGES = 10;

const SITEMAP_SAMPLE_LIMIT = 5;
const SC_SAMPLE_LIMIT = 5;

export function sampleAuditPages(
  testPages: string[],
  sitemapLocs: string[],
  scPageUrls: string[],
  domain: string,
): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  const addPath = (path: string) => {
    if (seen.has(path) || result.length >= MAX_SAMPLED_PAGES) return false;
    seen.add(path);
    result.push(path);
    return true;
  };

  for (const p of testPages) {
    if (result.length >= MAX_SAMPLED_PAGES) break;
    addPath(p.startsWith('/') ? p : `/${p}`);
  }

  let sitemapAdded = 0;
  for (const loc of sitemapLocs) {
    if (sitemapAdded >= SITEMAP_SAMPLE_LIMIT || result.length >= MAX_SAMPLED_PAGES) break;
    try {
      const url = new URL(loc);
      if (url.hostname !== domain) continue;
      const path = url.pathname + (url.search || '');
      if (addPath(path)) sitemapAdded++;
    } catch { /* skip invalid URLs */ }
  }

  let scAdded = 0;
  for (const page of scPageUrls) {
    if (scAdded >= SC_SAMPLE_LIMIT || result.length >= MAX_SAMPLED_PAGES) break;
    try {
      const url = new URL(page);
      if (url.hostname !== domain) continue;
      const path = url.pathname + (url.search || '');
      if (addPath(path)) scAdded++;
    } catch { /* skip invalid URLs */ }
  }

  return result;
}
