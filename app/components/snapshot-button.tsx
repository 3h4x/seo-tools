'use client';

import { useState } from 'react';
import { Badge, FormButton, Notice, Spinner } from '@/components/ui';
import { formatNetworkError } from '@/lib/request-result';
import type { SnapshotResult } from '@/lib/snapshot';
import { Icons } from './icons';

type State = 'idle' | 'running' | 'done' | 'error';

type SnapshotResponse =
  | { ok: true; result: SnapshotResult }
  | { ok: false; error: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isSnapshotResult(value: unknown): value is SnapshotResult {
  return (
    isRecord(value) &&
    typeof value.date === 'string' &&
    typeof value.sc === 'number' &&
    typeof value.keywords === 'number' &&
    typeof value.ga4 === 'number' &&
    typeof value.ttfb === 'number' &&
    Array.isArray(value.errors) &&
    value.errors.every((error) => typeof error === 'string')
  );
}

export function formatSnapshotError(error: string | undefined, status: number): string {
  if (error === 'snapshot_in_progress') {
    return 'Snapshot already running';
  }
  if (error === 'snapshot_failed') {
    return 'Snapshot failed';
  }
  return error?.trim() || `Snapshot request failed (${status})`;
}

export async function readSnapshotResponse(response: Response): Promise<SnapshotResponse> {
  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const error = isRecord(payload) && typeof payload.error === 'string' ? payload.error : undefined;
    return { ok: false, error: formatSnapshotError(error, response.status) };
  }

  if (!isSnapshotResult(payload)) {
    return { ok: false, error: 'Snapshot response was invalid' };
  }

  return { ok: true, result: payload };
}

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
      const snapshot = await readSnapshotResponse(res);
      if (!snapshot.ok) {
        setErrorMsg(snapshot.error);
        setState('error');
        return;
      }
      setResult(snapshot.result);
      setState('done');
    } catch (error) {
      console.error('[SnapshotButton]', error);
      setErrorMsg(formatNetworkError(error));
      setState('error');
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <FormButton
        type="button"
        onClick={handleClick}
        disabled={state === 'running'}
        size="xs"
        hasIcon
        className="self-start"
      >
        {state === 'running' ? (
          <Spinner />
        ) : (
          Icons.plusCircle
        )}
        {state === 'running' ? 'Running snapshot…' : 'Run snapshot now'}
      </FormButton>
      {state === 'done' && result && (
        <Notice size="sm" className="max-w-xl text-xs">
          Snapshot saved for {result.date} — {result.sc} SC pages, {result.keywords} keywords, {result.ga4} GA4 sites
          {result.errors.length > 0 && (
            <Badge size="xs" shape="rounded" tone="warning" className="ml-1">
              {result.errors.length} error{result.errors.length !== 1 ? 's' : ''}
            </Badge>
          )}
        </Notice>
      )}
      {state === 'error' && (
        <Notice tone="danger" size="sm" className="max-w-xl text-xs" role="alert">
          {errorMsg}
        </Notice>
      )}
    </div>
  );
}
