import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import CwvSetupGuide from '../../../app/components/cwv-setup-guide';

describe('CwvSetupGuide', () => {
  it('exposes collapsed disclosure state', () => {
    const html = renderToStaticMarkup(<CwvSetupGuide />);

    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('aria-controls=');
    expect(html).not.toContain('role="region"');
  });

  it('labels the expanded setup panel from the disclosure button', () => {
    const html = renderToStaticMarkup(<CwvSetupGuide defaultOpen />);

    expect(html).toContain('aria-expanded="true"');
    expect(html).toContain('role="region"');
    expect(html).toContain('aria-labelledby=');
    expect(html).toContain('aria-hidden="true"');
  });
});
