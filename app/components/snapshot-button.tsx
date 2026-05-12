'use client';

import { useState } from 'react';
import type { SnapshotResult } from '@/lib/snapshot';

type State = 'idle' | 'running' | 'done' | 'error';

export function SnapshotButton() {
  const [state, setState] = useState<State>('idle');
  const [result, setResult] = useState<SnapshotResult | null>(null);
  const [errorMsg, setErrorMsg] = useState('');

  async function handleClick() {
    setState('running');
    setResult(null);
    setErrorMsg('');
    try {
      const res = await fetch('/api/snapshot', { method: 'POST' });
      if (res.status === 409) {
        setErrorMsg('Snapshot already running');
        setState('error');
        return;
      }
      if (!res.ok) {
        setErrorMsg('Snapshot failed');
        setState('error');
        return;
      }
      const data: SnapshotResult = await res.json();
      setResult(data);
      setState('done');
    } catch {
      setErrorMsg('Network error');
      setState('error');
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        onClick={handleClick}
        disabled={state === 'running'}
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-neutral-800 text-neutral-300 hover:text-white hover:bg-neutral-700 border border-neutral-700 hover:border-neutral-600 transition-colors disabled:opacity-50 self-start"
      >
        {state === 'running' ? (
          <svg className="size-3.5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 12a9 9 0 1 1-6.219-8.56" />
          </svg>
        ) : (
          <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="16" /><line x1="8" y1="12" x2="16" y2="12" />
          </svg>
        )}
        {state === 'running' ? 'Running snapshot…' : 'Run snapshot now'}
      </button>
      {state === 'done' && result && (
        <p className="text-xs text-neutral-400">
          Snapshot saved for {result.date} — {result.sc} SC pages, {result.keywords} keywords, {result.ga4} GA4 sites
          {result.errors.length > 0 && (
            <span className="text-amber-400"> ({result.errors.length} error{result.errors.length !== 1 ? 's' : ''})</span>
          )}
        </p>
      )}
      {state === 'error' && (
        <p className="text-xs text-red-400">{errorMsg}</p>
      )}
    </div>
  );
}
