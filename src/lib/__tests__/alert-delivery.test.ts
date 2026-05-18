import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs');
  return { ...actual, existsSync: () => true, mkdirSync: () => undefined };
});

vi.mock('../sqlite-driver.js', async () => {
  const actual = await vi.importActual<typeof import('../sqlite-driver.js')>('../sqlite-driver.js');
  return {
    openDatabase: () => actual.openDatabase(':memory:'),
  };
});

const lookupMock = vi.hoisted(() => vi.fn(async () => [{ address: '93.184.216.34', family: 4 }]));
vi.mock('node:dns/promises', () => ({
  lookup: lookupMock,
}));

const httpsRequestMock = vi.hoisted(() => vi.fn());
vi.mock('node:https', () => ({
  request: httpsRequestMock,
}));

import { getConfig, getDb, setConfig } from '../db';
import {
  getAlertDeliveryConfigResponse,
  saveAlertDeliveryConfig,
  sendAlertNotifications,
  validateAlertDeliveryInput,
} from '../alert-delivery';

const payload = {
  siteId: 'site-a',
  siteName: 'Site A',
  domain: 'a.example.com',
  metric: 'sc_clicks' as const,
  thresholdPct: 25,
  previousValue: 100,
  currentValue: 60,
  deltaPct: 40,
  snapshotDate: '2026-05-17',
};

type PinnedLookup = (
  hostname: string,
  options: unknown,
  callback: (error: Error | null, address: string, family: number) => void,
) => void;

function mockHttpsResponse(statusCode = 204, body = '') {
  httpsRequestMock.mockImplementation((options, callback) => {
    const req = {} as {
      on: ReturnType<typeof vi.fn>;
      write: ReturnType<typeof vi.fn>;
      end: ReturnType<typeof vi.fn>;
    };
    req.on = vi.fn(() => req);
    req.write = vi.fn();
    req.end = vi.fn(() => {
      const responseHandlers = new Map<string, (chunk?: Buffer) => void>();
      const res = {
        statusCode,
        on: vi.fn((event: string, handler: (chunk?: Buffer) => void) => {
          responseHandlers.set(event, handler);
          return res;
        }),
      };
      callback(res);
      if (body) {
        responseHandlers.get('data')?.(Buffer.from(body));
      }
      responseHandlers.get('end')?.();
    });
    return req;
  });
}

beforeEach(() => {
  getDb().exec('DELETE FROM config');
  vi.unstubAllGlobals();
  httpsRequestMock.mockReset();
  mockHttpsResponse();
  lookupMock.mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
  delete process.env.ALERT_RESEND_API_KEY;
  delete process.env.ALERT_FROM_EMAIL;
  delete process.env.ALERT_TO_EMAIL;
  delete process.env.ALERT_WEBHOOK_URL;
});

describe('alert delivery config', () => {
  it('preserves the stored Resend key when the save payload leaves the password field blank', () => {
    setConfig('alert_resend_api_key', 're_existing');

    const normalized = validateAlertDeliveryInput({
      resendApiKey: '',
      fromEmail: 'alerts@example.com',
      toEmail: 'ops@example.com',
      webhookUrl: 'https://hooks.example.com/seo-alerts',
    });
    saveAlertDeliveryConfig(normalized);

    expect(getConfig('alert_resend_api_key')).toBe('re_existing');
    expect(getAlertDeliveryConfigResponse()).toMatchObject({
      config: {
        fromEmail: 'alerts@example.com',
        toEmail: 'ops@example.com',
        hasResendApiKey: true,
        hasWebhookUrl: true,
      },
      sources: {
        resendApiKey: 'db',
        fromEmail: 'db',
        toEmail: 'db',
        webhookUrl: 'db',
      },
    });
  });

  it('redacts webhook URLs from config responses and preserves stored URL on blank saves', () => {
    setConfig('alert_webhook_url', 'https://hooks.example.com/secret-token');

    const normalized = validateAlertDeliveryInput({
      resendApiKey: '',
      fromEmail: 'alerts@example.com',
      toEmail: 'ops@example.com',
      webhookUrl: '',
    });
    saveAlertDeliveryConfig(normalized);

    const response = getAlertDeliveryConfigResponse();
    expect(getConfig('alert_webhook_url')).toBe('https://hooks.example.com/secret-token');
    expect(response).toMatchObject({
      config: {
        fromEmail: 'alerts@example.com',
        toEmail: 'ops@example.com',
        hasResendApiKey: false,
        hasWebhookUrl: true,
      },
      sources: {
        webhookUrl: 'db',
      },
    });
    expect(JSON.stringify(response)).not.toContain('secret-token');
  });

  it('redacts env fallback webhook URLs from config responses', () => {
    process.env.ALERT_WEBHOOK_URL = 'https://hooks.example.com/env-secret-token';

    const response = getAlertDeliveryConfigResponse();

    expect(response.config.hasWebhookUrl).toBe(true);
    expect(response.sources.webhookUrl).toBe('env');
    expect(JSON.stringify(response)).not.toContain('env-secret-token');
  });

  it('stores a replacement webhook URL when the save payload includes one', () => {
    setConfig('alert_webhook_url', 'https://hooks.example.com/old-token');

    const normalized = validateAlertDeliveryInput({
      webhookUrl: 'https://hooks.example.com/new-token',
    });
    saveAlertDeliveryConfig(normalized);

    expect(getConfig('alert_webhook_url')).toBe('https://hooks.example.com/new-token');
  });

  it.each([
    ['http://hooks.example.com/seo-alerts', 'Webhook URL must use https'],
    ['https://localhost/seo-alerts', 'Webhook URL must use a public host'],
    ['https://127.0.0.1/seo-alerts', 'Webhook URL must use a public host'],
    ['https://10.0.0.1/seo-alerts', 'Webhook URL must use a public host'],
    ['https://172.20.0.1/seo-alerts', 'Webhook URL must use a public host'],
    ['https://192.168.0.1/seo-alerts', 'Webhook URL must use a public host'],
    ['https://[::1]/seo-alerts', 'Webhook URL must use a public host'],
    ['https://[::ffff:127.0.0.1]/seo-alerts', 'Webhook URL must use a public host'],
    ['https://[::ffff:0a00:1]/seo-alerts', 'Webhook URL must use a public host'],
    ['https://[::ffff:c0a8:1]/seo-alerts', 'Webhook URL must use a public host'],
    ['https://hooks.local/seo-alerts', 'Webhook URL must use a public host'],
    ['https://hooks.example.com:secret@hooks.example.com/seo-alerts', 'Webhook URL must not include credentials'],
  ])('rejects unsafe webhook URL %s', (webhookUrl, message) => {
    expect(() => validateAlertDeliveryInput({ webhookUrl })).toThrow(message);
  });

  it('accepts and delivers to a public HTTPS webhook URL with pinned DNS lookup', async () => {
    const normalized = validateAlertDeliveryInput({
      webhookUrl: 'https://hooks.example.com/seo-alerts',
    });
    saveAlertDeliveryConfig(normalized);

    const result = await sendAlertNotifications(['webhook'], payload);

    expect(result).toEqual({ deliveredChannels: ['webhook'], deliveryError: null });
    expect(httpsRequestMock).toHaveBeenCalledWith(
      expect.objectContaining({
        hostname: 'hooks.example.com',
        method: 'POST',
        path: '/seo-alerts',
        servername: 'hooks.example.com',
        signal: expect.any(AbortSignal),
        lookup: expect.any(Function),
      }),
      expect.any(Function),
    );
    const options = httpsRequestMock.mock.calls[0][0] as { lookup: PinnedLookup };
    const lookupCallback = vi.fn();
    options.lookup('hooks.example.com', {}, lookupCallback);
    expect(lookupCallback).toHaveBeenCalledWith(null, '93.184.216.34', 4);
  });

  it('does not follow webhook redirects to private hosts', async () => {
    mockHttpsResponse(302);
    setConfig('alert_webhook_url', 'https://hooks.example.com/seo-alerts');

    const result = await sendAlertNotifications(['webhook'], payload);

    expect(result).toEqual({
      deliveredChannels: [],
      deliveryError: 'webhook: Webhook redirect responses are not allowed',
    });
    expect(httpsRequestMock).toHaveBeenCalledTimes(1);
    expect(httpsRequestMock).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'POST',
        hostname: 'hooks.example.com',
      }),
      expect.any(Function),
    );
  });

  it('does not follow webhook redirects to private HTTPS hosts', async () => {
    mockHttpsResponse(307);
    setConfig('alert_webhook_url', 'https://hooks.example.com/seo-alerts');

    const result = await sendAlertNotifications(['webhook'], payload);

    expect(result).toEqual({
      deliveredChannels: [],
      deliveryError: 'webhook: Webhook redirect responses are not allowed',
    });
    expect(httpsRequestMock).toHaveBeenCalledTimes(1);
  });

  it('delivers email with a timeout signal', async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 202 }));
    vi.stubGlobal('fetch', fetchMock);
    setConfig('alert_resend_api_key', 're_123');
    setConfig('alert_from_email', 'alerts@example.com');
    setConfig('alert_to_email', 'ops@example.com');

    const result = await sendAlertNotifications(['email'], payload);

    expect(result).toEqual({ deliveredChannels: ['email'], deliveryError: null });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.resend.com/emails',
      expect.objectContaining({
        method: 'POST',
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it('captures email abort failures without throwing', async () => {
    const fetchMock = vi.fn(async () => {
      throw new DOMException('The operation was aborted.', 'AbortError');
    });
    vi.stubGlobal('fetch', fetchMock);
    setConfig('alert_resend_api_key', 're_123');
    setConfig('alert_from_email', 'alerts@example.com');
    setConfig('alert_to_email', 'ops@example.com');

    const result = await sendAlertNotifications(['email'], payload);

    expect(result).toEqual({
      deliveredChannels: [],
      deliveryError: 'email: The operation was aborted.',
    });
  });

  it('rejects unsafe webhook URLs at delivery time even when they come from existing config', async () => {
    setConfig('alert_webhook_url', 'https://127.0.0.1/seo-alerts');

    const result = await sendAlertNotifications(['webhook'], payload);

    expect(result).toEqual({
      deliveredChannels: [],
      deliveryError: 'webhook: Webhook URL must use a public host',
    });
    expect(httpsRequestMock).not.toHaveBeenCalled();
  });

  it.each([
    'https://[::ffff:127.0.0.1]/seo-alerts',
    'https://[::ffff:0a00:1]/seo-alerts',
    'https://[::ffff:c0a8:1]/seo-alerts',
  ])('rejects IPv4-mapped IPv6 webhook URL %s at delivery time', async (webhookUrl) => {
    setConfig('alert_webhook_url', webhookUrl);

    const result = await sendAlertNotifications(['webhook'], payload);

    expect(result).toEqual({
      deliveredChannels: [],
      deliveryError: 'webhook: Webhook URL must use a public host',
    });
    expect(httpsRequestMock).not.toHaveBeenCalled();
  });

  it('rejects webhook hostnames that resolve to private addresses', async () => {
    lookupMock.mockResolvedValue([{ address: '10.0.0.5', family: 4 }]);
    setConfig('alert_webhook_url', 'https://hooks.example.com/seo-alerts');

    const result = await sendAlertNotifications(['webhook'], payload);

    expect(result).toEqual({
      deliveredChannels: [],
      deliveryError: 'webhook: Webhook URL must use a public host',
    });
    expect(httpsRequestMock).not.toHaveBeenCalled();
  });

  it('pins webhook delivery to the public address validated before the request', async () => {
    lookupMock.mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
    setConfig('alert_webhook_url', 'https://hooks.example.com/seo-alerts');

    const result = await sendAlertNotifications(['webhook'], payload);

    expect(result).toEqual({ deliveredChannels: ['webhook'], deliveryError: null });
    const options = httpsRequestMock.mock.calls[0][0] as { lookup: PinnedLookup };
    const lookupCallback = vi.fn();
    options.lookup('hooks.example.com', {}, lookupCallback);
    expect(lookupCallback).toHaveBeenCalledWith(null, '93.184.216.34', 4);
  });
});
