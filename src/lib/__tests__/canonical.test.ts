import { describe, expect, it } from 'vitest';
import { getBrokenCanonicalPages, getMissingCanonicalPages, summarizeCanonicalChecks } from '../canonical';

function makeMetaTag(
  overrides: Partial<{
    page: string;
    canonicalStatus: 'pass' | 'warn' | 'fail' | 'error';
    canonicalMessage: string;
    canonicalTarget: string | null;
    canonicalValid: boolean | null;
    canonicalHttpStatus: number | null;
  }> = {},
) {
  return {
    page: overrides.page ?? '/',
    ogImageUrl: undefined,
    noindex: false,
    canonicalValid: overrides.canonicalValid ?? null,
    canonicalStatus: overrides.canonicalHttpStatus ?? null,
    canonicalTarget: overrides.canonicalTarget ?? null,
    title: { status: 'pass' as const, label: 'title', message: 'ok' },
    description: { status: 'pass' as const, label: 'description', message: 'ok' },
    ogTitle: { status: 'pass' as const, label: 'og:title', message: 'ok' },
    ogImage: { status: 'pass' as const, label: 'og:image', message: 'ok' },
    ogDescription: { status: 'pass' as const, label: 'og:description', message: 'ok' },
    twitterCard: { status: 'pass' as const, label: 'twitter:card', message: 'ok' },
    canonical: {
      status: overrides.canonicalStatus ?? 'pass',
      label: 'canonical',
      message: overrides.canonicalMessage ?? 'Self-referential canonical resolves',
    },
    jsonLd: { status: 'pass' as const, label: 'JSON-LD', message: 'ok' },
  };
}

describe('canonical helpers', () => {
  it('surfaces skipped canonical checks as skipped instead of successful validation', () => {
    const summary = summarizeCanonicalChecks([
      makeMetaTag({ canonicalStatus: 'pass', canonicalMessage: 'N/A — Self-referential canonical resolves' }),
    ]);

    expect(summary.status).toBe('pass');
    expect(summary.compactLabel).toBe('1 skipped');
    expect(summary.message).toContain('skipped (N/A)');
  });

  it('shows mixed pass and skipped canonical checks without claiming all passed', () => {
    const summary = summarizeCanonicalChecks([
      makeMetaTag({ canonicalTarget: 'https://example.com/' }),
      makeMetaTag({ page: '/docs', canonicalStatus: 'pass', canonicalMessage: 'N/A — Self-referential canonical resolves' }),
    ]);

    expect(summary.compactLabel).toBe('1/2 pass, 1 skipped');
    expect(summary.message).toContain('1 skipped');
  });

  it('separates missing canonical tags from broken canonical targets', () => {
    const metaTags = [
      makeMetaTag({ page: '/', canonicalStatus: 'fail', canonicalMessage: 'Not found', canonicalTarget: null }),
      makeMetaTag({
        page: '/pricing',
        canonicalStatus: 'fail',
        canonicalMessage: 'Canonical returns HTTP 404',
        canonicalTarget: 'https://example.com/pricing',
        canonicalValid: false,
        canonicalHttpStatus: 404,
      }),
    ];

    expect(getMissingCanonicalPages(metaTags).map((meta) => meta.page)).toEqual(['/']);
    expect(getBrokenCanonicalPages(metaTags).map((meta) => meta.page)).toEqual(['/pricing']);
  });

  it('describes missing canonicals without calling them broken targets', () => {
    const summary = summarizeCanonicalChecks([
      makeMetaTag({ canonicalStatus: 'fail', canonicalMessage: 'Not found', canonicalTarget: null }),
    ]);

    expect(summary.status).toBe('fail');
    expect(summary.message).toBe('1 page missing canonical tags');
    expect(summary.message).not.toContain('failing canonical targets');
  });

  it('uses a neutral issues summary when missing and broken canonicals are mixed', () => {
    const summary = summarizeCanonicalChecks([
      makeMetaTag({ canonicalStatus: 'fail', canonicalMessage: 'Not found', canonicalTarget: null }),
      makeMetaTag({
        page: '/pricing',
        canonicalStatus: 'fail',
        canonicalMessage: 'Canonical returns HTTP 404',
        canonicalTarget: 'https://example.com/pricing',
        canonicalValid: false,
        canonicalHttpStatus: 404,
      }),
    ]);

    expect(summary.status).toBe('fail');
    expect(summary.compactLabel).toBe('2 issues');
    expect(summary.message).toContain('2 pages have canonical issues');
    expect(summary.message).toContain('1 missing, 1 broken targets');
  });
});
