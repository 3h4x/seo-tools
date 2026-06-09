import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Surface } from '../../../src/components/ui/surface';

describe('Surface', () => {
  it('supports shared left-accent status card styling', () => {
    const html = renderToStaticMarkup(
      <Surface leftAccentClassName="border-l-emerald-500" padding="sm">
        Healthy
      </Surface>
    );

    expect(html).toContain('rounded-lg border border-neutral-800 bg-neutral-900');
    expect(html).toContain('p-4');
    expect(html).toContain('border-l-4');
    expect(html).toContain('border-l-emerald-500');
  });
});
