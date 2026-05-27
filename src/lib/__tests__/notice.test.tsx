import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Notice } from '../../../src/components/ui/notice';

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
});
