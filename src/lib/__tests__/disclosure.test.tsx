import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Disclosure } from '../../../src/components/ui/disclosure';

describe('Disclosure', () => {
  it('passes attributes to the summary and content wrapper', () => {
    const html = renderToStaticMarkup(
      <Disclosure
        summary="Details"
        summaryProps={{
          id: 'trigger',
          'aria-controls': 'panel',
          'aria-expanded': 'true',
        }}
        contentClassName="content"
        contentProps={{
          id: 'panel',
          role: 'region',
          'aria-labelledby': 'trigger',
        }}
      >
        Expanded content
      </Disclosure>
    );

    expect(html).toContain('<summary id="trigger" aria-controls="panel" aria-expanded="true">');
    expect(html).toContain('<div class="content" id="panel" role="region" aria-labelledby="trigger">');
  });
});
