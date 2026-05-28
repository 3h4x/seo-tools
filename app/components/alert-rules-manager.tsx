'use client';

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Badge, FormButton, FormInput, FormSelect, Notice, Skeleton, Spinner, TextButton, ToggleButtonGroup } from '@/components/ui';
import { formatNetworkError, getMutationResult } from '@/lib/request-result';
import type { AlertChannel, AlertMetric, AlertRule } from '@/lib/db';
import type { Site } from '@/lib/sites';
import { DataTable, type DataTableColumn } from './data-table';

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

const CHANNEL_OPTIONS: Array<{ value: AlertChannel; label: string }> = [
  { value: 'email', label: 'email' },
  { value: 'webhook', label: 'webhook' },
];

export function isMetricBlockedBySite(metric: AlertMetric, site: Pick<Site, 'searchConsole'> | undefined): boolean {
  if (!site) return false;
  if (metric !== 'sc_clicks') return false;
  return site.searchConsole === false;
}

const METRIC_DISABLED_REASONS: Partial<Record<AlertMetric, string>> = {
  sc_clicks: 'Search Console disabled — rule will not fire',
};

const ALERT_RULE_COLUMNS: DataTableColumn[] = [
  {
    label: 'Site',
    rowHeader: true,
    className: 'py-2 pr-4 font-medium',
    cellClassName: 'py-2 pr-4 font-normal text-left text-white',
  },
  {
    label: 'Metric',
    className: 'py-2 pr-4 font-medium',
    cellClassName: 'py-2 pr-4 text-neutral-300',
  },
  {
    label: 'Threshold',
    className: 'py-2 pr-4 font-medium',
    cellClassName: 'py-2 pr-4 text-neutral-300',
  },
  {
    label: 'Channels',
    className: 'py-2 pr-4 font-medium',
    cellClassName: 'py-2 pr-4 text-neutral-400',
  },
  {
    label: <span className="sr-only">Actions</span>,
    key: 'actions',
    className: 'py-2 font-medium',
    cellClassName: 'py-2',
  },
];

const ALERT_RULE_ERROR_MESSAGES: Record<string, string> = {
  failed_to_load_alert_rules: 'Could not load alert rules. Check server logs.',
  failed_to_load_sites: 'Could not load managed sites. Check server logs.',
  failed_to_save_alert_rule: 'Could not save alert rule. Check server logs.',
  delete_failed: 'Could not delete alert rule. Check server logs.',
};

function emptyForm(siteId: string): FormState {
  return {
    siteId,
    metric: 'sc_clicks',
    thresholdPct: '25',
    channels: ['email'],
  };
}

export function formatAlertRuleError(error: string | undefined, fallback: string): string {
  if (!error) return fallback;
  return ALERT_RULE_ERROR_MESSAGES[error] ?? error;
}

export async function readAlertRulesResponse(res: Response): Promise<AlertRule[]> {
  let payload: unknown = null;
  try {
    payload = await res.json();
  } catch {
    if (!res.ok) {
      throw new Error(`Failed to load alert rules (${res.status})`);
    }
    throw new Error('Alert rules response was invalid');
  }
  if (!res.ok) {
    const error = payload && typeof payload === 'object' && typeof (payload as { error?: unknown }).error === 'string'
      ? (payload as { error: string }).error
      : undefined;
    throw new Error(formatAlertRuleError(error, `Failed to load alert rules (${res.status})`));
  }
  if (!payload || typeof payload !== 'object' || !Array.isArray((payload as { rules?: unknown }).rules)) {
    throw new Error('Alert rules response was invalid');
  }
  return (payload as { rules: AlertRule[] }).rules;
}

function AlertRulesSkeleton() {
  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-4 space-y-3" aria-label="Loading alert rules">
      {[...Array(3)].map((_, index) => (
        <div key={index} className="grid gap-3 md:grid-cols-[1.2fr_1fr_1fr_1fr_4rem]">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-4 w-16" />
        </div>
      ))}
    </div>
  );
}

export default function AlertRulesManager({ sites }: { sites: Site[] }) {
  const [rules, setRules] = useState<AlertRule[]>([]);
  const [form, setForm] = useState<FormState>(emptyForm(sites[0]?.id ?? ''));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const formSite = sites.find((entry) => entry.id === form.siteId);
  const formMetricBlocked = isMetricBlockedBySite(form.metric, formSite);

  const loadRules = useCallback(async () => {
    setRules(await readAlertRulesResponse(await fetch('/api/alerts/rules')));
  }, []);

  useEffect(() => {
    loadRules()
      .catch((err) => {
        console.error('[AlertRulesManager] load:', err);
        setError(formatNetworkError(err, 'Failed to load alert rules'));
      })
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
        setError(formatAlertRuleError(result.error, 'Save failed'));
        return;
      }

      await loadRules();
      resetForm();
    } catch (err) {
      console.error('[AlertRulesManager] save:', err);
      setError(formatNetworkError(err, 'Save failed'));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: number) {
    setError('');
    try {
      const res = await fetch(`/api/alerts/rules?id=${id}`, { method: 'DELETE' });
      const result = await getMutationResult(res, 'Delete failed');
      if (!result.ok) {
        setError(formatAlertRuleError(result.error, 'Delete failed'));
        return;
      }
      await loadRules();
    } catch (err) {
      console.error('[AlertRulesManager] delete:', err);
      setError(formatNetworkError(err, 'Delete failed'));
    }
  }

  if (sites.length === 0) {
    return (
      <div className="space-y-2 max-w-4xl">
        <h2 className="text-lg font-semibold text-white">Alert Rules</h2>
        <p className="text-sm text-neutral-500">Add managed sites first, then create per-site alert thresholds here.</p>
      </div>
    );
  }

  const ruleRows: ReactNode[][] = [];
  const ruleRowKeys: number[] = [];

  for (const rule of rules) {
    const site = sites.find((entry) => entry.id === rule.siteId);
    const metricBlocked = isMetricBlockedBySite(rule.metric, site);

    ruleRowKeys.push(rule.id);
    ruleRows.push([
      site?.name ?? rule.siteId,
      <div key="metric" className="flex flex-wrap items-center gap-2">
        <span>{METRIC_OPTIONS.find((option) => option.value === rule.metric)?.label ?? rule.metric}</span>
        {metricBlocked && (
          <Badge className="border-amber-500/40 bg-amber-500/10 text-amber-300">
            {METRIC_DISABLED_REASONS[rule.metric] ?? 'Inactive'}
          </Badge>
        )}
      </div>,
      `${rule.thresholdPct}% drop`,
      rule.channels.join(', '),
      <div key="actions" className="flex gap-2">
        <TextButton
          onClick={() => setForm({
            id: rule.id,
            siteId: rule.siteId,
            metric: rule.metric,
            thresholdPct: String(rule.thresholdPct),
            channels: rule.channels,
          })}
        >
          Edit
        </TextButton>
        <TextButton
          variant="danger"
          onClick={() => void handleDelete(rule.id)}
        >
          Delete
        </TextButton>
      </div>,
    ]);
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h2 className="text-lg font-semibold text-white">Alert Rules</h2>
        <p className="mt-1 text-xs text-neutral-500">Rules fire when the latest snapshot drops by the configured percentage versus the prior snapshot for that site and metric.</p>
      </div>

      {loading ? (
        <AlertRulesSkeleton />
      ) : rules.length === 0 ? (
        <Notice size="sm">No rules yet.</Notice>
      ) : (
        <DataTable
          caption="Configured alert rules"
          columns={ALERT_RULE_COLUMNS}
          rows={ruleRows}
          rowKeys={ruleRowKeys}
          monospaceCells={false}
          containerClassName="overflow-x-auto"
          tableClassName="w-full text-sm text-left"
          headRowClassName="text-neutral-500 border-b border-neutral-800"
          bodyClassName=""
          rowClassName="border-b border-neutral-900"
        />
      )}

      <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-4 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-white">{form.id ? 'Edit rule' : 'New rule'}</h3>
          {form.id && (
            <TextButton variant="quiet" onClick={resetForm}>
              Cancel
            </TextButton>
          )}
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <FormSelect
            tone="dense"
            padding="dense"
            aria-label="Alert site"
            value={form.siteId}
            onChange={(e) => setForm((current) => ({ ...current, siteId: e.target.value }))}
          >
            {sites.map((site) => (
              <option key={site.id} value={site.id}>{site.name}</option>
            ))}
          </FormSelect>
          <FormSelect
            tone="dense"
            padding="dense"
            aria-label="Alert metric"
            value={form.metric}
            onChange={(e) => setForm((current) => ({ ...current, metric: e.target.value as AlertMetric }))}
          >
            {METRIC_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </FormSelect>
          <FormInput
            tone="dense"
            padding="dense"
            type="number"
            min={1}
            max={100}
            aria-label="Drop threshold percent"
            value={form.thresholdPct}
            onChange={(e) => setForm((current) => ({ ...current, thresholdPct: e.target.value }))}
          />
        </div>

        <ToggleButtonGroup
          ariaLabel="Alert channels"
          options={CHANNEL_OPTIONS}
          activeValues={new Set(form.channels)}
          onToggle={toggleChannel}
        />

        {formMetricBlocked && (
          <Notice tone="warning" size="sm">
            Search Console is disabled for this site. Choose GA4 sessions or re-enable Search Console before saving this rule.
          </Notice>
        )}

        {error && (
          <Notice tone="danger" size="sm" role="alert">
            {error}
          </Notice>
        )}

        <FormButton
          variant="primary"
          onClick={() => void handleSave()}
          disabled={saving || formMetricBlocked}
        >
          {saving && <Spinner />}
          {saving ? 'Saving…' : form.id ? 'Update rule' : 'Create rule'}
        </FormButton>
      </div>
    </div>
  );
}
