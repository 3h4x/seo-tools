import { describe, it, expect } from 'vitest';

// Verify next.config.ts redirects include the /traffic → /report permanent redirect.
// This ensures the Traffic page removal doesn't break inbound links.
describe('next.config redirects', () => {
  it('redirects /traffic to /report permanently', async () => {
    const { default: nextConfig } = await import('../../../next.config');
    expect(nextConfig.redirects).toBeDefined();
    const redirects = await nextConfig.redirects!();
    const trafficRedirect = redirects.find((r: { source: string }) => r.source === '/traffic');
    expect(trafficRedirect).toBeDefined();
    expect(trafficRedirect?.destination).toBe('/report');
    expect(trafficRedirect?.permanent).toBe(true);
  });
});
