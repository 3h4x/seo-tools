'use client';

import { useCallback, useEffect, useState } from 'react';
import { applyImportResults, buildImportSummary, getImportResult, type DiscoverySite, type ImportResult, type ImportSummary } from '@/lib/discovery-import';
import { formatNetworkError, getMutationResult } from '@/lib/request-result';
import { getSiteScUrlOverride, isReservedSiteId, isValidSiteDomain, isValidSiteId, normalizeSiteDomain, slugifySiteDomain } from '@/lib/site-domain';
import type { SiteDiagnosticResult } from '@/lib/site-diagnostics';
import { SKIP_CHECK_OPTIONS, hasSkipCheck, toggleSkipCheck } from '@/lib/skip-checks';

interface Site {
  id: string;
  name: string;
  domain: string;
  scUrl?: string;
  ga4PropertyId?: string;
  indexNowKey?: string;
  searchConsole?: boolean;
  color?: string;
  testPages: string[];
  skipChecks?: string[];
  isUpdate?: boolean;
}

type DiscoverySource = 'sc' | 'ga4' | 'sc+ga4';

type DiscoveredSite = DiscoverySite<Site> & {
  discoverySource: DiscoverySource;
  ga4DisplayName?: string;
};

interface Props {
  initialSites: Site[];
  hasAuth: boolean;
}

type EditMode = 'none' | 'new' | string;

const INPUT_CLS = 'w-full bg-neutral-800 border border-neutral-700 rounded px-3 py-1.5 text-sm text-white focus:outline-none focus:border-neutral-500';
const MONO_INPUT_CLS = INPUT_CLS + ' font-mono';

const EMPTY_SITE: Omit<Site, 'id'> = {
  name: '',
  domain: '',
  scUrl: '',
  ga4PropertyId: '',
  indexNowKey: '',
  searchConsole: true,
  color: undefined,
  testPages: ['/'],
  skipChecks: [],
};

function moveItem<T>(items: T[], fromIndex: number, toIndex: number): T[] {
  const next = [...items];
  const [item] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, item);
  return next;
}

const DISCOVER_ERROR_MESSAGES: Record<string, string> = {
  search_console_api_failed: 'Search Console API request failed. Check server logs.',
  failed_to_load_existing_sites: 'Could not load existing sites. Check server logs.',
};

const SITE_MUTATION_ERROR_MESSAGES: Record<string, string> = {
  failed_to_load_sites: 'Could not load existing sites. Check server logs.',
  failed_to_save_site: 'Could not save site. Check server logs.',
  failed_to_delete_site: 'Could not delete site. Check server logs.',
  failed_to_reorder_sites: 'Could not reorder sites. Check server logs.',
};

export function formatDiscoverError(error: string | undefined, status: number): string {
  const trimmed = error?.trim();
  if (trimmed && DISCOVER_ERROR_MESSAGES[trimmed]) {
    return DISCOVER_ERROR_MESSAGES[trimmed];
  }
  return trimmed || `Discovery failed (${status})`;
}

export function formatSiteMutationError(error: string | undefined, status: number, fallback: string): string {
  const trimmed = error?.trim();
  if (trimmed && SITE_MUTATION_ERROR_MESSAGES[trimmed]) {
    return SITE_MUTATION_ERROR_MESSAGES[trimmed];
  }
  return trimmed || `${fallback} (${status})`;
}

function buildDiagnosticMap(diagnostics: SiteDiagnosticResult[]): Record<string, SiteDiagnosticResult> {
  return Object.fromEntries(diagnostics.map((diagnostic) => [diagnostic.siteId, diagnostic]));
}

async function fetchSiteDiagnostics(): Promise<Record<string, SiteDiagnosticResult>> {
  const res = await fetch('/api/config/site-diagnostics', { cache: 'no-store' });
  if (!res.ok) {
    throw new Error(`diagnostics request failed (${res.status})`);
  }

  const data = await res.json() as { diagnostics?: SiteDiagnosticResult[] };
  if (!Array.isArray(data?.diagnostics)) {
    throw new Error('diagnostics response was invalid');
  }
  return buildDiagnosticMap(data.diagnostics);
}

async function fetchSitesList(): Promise<Site[]> {
  const res = await fetch('/api/sites');
  if (!res.ok) {
    throw new Error(`sites request failed (${res.status})`);
  }
  const data = await res.json();
  if (!Array.isArray(data)) {
    throw new Error('sites response was invalid');
  }
  return data as Site[];
}

function StatusBadge({
  status,
  message,
}: {
  status: SiteDiagnosticResult['searchConsole']['status'] | 'loading';
  message: string;
}) {
  const styles = {
    ok: 'border-emerald-800/80 bg-emerald-950/50 text-emerald-300',
    'missing-config': 'border-neutral-700 bg-neutral-900 text-neutral-400',
    'permission-error': 'border-red-900/80 bg-red-950/40 text-red-300',
    'not-found': 'border-amber-900/80 bg-amber-950/40 text-amber-300',
    'provider-error': 'border-red-900/80 bg-red-950/40 text-red-300',
    loading: 'border-neutral-700 bg-neutral-900 text-neutral-500',
  } as const;

  return (
    <span className={`inline-flex items-center rounded border px-2 py-0.5 text-[11px] font-medium ${styles[status]}`}>
      {message}
    </span>
  );
}

function DiscoverySourceBadge({ source }: { source: DiscoverySource }) {
  const styles = {
    sc: 'border-sky-900/80 bg-sky-950/40 text-sky-300',
    ga4: 'border-emerald-900/80 bg-emerald-950/40 text-emerald-300',
    'sc+ga4': 'border-violet-900/80 bg-violet-950/40 text-violet-300',
  } as const;

  return (
    <span className={`text-xs rounded border px-1.5 py-0.5 ${styles[source]}`}>
      {source === 'sc+ga4' ? 'SC + GA4' : source.toUpperCase()}
    </span>
  );
}

export default function SitesManager({ initialSites, hasAuth }: Props) {
  const [sites, setSites] = useState<Site[]>(initialSites);
  const [diagnostics, setDiagnostics] = useState<Record<string, SiteDiagnosticResult>>({});
  const [diagnosticsLoading, setDiagnosticsLoading] = useState(false);
  const [diagnosticsError, setDiagnosticsError] = useState(false);
  const [editMode, setEditMode] = useState<EditMode>('none');
  const [form, setForm] = useState<Site>({ id: '', ...EMPTY_SITE });
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [discovering, setDiscovering] = useState(false);
  const [discovered, setDiscovered] = useState<DiscoveredSite[] | null>(null);
  const [discoverError, setDiscoverError] = useState('');
  const [importSummary, setImportSummary] = useState<ImportSummary | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [importing, setImporting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function startNew() {
    setForm({ id: '', ...EMPTY_SITE });
    setEditMode('new');
    setError('');
  }

  function startEdit(site: Site) {
    setForm({
      ...site,
      scUrl: site.scUrl ?? '',
      ga4PropertyId: site.ga4PropertyId ?? '',
      indexNowKey: site.indexNowKey ?? '',
    });
    setEditMode(site.id);
    setError('');
  }

  function cancelEdit() {
    setEditMode('none');
    setError('');
  }

  const loadDiagnostics = useCallback(async () => {
    if (!hasAuth) {
      setDiagnostics({});
      setDiagnosticsError(false);
      setDiagnosticsLoading(false);
      return;
    }

    setDiagnosticsLoading(true);
    try {
      setDiagnostics(await fetchSiteDiagnostics());
      setDiagnosticsError(false);
    } catch (err) {
      console.error('[SitesManager] diagnostics:', err);
      setDiagnostics({});
      setDiagnosticsError(true);
    } finally {
      setDiagnosticsLoading(false);
    }
  }, [hasAuth]);

  async function reloadSites() {
    try {
      setSites(await fetchSitesList());
    } catch (err) {
      console.error('[SitesManager] reloadSites:', err);
      setError(formatNetworkError(err, 'Failed to reload sites'));
      return;
    }
    await loadDiagnostics();
  }

  useEffect(() => {
    void loadDiagnostics();
  }, [loadDiagnostics]);

  async function persistSiteOrder(nextSites: Site[]) {
    const previousSites = sites;
    setSites(nextSites);
    setSaving(true);
    setError('');

    try {
      const res = await fetch('/api/sites/order', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderedIds: nextSites.map(site => site.id) }),
      });
      const result = await getMutationResult(res, 'Failed to reorder sites');
      if (!result.ok) {
        setSites(previousSites);
        setError(formatSiteMutationError(result.error, res.status, 'Failed to reorder sites'));
        return;
      }
      await reloadSites();
    } catch (err) {
      console.error('[SitesManager] persistSiteOrder:', err);
      setSites(previousSites);
      setError(formatNetworkError(err, 'Reorder failed'));
    } finally {
      setSaving(false);
    }
  }

  async function handleSave() {
    const trimmedName = form.name.trim();
    const normalizedDomain = normalizeSiteDomain(form.domain);
    if (!trimmedName || !normalizedDomain) {
      setError('Enter a valid site name and domain');
      return;
    }

    const siteId = editMode === 'new' ? (form.id.trim() || slugifySiteDomain(normalizedDomain)) : form.id;
    if (!isValidSiteId(siteId)) {
      setError('Site ID can only contain letters, numbers, dots, underscores, and hyphens');
      return;
    }
    if (isReservedSiteId(siteId)) {
      setError(`"${siteId}" is reserved for an app route and cannot be used as a site ID`);
      return;
    }

    setSaving(true);
    setError('');
    const siteToSave: Site = {
      ...form,
      id: siteId,
      name: trimmedName,
      domain: normalizedDomain,
      scUrl: getSiteScUrlOverride(form.domain, form.scUrl),
      ga4PropertyId: form.ga4PropertyId?.trim() || undefined,
      indexNowKey: form.indexNowKey?.trim() || undefined,
      testPages: form.testPages.map(page => page.trim()).filter(Boolean),
    };

    try {
      const res = await fetch('/api/sites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...siteToSave,
          originalId: editMode === 'new' ? undefined : form.id,
        }),
      });
      const result = await getMutationResult(res, 'Save failed');
      if (!result.ok) {
        setError(formatSiteMutationError(result.error, res.status, 'Save failed'));
        return;
      }
      await reloadSites();
      setEditMode('none');
    } catch (err) {
      console.error('[SitesManager] save:', err);
      setError(formatNetworkError(err, 'Save failed'));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    try {
      setError('');
      const res = await fetch(`/api/sites?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
      const result = await getMutationResult(res, 'Delete failed');
      if (!result.ok) {
        setError(formatSiteMutationError(result.error, res.status, 'Delete failed'));
        return;
      }
      setSites(prev => prev.filter(s => s.id !== id));
      setDeleteConfirm(null);
      if (editMode === id) setEditMode('none');
    } catch (err) {
      console.error('[SitesManager] delete:', err);
      setError(formatNetworkError(err, 'Delete failed'));
    }
  }

  async function handleMoveSite(index: number, direction: -1 | 1) {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= sites.length) return;
    await persistSiteOrder(moveItem(sites, index, nextIndex));
  }

  async function handleDiscover() {
    setDiscovering(true);
    setDiscoverError('');
    setImportSummary(null);
    setDiscovered(null);
    setSelected(new Set());
    try {
      const res = await fetch('/api/sites/discover');
      let data: unknown = null;
      try {
        data = await res.json();
      } catch {
        data = null;
      }
      const errorString =
        data && typeof data === 'object' && 'error' in data && typeof (data as { error?: unknown }).error === 'string'
          ? (data as { error: string }).error
          : undefined;
      if (!res.ok) {
        setDiscoverError(formatDiscoverError(errorString, res.status));
        return;
      }
      if (errorString) {
        setDiscoverError(formatDiscoverError(errorString, res.status));
        return;
      }
      if (!Array.isArray(data)) {
        setDiscoverError('Discovery response was invalid');
        return;
      }
      const discoveredSites = data as DiscoveredSite[];
      setDiscovered(discoveredSites);
      setSelected(new Set(discoveredSites.map(s => s.id)));
    } catch (err) {
      console.error('[SitesManager] discover:', err);
      setDiscoverError(formatNetworkError(err, 'Request failed'));
    } finally {
      setDiscovering(false);
    }
  }

  function toggleSelect(id: string) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (!discovered) return;
    if (selected.size === discovered.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(discovered.map(s => s.id)));
    }
  }

  async function handleImport() {
    if (!discovered) return;
    setImporting(true);
    setDiscoverError('');
    setImportSummary(null);
    const toImport = discovered.filter(s => selected.has(s.id));
    try {
      const results = await Promise.all(toImport.map(async (site): Promise<ImportResult> => {
        try {
          const {
            importError: _importError,
            isUpdate: _isUpdate,
            discoverySource: _discoverySource,
            ga4DisplayName: _ga4DisplayName,
            ...siteToSave
          } = site;
          const res = await fetch('/api/sites', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              ...siteToSave,
              originalId: site.isUpdate ? site.id : undefined,
            }),
          });
          const result = await getImportResult(res);
          return {
            id: site.id,
            ...(result.ok
              ? result
              : {
                ...result,
                error: formatSiteMutationError(result.error, res.status, 'Import failed'),
              }),
          };
        } catch (err) {
          return {
            id: site.id,
            ok: false,
            error: formatNetworkError(err, 'Request failed'),
          };
        }
      }));

      const nextState = applyImportResults(discovered, selected, results);
      setDiscovered(nextState.remaining);
      setSelected(nextState.selected);

      if (nextState.successCount > 0) {
        await reloadSites();
      }

      setImportSummary(buildImportSummary(nextState.successCount, nextState.failureCount));
    } catch (err) {
      console.error('[SitesManager] import:', err);
      setDiscoverError(formatNetworkError(err, 'Import failed'));
    } finally {
      setImporting(false);
    }
  }

  const isEditing = editMode !== 'none';
  const canSave = !saving && form.name.trim().length > 0 && isValidSiteDomain(form.domain);

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-white">Managed Sites</h2>
          {sites.length > 1 && (
            <p className="mt-1 text-xs text-neutral-500">Dashboards use this order across the app.</p>
          )}
        </div>
        <button
          onClick={startNew}
          disabled={isEditing || saving}
          className="px-3 py-1.5 rounded-md text-sm bg-white text-black hover:bg-neutral-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          + Add Site
        </button>
      </div>
      {sites.length === 0 && !isEditing && (
        <p className="text-sm text-neutral-500">
          No sites configured — add a site or use Discover to import from Google.
        </p>
      )}

      {error && !isEditing && (
        <p className="text-sm text-red-400" role="alert">{error}</p>
      )}

      {sites.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead>
              <tr className="text-neutral-500 border-b border-neutral-800">
                <th className="py-2 pr-4 font-medium">Order</th>
                <th className="py-2 pr-4 font-medium">Name</th>
                <th className="py-2 pr-4 font-medium">Domain</th>
                <th className="py-2 pr-4 font-medium">Search Console</th>
                <th className="py-2 pr-4 font-medium">SC Access</th>
                <th className="py-2 pr-4 font-medium">GA4</th>
                <th className="py-2 pr-4 font-medium">GA4 Access</th>
                <th className="py-2 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {sites.map((site, index) => (
                <tr key={site.id} className="border-b border-neutral-900 hover:bg-neutral-900/40">
                  <td className="py-2 pr-4 text-neutral-400">
                    <div className="flex items-center gap-2">
                      <span className="w-5 text-xs font-mono">{index + 1}</span>
                      <button
                        onClick={() => handleMoveSite(index, -1)}
                        disabled={isEditing || saving || index === 0}
                        className="text-[11px] text-neutral-500 hover:text-white disabled:opacity-30 transition-colors"
                      >
                        Up
                      </button>
                      <button
                        onClick={() => handleMoveSite(index, 1)}
                        disabled={isEditing || saving || index === sites.length - 1}
                        className="text-[11px] text-neutral-500 hover:text-white disabled:opacity-30 transition-colors"
                      >
                        Down
                      </button>
                    </div>
                  </td>
                  <td className="py-2 pr-4 text-white">
                    <div className="flex items-center gap-2">
                      {site.color && (
                        <span className="size-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: site.color }} />
                      )}
                      {site.name}
                    </div>
                  </td>
                  <td className="py-2 pr-4 text-neutral-400 font-mono text-xs">{site.domain}</td>
                  <td className="py-2 pr-4 text-neutral-400">{site.searchConsole ? '✓' : '–'}</td>
                  <td className="py-2 pr-4">
                    {hasAuth ? (
                      diagnostics[site.id] ? (
                        <StatusBadge
                          status={diagnostics[site.id].searchConsole.status}
                          message={diagnostics[site.id].searchConsole.message}
                        />
                      ) : (
                        <StatusBadge
                          status={diagnosticsLoading ? 'loading' : 'provider-error'}
                          message={diagnosticsLoading ? 'Checking…' : 'Unavailable'}
                        />
                      )
                    ) : (
                      <StatusBadge status="loading" message="No service account" />
                    )}
                  </td>
                  <td className="py-2 pr-4 text-neutral-400">{site.ga4PropertyId ? '✓' : '–'}</td>
                  <td className="py-2 pr-4">
                    {hasAuth ? (
                      diagnostics[site.id] ? (
                        <StatusBadge
                          status={diagnostics[site.id].ga4.status}
                          message={diagnostics[site.id].ga4.message}
                        />
                      ) : (
                        <StatusBadge
                          status={diagnosticsLoading ? 'loading' : 'provider-error'}
                          message={diagnosticsLoading ? 'Checking…' : 'Unavailable'}
                        />
                      )
                    ) : (
                      <StatusBadge status="loading" message="No service account" />
                    )}
                  </td>
                  <td className="py-2 flex gap-2">
                    <button
                      onClick={() => startEdit(site)}
                      disabled={isEditing || saving}
                      className="text-xs text-neutral-400 hover:text-white disabled:opacity-40 transition-colors"
                    >
                      Edit
                    </button>
                    {deleteConfirm === site.id ? (
                      <>
                        <button
                          onClick={() => handleDelete(site.id)}
                          className="text-xs text-red-400 hover:text-red-300 transition-colors"
                        >
                          Confirm
                        </button>
                        <button
                          onClick={() => setDeleteConfirm(null)}
                          className="text-xs text-neutral-500 hover:text-white transition-colors"
                        >
                          Cancel
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => setDeleteConfirm(site.id)}
                        disabled={isEditing || saving}
                        className="text-xs text-neutral-600 hover:text-red-400 disabled:opacity-40 transition-colors"
                      >
                        Delete
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {diagnosticsError && hasAuth && (
        <p className="text-xs text-red-400" role="alert">Could not load per-site diagnostics.</p>
      )}
      {isEditing && (
        <div className="border border-neutral-700 rounded-lg p-4 space-y-4 bg-neutral-900/50">
          <h3 className="text-sm font-medium text-white">
            {editMode === 'new' ? 'Add Site' : `Edit: ${form.name}`}
          </h3>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs text-neutral-400">ID{editMode !== 'new' ? ' (locked)' : ' (auto from domain)'}</label>
              <input
                className={MONO_INPUT_CLS + ' disabled:opacity-50'}
                value={form.id}
                onChange={e => setForm(f => ({ ...f, id: e.target.value }))}
                disabled={editMode !== 'new'}
                placeholder="auto"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-neutral-400">Name *</label>
              <input
                className={INPUT_CLS}
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="My Site"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-neutral-400">Domain *</label>
              <input
                className={MONO_INPUT_CLS}
                value={form.domain}
                onChange={e => setForm(f => ({ ...f, domain: e.target.value }))}
                placeholder="example.com"
              />
              {form.domain.trim() && !isValidSiteDomain(form.domain) && (
                <p className="text-xs text-amber-300">Use a bare domain or an `http(s)` site URL.</p>
              )}
            </div>
            <div className="space-y-1">
              <label className="text-xs text-neutral-400">SC URL override</label>
              <input
                className={MONO_INPUT_CLS}
                value={form.scUrl ?? ''}
                onChange={e => setForm(f => ({ ...f, scUrl: e.target.value }))}
                placeholder="https://example.github.io/"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-neutral-400">GA4 Property ID</label>
              <input
                className={MONO_INPUT_CLS}
                value={form.ga4PropertyId ?? ''}
                onChange={e => setForm(f => ({ ...f, ga4PropertyId: e.target.value }))}
                placeholder="123456789"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-neutral-400">IndexNow key</label>
              <input
                className={MONO_INPUT_CLS}
                value={form.indexNowKey ?? ''}
                onChange={e => setForm(f => ({ ...f, indexNowKey: e.target.value }))}
                placeholder="indexnow-key"
              />
              <p className="text-[11px] text-neutral-600">
                Use 8-128 letters, numbers, or hyphens. Serve this exact key from <span className="font-mono text-neutral-400">/{'{key}'}.txt</span> before using the ping action.
              </p>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-neutral-400">Color</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  className="h-8 w-12 rounded cursor-pointer bg-neutral-800 border border-neutral-700"
                  value={form.color ?? '#737373'}
                  onChange={e => setForm(f => ({ ...f, color: e.target.value }))}
                />
                {form.color && (
                  <button
                    type="button"
                    onClick={() => setForm(f => ({ ...f, color: undefined }))}
                    className="text-xs text-neutral-500 hover:text-neutral-300 transition-colors"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>
            <div className="space-y-1 col-span-2">
              <label className="text-xs text-neutral-400">Test pages (one path per line)</label>
              <textarea
                className={MONO_INPUT_CLS + ' resize-y'}
                rows={3}
                value={form.testPages.join('\n')}
                onChange={e => setForm(f => ({ ...f, testPages: e.target.value.split('\n').filter(Boolean) }))}
                placeholder="/"
              />
            </div>
            <div className="space-y-1 col-span-2">
              <label className="text-xs text-neutral-400">Skip checks</label>
              <div className="grid grid-cols-3 gap-x-4 gap-y-1.5 pt-1">
                {SKIP_CHECK_OPTIONS.map(({ id, label }) => (
                  <label key={id} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={hasSkipCheck(form.skipChecks, id)}
                      onChange={e => setForm(f => {
                        return {
                          ...f,
                          skipChecks: toggleSkipCheck(f.skipChecks, id, e.target.checked),
                        };
                      })}
                      className="rounded border-neutral-600"
                    />
                    <span className="text-xs text-neutral-300">{label}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-2 col-span-2">
              <input
                type="checkbox"
                id="sc-toggle"
                checked={form.searchConsole !== false}
                onChange={e => setForm(f => ({ ...f, searchConsole: e.target.checked }))}
                className="rounded border-neutral-600"
              />
              <label htmlFor="sc-toggle" className="text-sm text-neutral-300">Search Console enabled</label>
            </div>
          </div>

          {error && <p className="text-sm text-red-400" role="alert">{error}</p>}

          <div className="flex gap-2">
            <button
              onClick={handleSave}
              disabled={!canSave}
              className="px-4 py-2 rounded-md text-sm bg-white text-black hover:bg-neutral-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button
              onClick={cancelEdit}
              className="px-4 py-2 rounded-md text-sm bg-neutral-800 text-white hover:bg-neutral-700 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
      {hasAuth && (
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <h3 className="text-sm font-medium text-neutral-300">Discover from Google</h3>
            <button
              onClick={handleDiscover}
              disabled={discovering || isEditing}
              className="px-3 py-1.5 rounded-md text-xs bg-neutral-800 text-white hover:bg-neutral-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {discovering ? 'Discovering…' : 'Discover sites'}
            </button>
          </div>

          {discoverError && <p className="text-sm text-red-400" role="alert">{discoverError}</p>}
          {importSummary && (
            <p className={`text-sm ${importSummary.tone === 'warning' ? 'text-amber-300' : 'text-emerald-300'}`}>
              {importSummary.message}
            </p>
          )}

          {discovered !== null && (
            discovered.length === 0 ? (
              <p className="text-sm text-neutral-500">All accessible sites already added.</p>
            ) : (
              <div className="border border-neutral-700 rounded-lg p-4 space-y-3">
                <div className="flex items-center gap-3">
                  <button
                    onClick={toggleSelectAll}
                    className="text-xs text-neutral-400 hover:text-white transition-colors"
                  >
                    {selected.size === discovered.length ? 'Deselect All' : 'Select All'}
                  </button>
                  {(() => {
                    const newCount = discovered.filter(s => !s.isUpdate).length;
                    const updateCount = discovered.filter(s => s.isUpdate).length;
                    const parts = [];
                    if (newCount > 0) parts.push(`${newCount} new site${newCount !== 1 ? 's' : ''}`);
                    if (updateCount > 0) parts.push(`${updateCount} to update`);
                    return <span className="text-xs text-neutral-600">{parts.join(', ')} found</span>;
                  })()}
                </div>
                <div className="space-y-2">
                  {discovered.map(site => (
                    <div key={site.id} className="space-y-1">
                      <label className="flex items-center gap-3 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selected.has(site.id)}
                          onChange={() => toggleSelect(site.id)}
                          className="rounded border-neutral-600"
                        />
                        <span className="text-sm text-white">{site.domain}</span>
                        {site.isUpdate && (
                          <span className="text-xs text-amber-400 border border-amber-700 rounded px-1">update</span>
                        )}
                        <DiscoverySourceBadge source={site.discoverySource} />
                      </label>
                      <div className="pl-6 space-y-1 text-xs text-neutral-500">
                        {site.ga4PropertyId ? (
                          <p>
                            GA4 match: {site.ga4PropertyId}
                            {site.ga4DisplayName ? ` · ${site.ga4DisplayName}` : ''}
                          </p>
                        ) : (
                          <p>No GA4 property match yet.</p>
                        )}
                        {site.discoverySource === 'ga4' && (
                          <p>Search Console match missing. Import and set the SC property manually if needed.</p>
                        )}
                      </div>
                      {site.importError && (
                        <p className="pl-6 text-xs text-red-400">{site.importError}</p>
                      )}
                    </div>
                  ))}
                </div>
                <button
                  onClick={handleImport}
                  disabled={importing || selected.size === 0}
                  className="px-4 py-2 rounded-md text-sm bg-white text-black hover:bg-neutral-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  {importing ? 'Importing…' : `Import Selected (${selected.size})`}
                </button>
              </div>
            )
          )}
        </div>
      )}
    </div>
  );
}
