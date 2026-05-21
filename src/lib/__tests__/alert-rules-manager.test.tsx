import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import AlertRulesManager, { readAlertRulesResponse } from '../../../app/components/alert-rules-manager';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

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

describe('readAlertRulesResponse', () => {
  it('returns the rules array on a valid payload', async () => {
    await expect(
      readAlertRulesResponse(jsonResponse({ rules: [] })),
    ).resolves.toEqual([]);
  });

  it('throws when the HTTP status is not ok', async () => {
    await expect(
      readAlertRulesResponse(jsonResponse({ error: 'boom' }, 500)),
    ).rejects.toThrow('Failed to load alert rules (500)');
  });

  it('throws when the payload is malformed', async () => {
    await expect(
      readAlertRulesResponse(jsonResponse({ rules: 'not-array' })),
    ).rejects.toThrow('Alert rules response was invalid');
  });

  it('throws when the body is not JSON', async () => {
    const res = new Response('not json', { status: 200, headers: { 'content-type': 'text/plain' } });
    await expect(readAlertRulesResponse(res)).rejects.toThrow('Alert rules response was invalid');
  });
});
