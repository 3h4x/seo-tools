import { describe, expect, it, vi } from 'vitest';
import { clearAlertDeliveryOverrides, type AlertConfigResponse } from '../../../app/components/alert-delivery-form';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

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
