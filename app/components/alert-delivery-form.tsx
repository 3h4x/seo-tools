'use client';

import { useEffect, useState } from 'react';

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
    webhookUrl: string;
    hasResendApiKey: boolean;
  };
  sources: {
    resendApiKey: Source;
    fromEmail: Source;
    toEmail: Source;
    webhookUrl: Source;
  };
};

const INPUT_CLS = 'w-full bg-neutral-900 border border-neutral-700 rounded-md p-2.5 text-sm text-neutral-200 focus:outline-none focus:border-neutral-500';

async function readAlertConfigResponse(res: Response): Promise<AlertConfigResponse> {
  if (!res.ok) {
    throw new Error('load');
  }
  return res.json() as Promise<AlertConfigResponse>;
}

async function loadAlertDeliveryConfig(fetcher: typeof fetch = fetch): Promise<AlertConfigResponse> {
  return readAlertConfigResponse(await fetcher('/api/config/alerts'));
}

export async function clearAlertDeliveryOverrides(fetcher: typeof fetch = fetch): Promise<AlertConfigResponse> {
  const res = await fetcher('/api/config/alerts', { method: 'DELETE' });
  const data = await res.json() as { ok: boolean };
  if (!res.ok || !data.ok) {
    throw new Error('Clear failed');
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
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  function applyConfigResponse(data: AlertConfigResponse) {
    setForm({
      resendApiKey: '',
      fromEmail: data.config.fromEmail,
      toEmail: data.config.toEmail,
      webhookUrl: data.config.webhookUrl,
    });
    setSources(data.sources);
    setHasResendApiKey(data.config.hasResendApiKey);
  }

  useEffect(() => {
    loadAlertDeliveryConfig()
      .then(applyConfigResponse)
      .catch(() => {
        setError('Failed to load alert delivery config');
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
      const data = await res.json() as { ok: boolean; error?: string };
      if (!data.ok) {
        setError(data.error ?? 'Save failed');
        return;
      }
      setSuccess('Alert delivery config saved');
      applyConfigResponse(await loadAlertDeliveryConfig());
    } catch {
      setError('Request failed');
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
    } catch {
      setError('Request failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="flex items-center gap-3">
        <h2 className="text-base font-semibold text-white">Alert Delivery</h2>
        {sources && (
          <span className="text-xs px-2 py-0.5 rounded bg-neutral-800 text-neutral-400">
            Email key: {sources.resendApiKey}
          </span>
        )}
      </div>
      <p className="text-xs text-neutral-500">
        Email uses Resend&apos;s HTTP API. Store the API key, sender, recipients, and optional webhook target here so alert rules can deliver after snapshots complete.
      </p>

      {hasResendApiKey && !form.resendApiKey && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-neutral-900 border border-neutral-700 text-sm text-neutral-400">
          <span className="text-green-500">●</span>
          Resend key configured
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-2">
        <input
          type="password"
          className={`${INPUT_CLS} font-mono`}
          placeholder="re_..."
          value={form.resendApiKey}
          onChange={(e) => { setForm((current) => ({ ...current, resendApiKey: e.target.value })); setError(''); setSuccess(''); }}
          autoComplete="off"
          spellCheck={false}
        />
        <input
          type="email"
          className={INPUT_CLS}
          placeholder="alerts@example.com"
          value={form.fromEmail}
          onChange={(e) => { setForm((current) => ({ ...current, fromEmail: e.target.value })); setError(''); setSuccess(''); }}
        />
        <textarea
          className={`${INPUT_CLS} md:col-span-2 min-h-24`}
          placeholder="ops@example.com, seo@example.com"
          value={form.toEmail}
          onChange={(e) => { setForm((current) => ({ ...current, toEmail: e.target.value })); setError(''); setSuccess(''); }}
        />
        <input
          type="url"
          className={`${INPUT_CLS} md:col-span-2 font-mono`}
          placeholder="https://hooks.example.com/seo-alerts"
          value={form.webhookUrl}
          onChange={(e) => { setForm((current) => ({ ...current, webhookUrl: e.target.value })); setError(''); setSuccess(''); }}
        />
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}
      {success && <p className="text-sm text-emerald-400">{success}</p>}

      <div className="flex gap-2 flex-wrap">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-4 py-2 rounded-md text-sm bg-white text-black hover:bg-neutral-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button
          onClick={handleClear}
          disabled={saving}
          className="px-4 py-2 rounded-md text-sm bg-neutral-800 text-red-400 hover:bg-neutral-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          Clear DB overrides
        </button>
      </div>
    </div>
  );
}
