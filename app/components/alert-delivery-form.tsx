'use client';

import { useEffect, useState } from 'react';
import { Badge, ConfiguredNotice, FormButton, FormInput, FormTextarea } from '@/components/ui';
import { formatNetworkError, getMutationResult } from '@/lib/request-result';

type Source = 'db' | 'env' | 'none';

type FormState = {
  resendApiKey: string;
  fromEmail: string;
  toEmail: string;
  webhookUrl: string;
};

export type AlertConfigResponse = {
  config: {
    fromEmail: string;
    toEmail: string;
    hasResendApiKey: boolean;
    hasWebhookUrl: boolean;
  };
  sources: {
    resendApiKey: Source;
    fromEmail: Source;
    toEmail: Source;
    webhookUrl: Source;
  };
};

const ALERT_CONFIG_ERROR_MESSAGES: Record<string, string> = {
  failed_to_load_alert_config: 'Could not load alert delivery config. Check server logs.',
  failed_to_save_alert_config: 'Could not save alert delivery config. Check server logs.',
  failed_to_clear_alert_config: 'Could not clear alert delivery config. Check server logs.',
};

export function formatAlertConfigError(error: string | undefined, fallback: string): string {
  if (!error) return fallback;
  return ALERT_CONFIG_ERROR_MESSAGES[error] ?? error;
}

function isAlertConfigResponse(value: unknown): value is AlertConfigResponse {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<AlertConfigResponse>;
  return (
    !!candidate.config &&
    typeof candidate.config === 'object' &&
    !!candidate.sources &&
    typeof candidate.sources === 'object'
  );
}

export async function readAlertConfigResponse(res: Response): Promise<AlertConfigResponse> {
  let payload: unknown = null;
  try {
    payload = await res.json();
  } catch {
    payload = null;
  }
  if (!res.ok) {
    const rawError = (payload && typeof payload === 'object' && 'error' in payload && typeof (payload as { error?: unknown }).error === 'string')
      ? (payload as { error: string }).error
      : undefined;
    throw new Error(formatAlertConfigError(rawError, `Alert config request failed (${res.status})`));
  }
  if (!isAlertConfigResponse(payload)) {
    throw new Error('Alert config response was invalid');
  }
  return payload;
}

async function loadAlertDeliveryConfig(fetcher: typeof fetch = fetch): Promise<AlertConfigResponse> {
  return readAlertConfigResponse(await fetcher('/api/config/alerts'));
}

export async function clearAlertDeliveryOverrides(fetcher: typeof fetch = fetch): Promise<AlertConfigResponse> {
  const res = await fetcher('/api/config/alerts', { method: 'DELETE' });
  const result = await getMutationResult(res, 'Clear failed');
  if (!result.ok) {
    throw new Error(formatAlertConfigError(result.error, 'Clear failed'));
  }

  return loadAlertDeliveryConfig(fetcher);
}

export default function AlertDeliveryForm() {
  const [form, setForm] = useState<FormState>({
    resendApiKey: '',
    fromEmail: '',
    toEmail: '',
    webhookUrl: '',
  });
  const [sources, setSources] = useState<AlertConfigResponse['sources'] | null>(null);
  const [hasResendApiKey, setHasResendApiKey] = useState(false);
  const [hasWebhookUrl, setHasWebhookUrl] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  function applyConfigResponse(data: AlertConfigResponse) {
    setForm({
      resendApiKey: '',
      fromEmail: data.config.fromEmail,
      toEmail: data.config.toEmail,
      webhookUrl: '',
    });
    setSources(data.sources);
    setHasResendApiKey(data.config.hasResendApiKey);
    setHasWebhookUrl(data.config.hasWebhookUrl);
  }

  useEffect(() => {
    loadAlertDeliveryConfig()
      .then(applyConfigResponse)
      .catch((err) => {
        console.error('[AlertDeliveryForm] load:', err);
        setError(formatNetworkError(err, 'Failed to load alert delivery config'));
      });
  }, []);

  async function handleSave() {
    setSaving(true);
    setError('');
    setSuccess('');

    try {
      const res = await fetch('/api/config/alerts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const result = await getMutationResult(res, 'Save failed');
      if (!result.ok) {
        setError(formatAlertConfigError(result.error, 'Save failed'));
        return;
      }
      setSuccess('Alert delivery config saved');
      applyConfigResponse(await loadAlertDeliveryConfig());
    } catch (err) {
      console.error('[AlertDeliveryForm] save:', err);
      setError(formatNetworkError(err, 'Request failed'));
    } finally {
      setSaving(false);
    }
  }

  async function handleClear() {
    setSaving(true);
    setError('');
    setSuccess('');

    try {
      applyConfigResponse(await clearAlertDeliveryOverrides());
      setSuccess('Alert delivery config cleared');
    } catch (err) {
      console.error('[AlertDeliveryForm] clear:', err);
      setError(formatNetworkError(err, 'Request failed'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="flex items-center gap-3">
        <h2 className="text-base font-semibold text-white">Alert Delivery</h2>
        {sources && (
          <Badge size="compact" shape="rounded" className="border-neutral-700 bg-neutral-800 text-neutral-400">
            Email key: {sources.resendApiKey}
          </Badge>
        )}
      </div>
      <p className="text-xs text-neutral-500">
        Email uses Resend&apos;s HTTP API. Store the API key, sender, recipients, and optional webhook target here so alert rules can deliver after snapshots complete.
      </p>

      {hasResendApiKey && !form.resendApiKey && (
        <ConfiguredNotice>
          Resend key configured
        </ConfiguredNotice>
      )}

      {hasWebhookUrl && !form.webhookUrl && (
        <ConfiguredNotice>
          Webhook URL configured
        </ConfiguredNotice>
      )}

      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-1">
          <label htmlFor="alert-resend-api-key" className="text-xs text-neutral-400">Resend API key</label>
          <FormInput
            id="alert-resend-api-key"
            type="password"
            monospace
            placeholder="re_..."
            value={form.resendApiKey}
            onChange={(e) => { setForm((current) => ({ ...current, resendApiKey: e.target.value })); setError(''); setSuccess(''); }}
            autoComplete="off"
            spellCheck={false}
          />
        </div>
        <div className="space-y-1">
          <label htmlFor="alert-from-email" className="text-xs text-neutral-400">Sender email</label>
          <FormInput
            id="alert-from-email"
            type="email"
            placeholder="alerts@example.com"
            value={form.fromEmail}
            onChange={(e) => { setForm((current) => ({ ...current, fromEmail: e.target.value })); setError(''); setSuccess(''); }}
          />
        </div>
        <div className="space-y-1 md:col-span-2">
          <label htmlFor="alert-to-email" className="text-xs text-neutral-400">Recipient emails</label>
          <FormTextarea
            id="alert-to-email"
            className="min-h-24"
            placeholder="ops@example.com, seo@example.com"
            value={form.toEmail}
            onChange={(e) => { setForm((current) => ({ ...current, toEmail: e.target.value })); setError(''); setSuccess(''); }}
          />
        </div>
        <div className="space-y-1 md:col-span-2">
          <label htmlFor="alert-webhook-url" className="text-xs text-neutral-400">Webhook URL</label>
          <FormInput
            id="alert-webhook-url"
            type="url"
            monospace
            placeholder="https://hooks.example.com/seo-alerts"
            value={form.webhookUrl}
            onChange={(e) => { setForm((current) => ({ ...current, webhookUrl: e.target.value })); setError(''); setSuccess(''); }}
          />
        </div>
      </div>

      {error && <p className="text-sm text-red-400" role="alert">{error}</p>}
      {success && <p className="text-sm text-emerald-400" role="status">{success}</p>}

      <div className="flex gap-2 flex-wrap">
        <FormButton
          variant="primary"
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? 'Saving…' : 'Save'}
        </FormButton>
        <FormButton
          variant="danger"
          onClick={handleClear}
          disabled={saving}
        >
          Clear DB overrides
        </FormButton>
      </div>
    </div>
  );
}
