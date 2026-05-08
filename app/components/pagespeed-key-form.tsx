'use client';

import { useEffect, useState } from 'react';

type Source = 'db' | 'env' | 'none';
type TestState = 'idle' | 'testing' | 'ok' | 'error';

export default function PagespeedKeyForm() {
  const [source, setSource] = useState<Source>('none');
  const [input, setInput] = useState('');
  const [testState, setTestState] = useState<TestState>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/config/pagespeed')
      .then(r => r.json() as Promise<{ source: Source }>)
      .then(d => { setSource(d.source); setLoading(false); })
      .catch(() => setLoading(false));
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
      const data = await res.json() as { ok: boolean; error?: string };
      if (data.ok) setTestState('ok');
      else { setTestState('error'); setErrorMsg(data.error ?? 'Test failed'); }
    } catch {
      setTestState('error'); setErrorMsg('Request failed');
    }
  }

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch('/api/config/pagespeed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: input, testOnly: false }),
      });
      const data = await res.json() as { ok: boolean; error?: string };
      if (data.ok) window.location.reload();
      else { setTestState('error'); setErrorMsg(data.error ?? 'Save failed'); }
    } finally {
      setSaving(false);
    }
  }

  async function handleRemove() {
    const res = await fetch('/api/config/pagespeed', { method: 'DELETE' });
    const data = await res.json() as { ok: boolean };
    if (data.ok) window.location.reload();
  }

  if (loading) return null;
  const hasKey = source !== 'none';
  const sourceLabel: Record<Source, string | null> = {
    db: 'Source: database',
    env: 'Source: environment variable',
    none: null,
  };

  return (
    <div className="space-y-3 max-w-2xl">
      <div className="flex items-center gap-3">
        <h2 className="text-base font-semibold text-white">PageSpeed Insights API Key</h2>
        {sourceLabel[source] && (
          <span className="text-xs px-2 py-0.5 rounded bg-neutral-800 text-neutral-400">{sourceLabel[source]}</span>
        )}
      </div>
      <p className="text-xs text-neutral-500">
        Optional. Lifts the unauthenticated rate limit for the Performance tab&apos;s lab + CrUX field
        data. Get one free at <span className="font-mono">console.cloud.google.com</span> → enable
        &quot;PageSpeed Insights API&quot; → Credentials.
      </p>

      {hasKey && !input && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-neutral-900 border border-neutral-700 text-sm text-neutral-400">
          <span className="text-green-500">●</span>
          Key configured — paste a new key below to replace it
        </div>
      )}

      <input
        type="password"
        className="w-full bg-neutral-900 border border-neutral-700 rounded-md p-2.5 text-sm font-mono text-neutral-200 focus:outline-none focus:border-neutral-500"
        placeholder="AIzaSy..."
        value={input}
        onChange={(e) => { setInput(e.target.value); setTestState('idle'); setErrorMsg(''); }}
        spellCheck={false}
        autoComplete="off"
      />

      {testState === 'ok' && <p className="text-sm text-green-400">Key works</p>}
      {testState === 'error' && <p className="text-sm text-red-400">{errorMsg}</p>}

      <div className="flex gap-2 flex-wrap">
        <button
          onClick={handleTest}
          disabled={!input.trim() || testState === 'testing'}
          className="px-4 py-2 rounded-md text-sm bg-neutral-800 text-white hover:bg-neutral-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {testState === 'testing' ? 'Testing…' : 'Test'}
        </button>
        <button
          onClick={handleSave}
          disabled={testState !== 'ok' || saving}
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
    </div>
  );
}
