'use client';

import { useState } from 'react';

type PingState = {
  tone: 'neutral' | 'success' | 'error';
  message: string;
} | null;

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
      const payload = await response.json() as {
        ok?: boolean;
        error?: string;
        submittedCount?: number;
        totalUrls?: number;
        truncated?: boolean;
      };

      if (!response.ok || payload.ok !== true) {
        setResult({
          tone: 'error',
          message: payload.error?.trim() || `Request failed (${response.status})`,
        });
        return;
      }

      const suffix = payload.truncated
        ? ` (submitted first ${payload.submittedCount?.toLocaleString()} of ${payload.totalUrls?.toLocaleString()} sitemap URLs)`
        : ` (${payload.submittedCount?.toLocaleString()} URLs)`;

      setResult({
        tone: 'success',
        message: `IndexNow ping submitted${suffix}`,
      });
    } catch {
      setResult({
        tone: 'error',
        message: 'Request failed',
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mt-3 flex flex-wrap items-center gap-3">
      <button
        type="button"
        onClick={handlePing}
        disabled={!configured || submitting}
        className="rounded-md border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-xs text-white transition-colors hover:bg-neutral-700 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {submitting ? 'Pinging…' : 'Ping IndexNow'}
      </button>
      {!configured && (
        <span className="text-xs text-neutral-500">Add an IndexNow key in Config first.</span>
      )}
      {result && (
        <span className={`text-xs ${result.tone === 'success' ? 'text-emerald-300' : result.tone === 'error' ? 'text-red-400' : 'text-neutral-400'}`}>
          {result.message}
        </span>
      )}
    </div>
  );
}
