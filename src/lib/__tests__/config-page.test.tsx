import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import ConfigPage from '../../../app/config/page';

describe('Config page', () => {
  it('renders a structured skeleton while client-side config data is loading', () => {
    const html = renderToStaticMarkup(<ConfigPage />);

    expect(html).toContain('aria-label="Loading configuration"');
    expect(html).toContain('animate-pulse bg-neutral-800 rounded');
    expect(html).not.toContain('Loading...');
  });
});
