'use client';

import { useState } from 'react';
import { Badge, ConfiguredNotice, FormButton, FormTextarea } from '@/components/ui';
import { formatConfigMutationError, formatNetworkError, getMutationResult } from '@/lib/request-result';

type Source = 'db' | 'env' | 'none';

interface Props {
  source: Source;
}

type TestState = 'idle' | 'testing' | 'ok' | 'error';

export default function ConfigForm({ source: initialSource }: Props) {
  const [input, setInput] = useState('');
  const [source] = useState<Source>(initialSource);
  const [testState, setTestState] = useState<TestState>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);

  const hasKey = source !== 'none';
  const canTest = input.trim().length > 0;
  const canSave = testState === 'ok';

  async function handleTest() {
    try {
      JSON.parse(input);
    } catch {
      setTestState('error');
      setErrorMsg('Invalid JSON');
      return;
    }

    setTestState('testing');
    setErrorMsg('');
    try {
      const res = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: input, testOnly: true }),
      });
      const result = await getMutationResult(res, 'Connection failed');
      if (result.ok) {
        setTestState('ok');
      } else {
        setTestState('error');
        setErrorMsg(formatConfigMutationError(result.error, 'Connection failed'));
      }
    } catch (error) {
      console.error('[ConfigForm] test:', error);
      setTestState('error');
      setErrorMsg(formatNetworkError(error));
    }
  }

  async function handleSave() {
    setSaving(true);
    setErrorMsg('');
    try {
      const res = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: input, testOnly: false }),
      });
      const result = await getMutationResult(res, 'Save failed');
      if (result.ok) {
        window.location.reload();
        return;
      }
      setTestState('error');
      setErrorMsg(formatConfigMutationError(result.error, 'Save failed'));
    } catch (error) {
      console.error('[ConfigForm] save:', error);
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
      const res = await fetch('/api/config', { method: 'DELETE' });
      const result = await getMutationResult(res, 'Remove failed');
      if (result.ok) {
        window.location.reload();
        return;
      }
      setTestState('error');
      setErrorMsg(formatConfigMutationError(result.error, 'Remove failed'));
    } catch (error) {
      console.error('[ConfigForm] remove:', error);
      setTestState('error');
      setErrorMsg(formatNetworkError(error));
    } finally {
      setRemoving(false);
    }
  }

  const sourceBadge: Record<Source, string | null> = {
    db: 'Source: database',
    env: 'Source: environment variable',
    none: null,
  };

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="flex items-center gap-3">
        <h1 className="text-lg font-semibold text-white">Google Service Account Key</h1>
        {sourceBadge[source] && (
          <Badge size="compact" shape="rounded" className="border-neutral-700 bg-neutral-800 text-neutral-400">
            {sourceBadge[source]}
          </Badge>
        )}
      </div>

      {hasKey && !input && (
        <ConfiguredNotice>
          Key configured — paste a new key below to replace it
        </ConfiguredNotice>
      )}

      <div className="space-y-1">
        <label htmlFor="google-sa-key-json" className="text-xs text-neutral-400">Service account JSON</label>
        <FormTextarea
          id="google-sa-key-json"
          className="h-48 resize-y"
          monospace
          padding="roomy"
          placeholder={'{\n  "type": "service_account",\n  "project_id": "...",\n  "private_key": "...",\n  "client_email": "..."\n}'}
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            setTestState('idle');
            setErrorMsg('');
          }}
          spellCheck={false}
        />
      </div>

      {testState === 'ok' && (
        <p className="text-sm text-green-400" role="status">Connection OK</p>
      )}
      {testState === 'error' && (
        <p className="text-sm text-red-400" role="alert">{errorMsg}</p>
      )}

      <div className="flex gap-2 flex-wrap">
        <FormButton
          onClick={handleTest}
          disabled={!canTest || testState === 'testing'}
        >
          {testState === 'testing' ? 'Testing…' : 'Test Connection'}
        </FormButton>

        <FormButton
          onClick={handleSave}
          disabled={!canSave || saving}
          variant="primary"
        >
          {saving ? 'Saving…' : source === 'env' ? 'Override with DB key' : 'Save'}
        </FormButton>

        {source === 'db' && (
          <FormButton
            onClick={handleRemove}
            disabled={removing}
            variant="danger"
          >
            {removing ? 'Removing…' : 'Remove'}
          </FormButton>
        )}
      </div>

      <p className="text-xs text-neutral-500">
        Paste the full service account JSON. Click <strong>Test Connection</strong> to verify before saving.
        {source === 'db' && ' The DB key overrides the environment variable.'}
        {source === 'env' && ' Saving will store the key in SQLite and take priority over the env var.'}
      </p>
    </div>
  );
}
