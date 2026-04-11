'use client';

import { useState } from 'react';

type Source = 'db' | 'env' | 'none';

interface Props {
  source: Source;
}

type TestState = 'idle' | 'testing' | 'ok' | 'error';

export default function ConfigForm({ source: initialSource }: Props) {
  const [input, setInput] = useState('');
  const [source, setSource] = useState<Source>(initialSource);
  const [testState, setTestState] = useState<TestState>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [saving, setSaving] = useState(false);

  const hasKey = source !== 'none';
  const canTest = input.trim().length > 0;
  const canSave = testState === 'ok';

  async function handleTest() {
    let parsed: unknown;
    try {
      parsed = JSON.parse(input);
      void parsed;
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
      const data = await res.json() as { ok: boolean; error?: string };
      if (data.ok) {
        setTestState('ok');
      } else {
        setTestState('error');
        setErrorMsg(data.error ?? 'Connection failed');
      }
    } catch {
      setTestState('error');
      setErrorMsg('Request failed — check console');
    }
  }

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: input, testOnly: false }),
      });
      const data = await res.json() as { ok: boolean; error?: string };
      if (data.ok) {
        window.location.reload();
      } else {
        setTestState('error');
        setErrorMsg(data.error ?? 'Save failed');
      }
    } catch {
      setTestState('error');
      setErrorMsg('Request failed — check console');
    } finally {
      setSaving(false);
    }
  }

  async function handleRemove() {
    const res = await fetch('/api/config', { method: 'DELETE' });
    const data = await res.json() as { ok: boolean };
    if (data.ok) {
      window.location.reload();
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
          <span className="text-xs px-2 py-0.5 rounded bg-neutral-800 text-neutral-400">
            {sourceBadge[source]}
          </span>
        )}
      </div>

      {hasKey && !input && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-neutral-900 border border-neutral-700 text-sm text-neutral-400">
          <span className="text-green-500">●</span>
          Key configured — paste a new key below to replace it
        </div>
      )}

      <textarea
        className="w-full h-48 bg-neutral-900 border border-neutral-700 rounded-md p-3 text-sm font-mono text-neutral-200 focus:outline-none focus:border-neutral-500 resize-y"
        placeholder={'{\n  "type": "service_account",\n  "project_id": "...",\n  "private_key": "...",\n  "client_email": "..."\n}'}
        value={input}
        onChange={(e) => {
          setInput(e.target.value);
          setTestState('idle');
          setErrorMsg('');
        }}
        spellCheck={false}
      />

      {testState === 'ok' && (
        <p className="text-sm text-green-400">Connection OK</p>
      )}
      {testState === 'error' && (
        <p className="text-sm text-red-400">{errorMsg}</p>
      )}

      <div className="flex gap-2 flex-wrap">
        <button
          onClick={handleTest}
          disabled={!canTest || testState === 'testing'}
          className="px-4 py-2 rounded-md text-sm bg-neutral-800 text-white hover:bg-neutral-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {testState === 'testing' ? 'Testing…' : 'Test Connection'}
        </button>

        <button
          onClick={handleSave}
          disabled={!canSave || saving}
          className="px-4 py-2 rounded-md text-sm bg-white text-black hover:bg-neutral-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {saving ? 'Saving…' : source === 'env' ? 'Override with DB key' : 'Save'}
        </button>

        {source === 'db' && (
          <button
            onClick={handleRemove}
            className="px-4 py-2 rounded-md text-sm bg-neutral-800 text-red-400 hover:bg-neutral-700 transition-colors"
          >
            Remove
          </button>
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
