'use client';

import { useState } from 'react';
import { FormButton, Notice, Spinner } from '@/components/ui';
import { formatNetworkError } from '@/lib/request-result';

type PingState = {
  tone: 'success' | 'danger';
  message: string;
} | null;

type IndexNowPayload = {
  ok?: boolean;
  error?: string;
  details?: string;
  submittedCount?: number;
  totalUrls?: number;
  truncated?: boolean;
};

type IndexNowResponse =
  | { ok: true; message: string }
  | { ok: false; error: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function parseIndexNowPayload(value: unknown): IndexNowPayload {
  if (!isRecord(value)) return {};

  return {
    ok: typeof value.ok === 'boolean' ? value.ok : undefined,
    error: typeof value.error === 'string' ? value.error : undefined,
    details: typeof value.details === 'string' ? value.details : undefined,
    submittedCount: typeof value.submittedCount === 'number' ? value.submittedCount : undefined,
    totalUrls: typeof value.totalUrls === 'number' ? value.totalUrls : undefined,
    truncated: typeof value.truncated === 'boolean' ? value.truncated : undefined,
  };
}

function formatIndexNowError(payload: IndexNowPayload, status: number): string {
  const error = payload.error?.trim() || `IndexNow request failed (${status})`;
  const details = payload.details?.trim();
  return details ? `${error}: ${details}` : error;
}

function formatIndexNowSuccess(payload: IndexNowPayload): string {
  const submittedCount = payload.submittedCount;
  const totalUrls = payload.totalUrls;

  if (payload.truncated && typeof submittedCount === 'number' && typeof totalUrls === 'number') {
    return `IndexNow ping submitted (submitted first ${submittedCount.toLocaleString()} of ${totalUrls.toLocaleString()} sitemap URLs)`;
  }

  if (typeof submittedCount === 'number') {
    return `IndexNow ping submitted (${submittedCount.toLocaleString()} URLs)`;
  }

  return 'IndexNow ping submitted';
}

export async function readIndexNowResponse(response: Response): Promise<IndexNowResponse> {
  let rawPayload: unknown = {};
  try {
    rawPayload = await response.json();
  } catch {
    rawPayload = {};
  }

  const payload = parseIndexNowPayload(rawPayload);

  if (!response.ok || payload.ok !== true) {
    return { ok: false, error: formatIndexNowError(payload, response.status) };
  }

  return { ok: true, message: formatIndexNowSuccess(payload) };
}

export function IndexNowButton({
  siteId,
  configured,
}: {
  siteId: string;
  configured: boolean;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<PingState>(null);

  async function handlePing() {
    setSubmitting(true);
    setResult(null);

    try {
      const response = await fetch('/api/indexnow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ siteId }),
      });
      const result = await readIndexNowResponse(response);

      if (!result.ok) {
        setResult({
          tone: 'danger',
          message: result.error,
        });
        return;
      }

      setResult({
        tone: 'success',
        message: result.message,
      });
    } catch (error) {
      console.error('[IndexNowButton]', error);
      setResult({
        tone: 'danger',
        message: formatNetworkError(error, 'IndexNow request failed. Check your connection and try again.'),
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mt-3 flex flex-wrap items-center gap-3">
      <FormButton
        type="button"
        onClick={handlePing}
        disabled={!configured || submitting}
        size="xs"
        hasIcon
      >
        {submitting && <Spinner />}
        {submitting ? 'Pinging…' : 'Ping IndexNow'}
      </FormButton>
      {!configured && (
        <span className="text-xs text-neutral-500">Add an IndexNow key in Config first.</span>
      )}
      {result && (
        <Notice
          tone={result.tone}
          size="xs"
          role={result.tone === 'danger' ? 'alert' : 'status'}
        >
          {result.message}
        </Notice>
      )}
    </div>
  );
}
