import { describe, expect, it, vi } from 'vitest';
import {
  clearAlertDeliveryOverrides,
  formatAlertConfigError,
  readAlertConfigResponse,
  type AlertConfigResponse,
} from '../../../app/components/alert-delivery-form';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('readAlertConfigResponse', () => {
  it('returns a valid alert config response payload', async () => {
    const payload: AlertConfigResponse = {
      config: { fromEmail: 'a@x', toEmail: 'b@x', hasResendApiKey: false, hasWebhookUrl: false },
      sources: { resendApiKey: 'none', fromEmail: 'none', toEmail: 'none', webhookUrl: 'none' },
    };
    await expect(readAlertConfigResponse(jsonResponse(payload))).resolves.toEqual(payload);
  });

  it('surfaces server-provided error on failure', async () => {
    await expect(
      readAlertConfigResponse(jsonResponse({ error: 'boom' }, 500)),
    ).rejects.toThrow('boom');
  });

  it('translates alert config load failures from the API', async () => {
    await expect(
      readAlertConfigResponse(jsonResponse({ error: 'failed_to_load_alert_config' }, 500)),
    ).rejects.toThrow('Could not load alert delivery config. Check server logs.');
  });

  it('rejects malformed successful responses', async () => {
    await expect(readAlertConfigResponse(jsonResponse({ config: null }))).rejects.toThrow('Alert config response was invalid');
  });
});

describe('AlertDeliveryForm helpers', () => {
  it('maps storage failure codes while preserving validation messages', () => {
    expect(formatAlertConfigError('failed_to_save_alert_config', 'Save failed')).toBe(
      'Could not save alert delivery config. Check server logs.',
    );
    expect(formatAlertConfigError('failed_to_clear_alert_config', 'Clear failed')).toBe(
      'Could not clear alert delivery config. Check server logs.',
    );
    expect(formatAlertConfigError('Webhook URL must use https', 'Save failed')).toBe(
      'Webhook URL must use https',
    );
  });

  it('reloads effective env fallback config after clearing DB overrides', async () => {
    const envConfig: AlertConfigResponse = {
      config: {
        fromEmail: 'alerts@example.com',
        toEmail: 'ops@example.com,seo@example.com',
        hasResendApiKey: true,
        hasWebhookUrl: true,
      },
      sources: {
        resendApiKey: 'env',
        fromEmail: 'env',
        toEmail: 'env',
        webhookUrl: 'env',
      },
    };
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ ok: true }))
      .mockResolvedValueOnce(jsonResponse(envConfig));

    await expect(clearAlertDeliveryOverrides(fetchMock)).resolves.toEqual(envConfig);
    expect(JSON.stringify(envConfig)).not.toContain('hooks.example.com');

    expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/config/alerts', { method: 'DELETE' });
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/config/alerts');
  });

  it('translates clear failures before surfacing them', async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ ok: false, error: 'failed_to_clear_alert_config' }, 500));

    await expect(clearAlertDeliveryOverrides(fetchMock)).rejects.toThrow(
      'Could not clear alert delivery config. Check server logs.',
    );
  });
});
