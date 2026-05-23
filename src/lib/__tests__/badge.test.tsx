import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Badge } from '../../../src/components/ui/badge';

describe('Badge', () => {
  it('renders compact pill badge styling by default', () => {
    const html = renderToStaticMarkup(<Badge className="text-emerald-300">RUM</Badge>);

    expect(html).toContain('inline-flex items-center border font-medium');
    expect(html).toContain('px-2 py-0.5 text-[10px]');
    expect(html).toContain('rounded-full');
    expect(html).toContain('text-emerald-300');
  });

  it('supports rounded uppercase source labels', () => {
    const html = renderToStaticMarkup(
      <Badge shape="rounded" uppercase title="Real-user data">
        rum
      </Badge>
    );

    expect(html).toContain('rounded');
    expect(html).toContain('uppercase tracking-wider');
    expect(html).toContain('title="Real-user data"');
  });

  it('supports compact and small dashboard badge sizes', () => {
    const compact = renderToStaticMarkup(<Badge size="compact">SC</Badge>);
    const small = renderToStaticMarkup(<Badge size="sm">Configured</Badge>);

    expect(compact).toContain('px-1.5 py-0.5 text-xs');
    expect(small).toContain('px-2 py-0.5 text-[11px]');
  });
});
