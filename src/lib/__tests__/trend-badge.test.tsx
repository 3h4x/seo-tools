import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { TrendBadge } from '../../../app/components/trend-badge';

describe('TrendBadge', () => {
  it('adds semantic text for increasing trend arrows', () => {
    const html = renderToStaticMarkup(<TrendBadge current={120} previous={100} />);

    expect(html).toContain('title="Increased by 20%"');
    expect(html).toContain('<span aria-hidden="true">↑20%</span>');
    expect(html).toContain('<span class="sr-only">Increased by 20%</span>');
  });

  it('adds semantic text for decreasing trend arrows', () => {
    const html = renderToStaticMarkup(<TrendBadge current={75} previous={100} />);

    expect(html).toContain('title="Decreased by 25%"');
    expect(html).toContain('<span aria-hidden="true">↓25%</span>');
    expect(html).toContain('<span class="sr-only">Decreased by 25%</span>');
  });

  it('adds semantic text for new trend badges', () => {
    const html = renderToStaticMarkup(<TrendBadge current={10} previous={0} />);

    expect(html).toContain('title="New value"');
    expect(html).toContain('<span aria-hidden="true">NEW</span>');
    expect(html).toContain('<span class="sr-only">New value</span>');
  });
});
