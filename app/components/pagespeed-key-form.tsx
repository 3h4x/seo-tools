'use client';

import { useEffect, useState } from 'react';
import { Badge, ConfiguredNotice, FormButton, FormInput, Notice, Skeleton, Spinner } from '@/components/ui';
import { formatConfigMutationError, formatNetworkError, getMutationResult } from '@/lib/request-result';

type Source = 'db' | 'env' | 'none';
type TestState = 'idle' | 'testing' | 'ok' | 'error';

type PagespeedConfigResponse = {
  source?: Source;
  error?: string;
};

function isSource(value: unknown): value is Source {
  return value === 'db' || value === 'env' || value === 'none';
}

const SOURCE_LABEL: Record<Source, string | null> = {
  db: 'Source: database',
  env: 'Source: environment variable',
  none: null,
};

export async function readPagespeedConfigResponse(response: Response): Promise<Source> {
  let payload: PagespeedConfigResponse | null = null;

  try {
    payload = await response.json() as PagespeedConfigResponse;
  } catch {
    payload = null;
  }

  if (!response.ok) {
    throw new Error(formatConfigMutationError(payload?.error, `PageSpeed config request failed (${response.status})`));
  }

  if (!isSource(payload?.source)) {
    throw new Error('PageSpeed config response was invalid');
  }

  return payload.source;
}

function PagespeedKeyFormSkeleton() {
  return (
    <div className="space-y-3 max-w-2xl" aria-label="Loading PageSpeed config">
      <div className="flex items-center gap-3">
        <Skeleton className="h-5 w-56" />
        <Skeleton className="h-5 w-28 rounded-full" />
      </div>
      <Skeleton className="h-4 w-full max-w-xl" />
      <Skeleton className="h-11 w-full" />
      <div className="flex gap-2">
        <Skeleton className="h-9 w-16" />
        <Skeleton className="h-9 w-28" />
      </div>
    </div>
  );
}

export default function PagespeedKeyForm() {
  const [source, setSource] = useState<Source>('none');
  const [input, setInput] = useState('');
  const [testState, setTestState] = useState<TestState>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/config/pagespeed')
      .then(readPagespeedConfigResponse)
      .then((nextSource) => { setSource(nextSource); })
      .catch((error) => {
        console.error('[PagespeedKeyForm] load:', error);
        setErrorMsg(formatNetworkError(error, 'Failed to load PageSpeed config'));
        setTestState('error');
      })
      .finally(() => setLoading(false));
  }, []);

  async function handleTest() {
    if (!input.trim()) return;
    setTestState('testing');
    setErrorMsg('');
    try {
      const res = await fetch('/api/config/pagespeed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: input, testOnly: true }),
      });
      const result = await getMutationResult(res, 'Test failed');
      if (result.ok) setTestState('ok');
      else { setTestState('error'); setErrorMsg(formatConfigMutationError(result.error, 'Test failed')); }
    } catch (error) {
      console.error('[PagespeedKeyForm] test:', error);
      setTestState('error');
      setErrorMsg(formatNetworkError(error));
    }
  }

  async function handleSave() {
    setSaving(true);
    setErrorMsg('');
    try {
      const res = await fetch('/api/config/pagespeed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: input, testOnly: false }),
      });
      const result = await getMutationResult(res, 'Save failed');
      if (result.ok) window.location.reload();
      else { setTestState('error'); setErrorMsg(formatConfigMutationError(result.error, 'Save failed')); }
    } catch (error) {
      console.error('[PagespeedKeyForm] save:', error);
      setTestState('error');
      setErrorMsg(formatNetworkError(error));
    } finally {
      setSaving(false);
    }
  }

  async function handleRemove() {
    setRemoving(true);
    setErrorMsg('');
    try {
      const res = await fetch('/api/config/pagespeed', { method: 'DELETE' });
      const result = await getMutationResult(res, 'Remove failed');
      if (result.ok) window.location.reload();
      else { setTestState('error'); setErrorMsg(formatConfigMutationError(result.error, 'Remove failed')); }
    } catch (error) {
      console.error('[PagespeedKeyForm] remove:', error);
      setTestState('error');
      setErrorMsg(formatNetworkError(error));
    } finally {
      setRemoving(false);
    }
  }

  if (loading) return <PagespeedKeyFormSkeleton />;
  const hasKey = source !== 'none';

  return (
    <div className="space-y-3 max-w-2xl">
      <div className="flex items-center gap-3">
        <h2 className="text-base font-semibold text-white">PageSpeed Insights API Key</h2>
        {SOURCE_LABEL[source] && (
          <Badge size="compact" shape="rounded" className="border-neutral-700 bg-neutral-800 text-neutral-400">
            {SOURCE_LABEL[source]}
          </Badge>
        )}
      </div>
      <p className="text-xs text-neutral-500">
        Optional. Lifts the unauthenticated rate limit for the Performance tab&apos;s lab + CrUX field
        data. Get one free at <span className="font-mono">console.cloud.google.com</span> {'\u2192'} enable
        {' '}&quot;PageSpeed Insights API&quot; {'\u2192'} Credentials.
      </p>

      {hasKey && !input && (
        <ConfiguredNotice>
          Key configured — paste a new key below to replace it
        </ConfiguredNotice>
      )}

      <div className="space-y-1">
        <label htmlFor="pagespeed-api-key" className="text-xs text-neutral-400">PageSpeed API key</label>
        <FormInput
          id="pagespeed-api-key"
          type="password"
          monospace
          placeholder="AIzaSy..."
          value={input}
          onChange={(e) => { setInput(e.target.value); setTestState('idle'); setErrorMsg(''); }}
          spellCheck={false}
          autoComplete="off"
        />
      </div>

      {testState === 'ok' && (
        <Notice tone="success" size="sm" role="status">
          Key works
        </Notice>
      )}
      {testState === 'error' && (
        <Notice tone="danger" size="sm" role="alert">
          {errorMsg}
        </Notice>
      )}

      <div className="flex gap-2 flex-wrap">
        <FormButton
          onClick={handleTest}
          disabled={!input.trim() || testState === 'testing'}
          hasIcon={testState === 'testing'}
        >
          {testState === 'testing' && <Spinner />}
          {testState === 'testing' ? 'Testing…' : 'Test'}
        </FormButton>
        <FormButton
          onClick={handleSave}
          disabled={testState !== 'ok' || saving}
          hasIcon={saving}
          variant="primary"
        >
          {saving && <Spinner />}
          {saving ? 'Saving…' : source === 'env' ? 'Override with DB key' : 'Save'}
        </FormButton>
        {source === 'db' && (
          <FormButton
            onClick={handleRemove}
            disabled={removing}
            hasIcon={removing}
            variant="danger"
          >
            {removing && <Spinner />}
            {removing ? 'Removing…' : 'Remove'}
          </FormButton>
        )}
      </div>
    </div>
  );
}
