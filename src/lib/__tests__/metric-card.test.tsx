import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { MetricCard } from '../../../app/components/metric-card';

describe('MetricCard', () => {
  it('adds semantic trend text alongside compact visual arrows', () => {
    const html = renderToStaticMarkup(
      <MetricCard label="Users" current={120} previous={100} accent="border-blue-500" />
    );

    expect(html).toContain('title="Improved by 20%"');
    expect(html).toContain('<span aria-hidden="true">↑20%</span>');
    expect(html).toContain('<span class="sr-only">Improved by 20%</span>');
  });

  it('describes inverted metric changes by outcome instead of raw direction', () => {
    const html = renderToStaticMarkup(
      <MetricCard label="Avg Position" current={8} previous={10} accent="border-amber-500" invert />
    );

    expect(html).toContain('title="Improved by 20%"');
    expect(html).toContain('<span aria-hidden="true">↓20%</span>');
    expect(html).toContain('<span class="sr-only">Improved by 20%</span>');
  });

  it('renders optional header and footer content', () => {
    const html = renderToStaticMarkup(
      <MetricCard
        label="LCP"
        value="1.20s"
        current={1200}
        accent="border-emerald-500"
        labelAddon={<span>good</span>}
        footer="12 samples"
      />
    );

    expect(html).toContain('<span>good</span>');
    expect(html).toContain('12 samples');
  });

  it('maps semantic neutral accents to the shared surface accent class', () => {
    const html = renderToStaticMarkup(
      <MetricCard label="Unavailable" current={2} accentTone="neutral" />
    );

    expect(html).toContain('border-l-neutral-600');
  });

  it('maps semantic muted accents to the shared surface accent class', () => {
    const html = renderToStaticMarkup(
      <MetricCard label="No data" current={0} accentTone="muted" />
    );

    expect(html).toContain('border-l-neutral-700');
  });
});
