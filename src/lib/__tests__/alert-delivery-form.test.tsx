import { describe, expect, it, vi } from 'vitest';
import {
  clearAlertDeliveryOverrides,
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

  it('rejects malformed successful responses', async () => {
    await expect(readAlertConfigResponse(jsonResponse({ config: null }))).rejects.toThrow('Alert config response was invalid');
  });
});

describe('AlertDeliveryForm helpers', () => {
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
});
