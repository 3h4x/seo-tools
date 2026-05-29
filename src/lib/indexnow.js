const INDEXNOW_ENDPOINT = 'https://api.indexnow.org/indexnow';
const MAX_URLS_PER_REQUEST = 10000;
const MAX_SITEMAP_DEPTH = 3;
const FETCH_TIMEOUT_MS = 15_000;

function getSiteOrigin(domain) {
  return domain.startsWith('http://') || domain.startsWith('https://')
    ? domain.replace(/\/$/, '')
    : `https://${domain}`;
}

function parseSitemapDirective(robotsTxt) {
  const match = robotsTxt.match(/^\s*Sitemap:\s*(\S+)\s*$/im);
  return match?.[1]?.trim() ?? null;
}

function extractLocs(xml) {
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/gi)].map((match) => match[1].trim());
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: {
      'user-agent': 'seo-tools/1.0 (+https://github.com/3h4x/seo-tools)',
    },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  const text = await response.text();
  return { response, text };
}

async function collectSitemapUrls(sitemapUrl, seen, depth) {
  if (seen.has(sitemapUrl)) return [];
  seen.add(sitemapUrl);

  const { response, text } = await fetchText(sitemapUrl);
  if (!response.ok) {
    throw new Error(`Sitemap fetch failed (${response.status})`);
  }

  const locs = extractLocs(text);
  if (!/<sitemapindex[\s>]/i.test(text)) {
    return locs;
  }

  if (depth >= MAX_SITEMAP_DEPTH) {
    return [];
  }

  const nestedUrls = await Promise.all(
    locs.map((url) => collectSitemapUrls(url, seen, depth + 1)),
  );
  return nestedUrls.flat();
}

export function getIndexNowKeyLocation(site) {
  return `${getSiteOrigin(site.domain)}/${site.indexNowKey}.txt`;
}

export async function checkIndexNowKey(site) {
  if (!site.indexNowKey) {
    return {
      status: 'warn',
      label: 'IndexNow',
      message: 'No IndexNow key configured',
      details: 'Add an IndexNow key in Config before using manual ping.',
    };
  }

  const keyLocation = getIndexNowKeyLocation(site);

  try {
    const { response, text } = await fetchText(keyLocation);
    if (!response.ok) {
      return {
        status: 'fail',
        label: 'IndexNow',
        message: `Key file unreachable (${response.status})`,
        details: `Expected ${keyLocation} to return the configured key.`,
      };
    }

    if (text.trim() !== site.indexNowKey) {
      return {
        status: 'fail',
        label: 'IndexNow',
        message: 'Key file contents do not match configured key',
        details: `Expected ${keyLocation} to contain exactly "${site.indexNowKey}".`,
      };
    }

    return {
      status: 'pass',
      label: 'IndexNow',
      message: 'Key file is reachable and matches the configured key',
      details: keyLocation,
    };
  } catch (error) {
    return {
      status: 'error',
      label: 'IndexNow',
      message: 'Key file verification failed',
      details: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

export async function collectSiteIndexNowUrls(site) {
  const origin = getSiteOrigin(site.domain);
  const robotsUrl = `${origin}/robots.txt`;

  let sitemapUrl = `${origin}/sitemap.xml`;
  try {
    const { response, text } = await fetchText(robotsUrl);
    if (response.ok) {
      sitemapUrl = parseSitemapDirective(text) ?? sitemapUrl;
    }
  } catch {
    // Fallback to /sitemap.xml when robots.txt is unreachable.
  }

  const urls = await collectSitemapUrls(sitemapUrl, new Set(), 0);
  const uniqueUrls = [...new Set(urls)].filter(Boolean);

  return {
    sitemapUrl,
    totalUrls: uniqueUrls.length,
    urls: uniqueUrls.slice(0, MAX_URLS_PER_REQUEST),
    truncated: uniqueUrls.length > MAX_URLS_PER_REQUEST,
  };
}

export async function submitIndexNowForSite(site) {
  if (!site.indexNowKey) {
    throw new Error('No IndexNow key configured for this site');
  }

  const { sitemapUrl, totalUrls, urls, truncated } = await collectSiteIndexNowUrls(site);
  if (urls.length === 0) {
    throw new Error(`No URLs found in sitemap ${sitemapUrl}`);
  }

  const payload = {
    host: site.domain,
    key: site.indexNowKey,
    keyLocation: getIndexNowKeyLocation(site),
    urlList: urls,
  };

  const response = await fetch(INDEXNOW_ENDPOINT, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'user-agent': 'seo-tools/1.0 (+https://github.com/3h4x/seo-tools)',
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });

  if (!response.ok) {
    const body = (await response.text()).trim();
    throw new Error(body ? `IndexNow rejected the submission (${response.status}): ${body}` : `IndexNow rejected the submission (${response.status})`);
  }

  return {
    sitemapUrl,
    submittedCount: urls.length,
    totalUrls,
    truncated,
    keyLocation: payload.keyLocation,
  };
}
