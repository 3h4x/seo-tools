import { describe, expect, it } from 'vitest';

import { applyImportResults, buildImportSummary, getImportResult, type DiscoverySite, type ImportResult } from '../discovery-import';

type Site = {
  id: string;
  domain: string;
};

describe('getImportResult', () => {
  it('treats a response as success only when HTTP is ok and payload ok is true', async () => {
    const res = new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });

    await expect(getImportResult(res)).resolves.toEqual({ ok: true });
  });

  it('returns a failure when HTTP is ok but payload ok is false', async () => {
    const res = new Response(JSON.stringify({ ok: false, error: 'Duplicate site' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });

    await expect(getImportResult(res)).resolves.toEqual({
      ok: false,
      error: 'Duplicate site',
    });
  });

  it('returns a failure when HTTP status is not ok', async () => {
    const res = new Response(JSON.stringify({ error: 'Validation failed' }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    });

    await expect(getImportResult(res)).resolves.toEqual({
      ok: false,
      error: 'Validation failed',
    });
  });
});

describe('applyImportResults', () => {
  it('keeps failed rows visible and removes successful imports', () => {
    const discovered: DiscoverySite<Site>[] = [
      { id: 'a', domain: 'a.test' },
      { id: 'b', domain: 'b.test' },
      { id: 'c', domain: 'c.test' },
    ];
    const selected = new Set(['a', 'b']);
    const results: ImportResult[] = [
      { id: 'a', ok: true },
      { id: 'b', ok: false, error: 'Duplicate domain' },
    ];

    const nextState = applyImportResults(discovered, selected, results);

    expect(nextState.remaining).toEqual([
      { id: 'b', domain: 'b.test', importError: 'Duplicate domain' },
      { id: 'c', domain: 'c.test' },
    ]);
    expect([...nextState.selected]).toEqual(['b']);
    expect(nextState.successCount).toBe(1);
    expect(nextState.failureCount).toBe(1);
  });

  it('builds a success summary for a later successful batch even when an older failed row remains', () => {
    const discoveredAfterFirstBatch: DiscoverySite<Site>[] = [
      { id: 'b', domain: 'b.test', importError: 'Duplicate domain' },
      { id: 'c', domain: 'c.test' },
    ];
    const selected = new Set(['c']);
    const results: ImportResult[] = [{ id: 'c', ok: true }];

    const nextState = applyImportResults(discoveredAfterFirstBatch, selected, results);
    const summary = buildImportSummary(nextState.successCount, nextState.failureCount);

    expect(nextState.remaining).toEqual([
      { id: 'b', domain: 'b.test', importError: 'Duplicate domain' },
    ]);
    expect(summary).toEqual({
      message: 'Imported 1 site.',
      tone: 'success',
    });
  });
});

describe('buildImportSummary', () => {
  it('returns a warning summary for partial failure', () => {
    expect(buildImportSummary(2, 1)).toEqual({
      message: 'Imported 2 sites. 1 failed.',
      tone: 'warning',
    });
  });

  it('returns null when nothing was imported', () => {
    expect(buildImportSummary(0, 0)).toBeNull();
  });
});
