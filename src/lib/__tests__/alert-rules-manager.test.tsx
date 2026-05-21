import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import AlertRulesManager from '../../../app/components/alert-rules-manager';

describe('AlertRulesManager', () => {
  it('only offers metrics produced by the CLI snapshot workflow', () => {
    const html = renderToStaticMarkup(
      <AlertRulesManager
        sites={[
          {
            id: 'site-a',
            name: 'Site A',
            domain: 'a.example.com',
            testPages: ['/'],
          },
        ]}
      />,
    );

    expect(html).toContain('SC clicks');
    expect(html).toContain('GA4 sessions');
    expect(html).not.toContain('Audit score');
  });

  it('renders a structured skeleton while rules are loading', () => {
    const html = renderToStaticMarkup(
      <AlertRulesManager
        sites={[
          {
            id: 'site-a',
            name: 'Site A',
            domain: 'a.example.com',
            testPages: ['/'],
          },
        ]}
      />,
    );

    expect(html).toContain('aria-label="Loading alert rules"');
    expect(html).not.toContain('Loading rules');
  });
});
