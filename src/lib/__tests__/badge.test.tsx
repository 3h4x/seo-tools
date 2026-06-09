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

  it('supports compact, small, and medium dashboard badge sizes', () => {
    const compact = renderToStaticMarkup(<Badge size="compact">SC</Badge>);
    const small = renderToStaticMarkup(<Badge size="sm">Configured</Badge>);
    const medium = renderToStaticMarkup(<Badge size="md">High 2</Badge>);

    expect(compact).toContain('px-1.5 py-0.5 text-xs');
    expect(small).toContain('px-2 py-0.5 text-[11px]');
    expect(medium).toContain('px-3 py-2 text-xs');
  });

  it('supports shared dashboard tones', () => {
    const success = renderToStaticMarkup(<Badge tone="success">ok</Badge>);
    const successMuted = renderToStaticMarkup(<Badge tone="successMuted">ga4</Badge>);
    const subtle = renderToStaticMarkup(<Badge tone="subtle">loading</Badge>);
    const accent = renderToStaticMarkup(<Badge tone="accent">SC + GA4</Badge>);

    expect(success).toContain('border-emerald-800/80 bg-emerald-950/50 text-emerald-300');
    expect(successMuted).toContain('border-emerald-900/80 bg-emerald-950/40 text-emerald-300');
    expect(subtle).toContain('border-neutral-700 bg-neutral-900 text-neutral-500');
    expect(accent).toContain('border-violet-900/80 bg-violet-950/40 text-violet-300');
  });

  it('supports inline borderless text badges', () => {
    const success = renderToStaticMarkup(
      <Badge size="inline" borderless tone="successText">
        ↑20%
      </Badge>
    );
    const warning = renderToStaticMarkup(
      <Badge size="inline" borderless tone="warningText">
        Needs improvement
      </Badge>
    );
    const info = renderToStaticMarkup(
      <Badge size="inline" borderless tone="infoText">
        new
      </Badge>
    );
    const danger = renderToStaticMarkup(
      <Badge size="inline" borderless tone="dangerText">
        ↓20%
      </Badge>
    );

    expect(success).toContain('border-0 bg-transparent');
    expect(success).toContain('p-0 text-[10px]');
    expect(success).toContain('text-emerald-400');
    expect(warning).toContain('text-amber-400');
    expect(info).toContain('text-blue-400');
    expect(danger).toContain('text-red-400');
  });
});
