'use client';

import { useCallback, useEffect, useState } from 'react';
import { getMutationResult } from '@/lib/request-result';
import type { AlertChannel, AlertMetric, AlertRule } from '@/lib/db';
import type { Site } from '@/lib/sites';

type FormState = {
  id?: number;
  siteId: string;
  metric: AlertMetric;
  thresholdPct: string;
  channels: AlertChannel[];
};

const METRIC_OPTIONS: Array<{ value: AlertMetric; label: string }> = [
  { value: 'sc_clicks', label: 'SC clicks' },
  { value: 'ga4_sessions', label: 'GA4 sessions' },
];

const INPUT_CLS = 'w-full bg-neutral-800 border border-neutral-700 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-neutral-500';

function emptyForm(siteId: string): FormState {
  return {
    siteId,
    metric: 'sc_clicks',
    thresholdPct: '25',
    channels: ['email'],
  };
}

export default function AlertRulesManager({ sites }: { sites: Site[] }) {
  const [rules, setRules] = useState<AlertRule[]>([]);
  const [form, setForm] = useState<FormState>(emptyForm(sites[0]?.id ?? ''));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const loadRules = useCallback(async () => {
    const res = await fetch('/api/alerts/rules');
    const data = await res.json() as { rules: AlertRule[] };
    setRules(data.rules);
  }, []);

  useEffect(() => {
    loadRules()
      .catch(() => setError('Failed to load alert rules'))
      .finally(() => setLoading(false));
  }, [loadRules]);

  function resetForm() {
    setForm(emptyForm(sites[0]?.id ?? ''));
    setError('');
  }

  function toggleChannel(channel: AlertChannel) {
    setForm((current) => ({
      ...current,
      channels: current.channels.includes(channel)
        ? current.channels.filter((value) => value !== channel)
        : [...current.channels, channel],
    }));
  }

  async function handleSave() {
    setSaving(true);
    setError('');

    try {
      const res = await fetch('/api/alerts/rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          thresholdPct: Number(form.thresholdPct),
        }),
      });
      const result = await getMutationResult(res, 'Save failed');
      if (!result.ok) {
        setError(result.error ?? 'Save failed');
        return;
      }

      await loadRules();
      resetForm();
    } catch {
      setError('Request failed');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: number) {
    const res = await fetch(`/api/alerts/rules?id=${id}`, { method: 'DELETE' });
    const result = await getMutationResult(res, 'Delete failed');
    if (!result.ok) {
      setError(result.error ?? 'Delete failed');
      return;
    }
    await loadRules();
  }

  if (sites.length === 0) {
    return (
      <div className="space-y-2 max-w-4xl">
        <h2 className="text-lg font-semibold text-white">Alert Rules</h2>
        <p className="text-sm text-neutral-500">Add managed sites first, then create per-site alert thresholds here.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h2 className="text-lg font-semibold text-white">Alert Rules</h2>
        <p className="mt-1 text-xs text-neutral-500">Rules fire when the latest snapshot drops by the configured percentage versus the prior snapshot for that site and metric.</p>
      </div>

      {loading ? (
        <p className="text-sm text-neutral-500">Loading rules…</p>
      ) : rules.length === 0 ? (
        <p className="text-sm text-neutral-500">No rules yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead>
              <tr className="text-neutral-500 border-b border-neutral-800">
                <th className="py-2 pr-4 font-medium">Site</th>
                <th className="py-2 pr-4 font-medium">Metric</th>
                <th className="py-2 pr-4 font-medium">Threshold</th>
                <th className="py-2 pr-4 font-medium">Channels</th>
                <th className="py-2 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {rules.map((rule) => {
                const site = sites.find((entry) => entry.id === rule.siteId);
                return (
                  <tr key={rule.id} className="border-b border-neutral-900">
                    <td className="py-2 pr-4 text-white">{site?.name ?? rule.siteId}</td>
                    <td className="py-2 pr-4 text-neutral-300">{METRIC_OPTIONS.find((option) => option.value === rule.metric)?.label ?? rule.metric}</td>
                    <td className="py-2 pr-4 text-neutral-300">{rule.thresholdPct}% drop</td>
                    <td className="py-2 pr-4 text-neutral-400">{rule.channels.join(', ')}</td>
                    <td className="py-2 flex gap-2">
                      <button
                        onClick={() => setForm({
                          id: rule.id,
                          siteId: rule.siteId,
                          metric: rule.metric,
                          thresholdPct: String(rule.thresholdPct),
                          channels: rule.channels,
                        })}
                        className="text-xs text-neutral-400 hover:text-white transition-colors"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => void handleDelete(rule.id)}
                        className="text-xs text-red-400 hover:text-red-300 transition-colors"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-4 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-white">{form.id ? 'Edit rule' : 'New rule'}</h3>
          {form.id && (
            <button onClick={resetForm} className="text-xs text-neutral-500 hover:text-white transition-colors">
              Cancel
            </button>
          )}
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <select
            className={INPUT_CLS}
            value={form.siteId}
            onChange={(e) => setForm((current) => ({ ...current, siteId: e.target.value }))}
          >
            {sites.map((site) => (
              <option key={site.id} value={site.id}>{site.name}</option>
            ))}
          </select>
          <select
            className={INPUT_CLS}
            value={form.metric}
            onChange={(e) => setForm((current) => ({ ...current, metric: e.target.value as AlertMetric }))}
          >
            {METRIC_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
          <input
            type="number"
            min={1}
            max={100}
            className={INPUT_CLS}
            value={form.thresholdPct}
            onChange={(e) => setForm((current) => ({ ...current, thresholdPct: e.target.value }))}
          />
        </div>

        <div className="flex flex-wrap gap-4 text-sm text-neutral-300">
          {(['email', 'webhook'] as AlertChannel[]).map((channel) => (
            <label key={channel} className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.channels.includes(channel)}
                onChange={() => toggleChannel(channel)}
              />
              <span>{channel}</span>
            </label>
          ))}
        </div>

        {error && <p className="text-sm text-red-400">{error}</p>}

        <button
          onClick={() => void handleSave()}
          disabled={saving}
          className="px-4 py-2 rounded-md text-sm bg-white text-black hover:bg-neutral-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {saving ? 'Saving…' : form.id ? 'Update rule' : 'Create rule'}
        </button>
      </div>
    </div>
  );
}
