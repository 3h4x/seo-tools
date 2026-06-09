import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Notice, NoticeCenteredContent } from '../../../src/components/ui/notice';

describe('Notice', () => {
  it('renders shared in-page status banner styling', () => {
    const html = renderToStaticMarkup(
      <Notice tone="warning" size="sm" role="status">
        Operational status could not be loaded.
      </Notice>
    );

    expect(html).toContain('rounded-md border');
    expect(html).toContain('border-amber-500/30 bg-amber-500/10 text-amber-200');
    expect(html).toContain('px-3 py-2 text-sm');
    expect(html).toContain('role="status"');
  });

  it('supports danger status banners', () => {
    const html = renderToStaticMarkup(
      <Notice tone="danger" role="alert">
        Page queries unavailable.
      </Notice>
    );

    expect(html).toContain('border-red-950 bg-neutral-900 text-neutral-300');
    expect(html).toContain('role="alert"');
  });

  it('supports success status banners', () => {
    const html = renderToStaticMarkup(
      <Notice tone="success" size="sm" role="status">
        Connection OK
      </Notice>
    );

    expect(html).toContain('border-emerald-500/30 bg-emerald-500/10 text-emerald-200');
    expect(html).toContain('role="status"');
  });

  it('supports compact inline notices', () => {
    const html = renderToStaticMarkup(
      <Notice size="xs">
        IndexNow ping submitted
      </Notice>
    );

    expect(html).toContain('px-3 py-1.5 text-xs');
  });

  it('supports panel-density notices', () => {
    const html = renderToStaticMarkup(
      <Notice size="panel">
        Larger operational state
      </Notice>
    );

    expect(html).toContain('p-5');
  });

  it('supports card-density notices', () => {
    const html = renderToStaticMarkup(
      <Notice size="card">
        Inline recommendation
      </Notice>
    );

    expect(html).toContain('p-4');
  });

  it('supports spacious notices', () => {
    const html = renderToStaticMarkup(
      <Notice size="spacious">
        Empty state
      </Notice>
    );

    expect(html).toContain('p-8');
  });

  it('supports centered notice content panels', () => {
    const html = renderToStaticMarkup(
      <NoticeCenteredContent height="sm">
        Page Queries Unavailable
      </NoticeCenteredContent>
    );

    expect(html).toContain('h-32');
    expect(html).toContain('flex flex-col items-center justify-center text-center');
  });

  it('supports content-driven centered notice height', () => {
    const html = renderToStaticMarkup(
      <NoticeCenteredContent height="auto">
        Error detail
      </NoticeCenteredContent>
    );

    expect(html).toContain('h-auto');
    expect(html).not.toContain('h-32');
    expect(html).not.toContain('h-40');
  });

  it('supports parent-driven full-height centered notice content', () => {
    const html = renderToStaticMarkup(
      <NoticeCenteredContent height="full">
        Chart unavailable
      </NoticeCenteredContent>
    );

    expect(html).toContain('h-full');
    expect(html).toContain('flex flex-col items-center justify-center text-center');
  });

  it('supports muted centered notice copy', () => {
    const html = renderToStaticMarkup(
      <NoticeCenteredContent textTone="muted">
        Need more data
      </NoticeCenteredContent>
    );

    expect(html).toContain('text-neutral-600 text-sm');
  });
});
