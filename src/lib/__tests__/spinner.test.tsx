import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Spinner } from '../../../src/components/ui/spinner';

describe('Spinner', () => {
  it('renders an animated SVG marked as decorative by default', () => {
    const html = renderToStaticMarkup(<Spinner />);

    expect(html).toContain('animate-spin');
    expect(html).toContain('size-3.5');
    expect(html).toContain('aria-hidden');
    expect(html).not.toContain('aria-label');
    expect(html).not.toContain('role="img"');
  });

  it('exposes an accessible label and role when aria-label is provided', () => {
    const html = renderToStaticMarkup(<Spinner aria-label="Loading" />);

    expect(html).toContain('role="img"');
    expect(html).toContain('aria-label="Loading"');
    expect(html).not.toContain('aria-hidden');
  });

  it('accepts a custom size className override', () => {
    const html = renderToStaticMarkup(<Spinner className="size-6" />);

    expect(html).toContain('size-6 animate-spin');
    expect(html).not.toContain('size-3.5');
  });
});
