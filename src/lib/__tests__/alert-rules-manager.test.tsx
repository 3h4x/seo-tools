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
