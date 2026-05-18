import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockGetAlertDeliveryConfigResponse,
  mockValidateAlertDeliveryInput,
  mockSaveAlertDeliveryConfig,
  mockClearAlertDeliveryConfig,
} = vi.hoisted(() => ({
  mockGetAlertDeliveryConfigResponse: vi.fn(),
  mockValidateAlertDeliveryInput: vi.fn(),
  mockSaveAlertDeliveryConfig: vi.fn(),
  mockClearAlertDeliveryConfig: vi.fn(),
}));

vi.mock('@/lib/alert-delivery', () => ({
  getAlertDeliveryConfigResponse: mockGetAlertDeliveryConfigResponse,
  validateAlertDeliveryInput: mockValidateAlertDeliveryInput,
  saveAlertDeliveryConfig: mockSaveAlertDeliveryConfig,
  clearAlertDeliveryConfig: mockClearAlertDeliveryConfig,
}));

import { DELETE, GET, POST } from '../../../app/api/config/alerts/route';

function postReq(body: object): Request {
  return new Request('http://localhost/api/config/alerts', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GET /api/config/alerts', () => {
  it('returns the current delivery config payload', async () => {
    mockGetAlertDeliveryConfigResponse.mockReturnValue({
      config: { fromEmail: 'alerts@example.com', toEmail: 'ops@example.com', hasResendApiKey: true, hasWebhookUrl: true },
      sources: { resendApiKey: 'db', fromEmail: 'db', toEmail: 'env', webhookUrl: 'db' },
    });

    const res = await GET();

    const payload = await res.json();
    expect(payload).toEqual({
      config: { fromEmail: 'alerts@example.com', toEmail: 'ops@example.com', hasResendApiKey: true, hasWebhookUrl: true },
      sources: { resendApiKey: 'db', fromEmail: 'db', toEmail: 'env', webhookUrl: 'db' },
    });
    expect(JSON.stringify(payload)).not.toContain('hooks.example.com');
  });
});

describe('POST /api/config/alerts', () => {
  it('validates and saves delivery config', async () => {
    mockValidateAlertDeliveryInput.mockReturnValue({
      resendApiKey: 're_123',
      fromEmail: 'alerts@example.com',
      toEmail: 'ops@example.com',
      webhookUrl: '',
    });

    const res = await POST(postReq({ resendApiKey: 're_123' }));

    expect(res.status).toBe(200);
    expect(mockValidateAlertDeliveryInput).toHaveBeenCalledWith({ resendApiKey: 're_123' });
    expect(mockSaveAlertDeliveryConfig).toHaveBeenCalledWith({
      resendApiKey: 're_123',
      fromEmail: 'alerts@example.com',
      toEmail: 'ops@example.com',
      webhookUrl: '',
    });
  });

  it('returns 400 when validation fails', async () => {
    mockValidateAlertDeliveryInput.mockImplementation(() => {
      throw new Error('Webhook URL must be a valid absolute URL');
    });

    const res = await POST(postReq({ webhookUrl: 'bad' }));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ ok: false, error: 'Webhook URL must be a valid absolute URL' });
    expect(mockSaveAlertDeliveryConfig).not.toHaveBeenCalled();
  });
});

describe('DELETE /api/config/alerts', () => {
  it('clears DB overrides', async () => {
    const res = await DELETE();

    expect(res.status).toBe(200);
    expect(mockClearAlertDeliveryConfig).toHaveBeenCalled();
  });
});
