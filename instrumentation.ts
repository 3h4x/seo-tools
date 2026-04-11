export async function register() {
  // Only run in the Node.js server runtime, not in Edge or client
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { startCollector } = await import('@/lib/collect-daily');
    startCollector();

    const { startSitemapSync } = await import('@/lib/sitemap-sync');
    startSitemapSync();
  }
}
