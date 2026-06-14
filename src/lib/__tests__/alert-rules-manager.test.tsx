import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import AlertRulesManager, {
  formatAlertRuleError,
  isMetricBlockedBySite,
  readAlertRulesResponse,
} from '../../../app/components/alert-rules-manager';

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

  it('labels compact rule controls for assistive technology', () => {
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

    expect(html).toContain('for="alert-rule-site"');
    expect(html).toContain('Alert site');
    expect(html).toContain('for="alert-rule-metric"');
    expect(html).toContain('Alert metric');
    expect(html).toContain('for="alert-rule-threshold"');
    expect(html).toContain('Drop threshold percent');
    expect(html).toContain('aria-label="Alert channels"');
    expect(html).toContain('aria-pressed="true"');
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

  it('renders the no-sites guidance with the shared empty-state notice', () => {
    const html = renderToStaticMarkup(<AlertRulesManager sites={[]} />);

    expect(html).toContain('Add managed sites first, then create per-site alert thresholds here.');
    expect(html).toContain('rounded-md border border-neutral-800 bg-neutral-900/60 text-neutral-300 px-3 py-2 text-sm');
    expect(html).toContain('h-auto flex flex-col items-center justify-center text-center text-neutral-600 text-sm');
  });

  it('blocks saving an SC click rule for a site with Search Console disabled', () => {
    const html = renderToStaticMarkup(
      <AlertRulesManager
        sites={[
          {
            id: 'site-a',
            name: 'Site A',
            domain: 'a.example.com',
            searchConsole: false,
            testPages: ['/'],
          },
        ]}
      />,
    );

    expect(html).toContain('Choose GA4 sessions or re-enable Search Console before saving this rule.');
    expect(html).toContain('disabled>Create rule</button>');
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
    ).rejects.toThrow('boom');
  });

  it('translates alert rule load failures from the API', async () => {
    await expect(
      readAlertRulesResponse(jsonResponse({ error: 'failed_to_load_alert_rules' }, 500)),
    ).rejects.toThrow('Could not load alert rules. Check server logs.');
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

describe('isMetricBlockedBySite', () => {
  it('flags sc_clicks rules on sites with Search Console disabled', () => {
    expect(isMetricBlockedBySite('sc_clicks', { searchConsole: false })).toBe(true);
  });

  it('allows sc_clicks rules when Search Console is enabled or unspecified', () => {
    expect(isMetricBlockedBySite('sc_clicks', { searchConsole: true })).toBe(false);
    expect(isMetricBlockedBySite('sc_clicks', {})).toBe(false);
  });

  it('does not flag non-SC metrics on SC-disabled sites', () => {
    expect(isMetricBlockedBySite('ga4_sessions', { searchConsole: false })).toBe(false);
  });

  it('returns false when the site is missing', () => {
    expect(isMetricBlockedBySite('sc_clicks', undefined)).toBe(false);
  });
});

describe('formatAlertRuleError', () => {
  it('maps storage failure codes while preserving validation messages', () => {
    expect(formatAlertRuleError('failed_to_load_sites', 'Save failed')).toBe(
      'Could not load managed sites. Check server logs.',
    );
    expect(formatAlertRuleError('failed_to_save_alert_rule', 'Save failed')).toBe(
      'Could not save alert rule. Check server logs.',
    );
    expect(formatAlertRuleError('delete_failed', 'Delete failed')).toBe(
      'Could not delete alert rule. Check server logs.',
    );
    expect(formatAlertRuleError('thresholdPct must be between 1 and 100', 'Save failed')).toBe(
      'thresholdPct must be between 1 and 100',
    );
  });
});
