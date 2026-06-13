'use client';

import { useCallback, useEffect, useState } from 'react';
import { applyImportResults, buildImportSummary, getImportResult, type DiscoverySite, type ImportResult, type ImportSummary } from '@/lib/discovery-import';
import { formatNetworkError, getMutationResult } from '@/lib/request-result';
import { getSiteScUrlOverride, isReservedSiteId, isValidSiteDomain, isValidSiteId, normalizeSiteDomain, slugifySiteDomain } from '@/lib/site-domain';
import type { SiteDiagnosticResult } from '@/lib/site-diagnostics';
import { SKIP_CHECK_OPTIONS, hasSkipCheck, toggleSkipCheck } from '@/lib/skip-checks';
import { CHART_NEUTRALS } from '@/lib/constants';
import { Badge, FormButton, FormCheckbox, FormInput, FormLabel, FormTextarea, Notice, Spinner, Surface, TextButton } from '@/components/ui';
import { DataTable, type DataTableColumn } from './data-table';
import { Icons } from './icons';

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

const DISCOVER_WARNING_MESSAGES: Record<string, string> = {
  ga4_admin_api_failed: 'GA4 Admin API discovery failed. Search Console results are shown without GA4 matches.',
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

export function formatDiscoverWarning(warning: string | null): string {
  const trimmed = warning?.trim();
  if (!trimmed) return '';
  return DISCOVER_WARNING_MESSAGES[trimmed] ?? trimmed;
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
  const tones = {
    ok: 'success',
    'missing-config': 'muted',
    'permission-error': 'danger',
    'not-found': 'warning',
    'provider-error': 'danger',
    loading: 'subtle',
  } as const;

  return (
    <Badge shape="rounded" size="sm" tone={tones[status]}>
      {message}
    </Badge>
  );
}

function DiscoverySourceBadge({ source }: { source: DiscoverySource }) {
  const tones = {
    sc: 'info',
    ga4: 'successMuted',
    'sc+ga4': 'accent',
  } as const;

  return (
    <Badge shape="rounded" size="compact" tone={tones[source]}>
      {source === 'sc+ga4' ? 'SC + GA4' : source.toUpperCase()}
    </Badge>
  );
}

function AvailabilityGlyph({
  available,
  availableLabel,
  missingLabel,
}: {
  available: boolean;
  availableLabel: string;
  missingLabel: string;
}) {
  return (
    <span>
      <span aria-hidden="true">{available ? '✓' : '–'}</span>
      <span className="sr-only">{available ? availableLabel : missingLabel}</span>
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
  const [discoverWarning, setDiscoverWarning] = useState('');
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
    setDiscoverWarning('');
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
      setDiscoverWarning(formatDiscoverWarning(res.headers.get('x-seo-tools-discovery-warning')));
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
    setDiscoverWarning('');
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
  const siteTableColumns: DataTableColumn[] = [
    { label: 'Order', key: 'order', className: 'py-2 pr-4 font-medium', cellClassName: 'py-2 pr-4 text-neutral-400' },
    { label: 'Name', key: 'name', className: 'py-2 pr-4 font-medium', cellClassName: 'py-2 pr-4 font-normal text-left text-white', rowHeader: true },
    { label: 'Domain', key: 'domain', className: 'py-2 pr-4 font-medium', cellClassName: 'py-2 pr-4 text-neutral-400 font-mono text-xs' },
    { label: 'Search Console', key: 'search-console', className: 'py-2 pr-4 font-medium', cellClassName: 'py-2 pr-4 text-neutral-400' },
    { label: 'SC Access', key: 'sc-access', className: 'py-2 pr-4 font-medium', cellClassName: 'py-2 pr-4' },
    { label: 'GA4', key: 'ga4', className: 'py-2 pr-4 font-medium', cellClassName: 'py-2 pr-4 text-neutral-400' },
    { label: 'GA4 Access', key: 'ga4-access', className: 'py-2 pr-4 font-medium', cellClassName: 'py-2 pr-4' },
    { label: <span className="sr-only">Actions</span>, key: 'actions', className: 'py-2 font-medium', cellClassName: 'py-2' },
  ];
  const siteTableRows = sites.map((site, index) => [
    <div key="order" className="flex items-center gap-2">
      <Badge size="inline" borderless className="w-5 justify-start font-mono text-xs text-neutral-400">
        {index + 1}
      </Badge>
      <TextButton
        onClick={() => handleMoveSite(index, -1)}
        disabled={isEditing || saving || index === 0}
        aria-label={`Move ${site.name} up`}
        size="xxs"
        variant="reorder"
      >
        Up
      </TextButton>
      <TextButton
        onClick={() => handleMoveSite(index, 1)}
        disabled={isEditing || saving || index === sites.length - 1}
        aria-label={`Move ${site.name} down`}
        size="xxs"
        variant="reorder"
      >
        Down
      </TextButton>
    </div>,
    <div key="name" className="flex items-center gap-2">
      {site.color && (
        <span aria-hidden="true" className="size-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: site.color }} />
      )}
      {site.name}
    </div>,
    site.domain,
    <AvailabilityGlyph
      key="search-console"
      available={site.searchConsole !== false}
      availableLabel="Search Console enabled"
      missingLabel="Search Console disabled"
    />,
    hasAuth ? (
      diagnostics[site.id] ? (
        <StatusBadge
          key="sc-access"
          status={diagnostics[site.id].searchConsole.status}
          message={diagnostics[site.id].searchConsole.message}
        />
      ) : (
        <StatusBadge
          key="sc-access"
          status={diagnosticsLoading ? 'loading' : 'provider-error'}
          message={diagnosticsLoading ? 'Checking…' : 'Unavailable'}
        />
      )
    ) : (
      <StatusBadge key="sc-access" status="loading" message="No service account" />
    ),
    <AvailabilityGlyph
      key="ga4"
      available={Boolean(site.ga4PropertyId)}
      availableLabel="GA4 property configured"
      missingLabel="GA4 property missing"
    />,
    hasAuth ? (
      diagnostics[site.id] ? (
        <StatusBadge
          key="ga4-access"
          status={diagnostics[site.id].ga4.status}
          message={diagnostics[site.id].ga4.message}
        />
      ) : (
        <StatusBadge
          key="ga4-access"
          status={diagnosticsLoading ? 'loading' : 'provider-error'}
          message={diagnosticsLoading ? 'Checking…' : 'Unavailable'}
        />
      )
    ) : (
      <StatusBadge key="ga4-access" status="loading" message="No service account" />
    ),
    <div key="actions" className="flex gap-2">
      <TextButton
        onClick={() => startEdit(site)}
        disabled={isEditing || saving}
      >
        Edit
      </TextButton>
      {deleteConfirm === site.id ? (
        <>
          <TextButton
            onClick={() => handleDelete(site.id)}
            variant="danger"
          >
            Confirm
          </TextButton>
          <TextButton
            onClick={() => setDeleteConfirm(null)}
            variant="quiet"
          >
            Cancel
          </TextButton>
        </>
      ) : (
        <TextButton
          onClick={() => setDeleteConfirm(site.id)}
          disabled={isEditing || saving}
          variant="danger-muted"
        >
          Delete
        </TextButton>
      )}
    </div>,
  ]);

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-white">Managed Sites</h2>
          {sites.length > 1 && (
            <p className="mt-1 text-xs text-neutral-500">Dashboards use this order across the app.</p>
          )}
        </div>
        <FormButton
          variant="primary"
          size="sm"
          onClick={startNew}
          disabled={isEditing || saving}
          hasIcon
        >
          {Icons.plusCircle}
          Add Site
        </FormButton>
      </div>
      {sites.length === 0 && !isEditing && (
        <Notice size="sm" className="text-neutral-500">
          No sites configured — add a site or use Discover to import from Google.
        </Notice>
      )}

      {error && !isEditing && (
        <Notice tone="danger" size="sm" role="alert">{error}</Notice>
      )}

      {sites.length > 0 && (
        <DataTable
          columns={siteTableColumns}
          rows={siteTableRows}
          rowKeys={sites.map(site => site.id)}
          caption="Managed sites and provider access status"
          monospaceCells={false}
          tableClassName="w-full text-sm text-left"
          containerClassName="overflow-x-auto"
          headRowClassName="text-neutral-500 border-b border-neutral-800"
          bodyClassName=""
          rowClassName="border-b border-neutral-900 hover:bg-neutral-900/40"
        />
      )}
      {diagnosticsError && hasAuth && (
        <Notice tone="danger" size="sm" className="text-xs" role="alert">
          Could not load per-site diagnostics.
        </Notice>
      )}
      {isEditing && (
        <Surface className="space-y-4 border-neutral-700 bg-neutral-900/50" padding="sm">
          <h3 className="text-sm font-medium text-white">
            {editMode === 'new' ? 'Add Site' : `Edit: ${form.name}`}
          </h3>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <FormLabel htmlFor="site-id">ID{editMode !== 'new' ? ' (locked)' : ' (auto from domain)'}</FormLabel>
              <FormInput
                id="site-id"
                tone="dense"
                padding="compact"
                monospace
                className="disabled:opacity-50"
                value={form.id}
                onChange={e => setForm(f => ({ ...f, id: e.target.value }))}
                disabled={editMode !== 'new'}
                placeholder="auto"
              />
            </div>
            <div className="space-y-1">
              <FormLabel htmlFor="site-name">Name *</FormLabel>
              <FormInput
                id="site-name"
                tone="dense"
                padding="compact"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="My Site"
              />
            </div>
            <div className="space-y-1">
              <FormLabel htmlFor="site-domain">Domain *</FormLabel>
              <FormInput
                id="site-domain"
                tone="dense"
                padding="compact"
                monospace
                value={form.domain}
                onChange={e => setForm(f => ({ ...f, domain: e.target.value }))}
                placeholder="example.com"
              />
              {form.domain.trim() && !isValidSiteDomain(form.domain) && (
                <p className="text-xs text-amber-300">Use a bare domain or an `http(s)` site URL.</p>
              )}
            </div>
            <div className="space-y-1">
              <FormLabel htmlFor="site-sc-url">SC URL override</FormLabel>
              <FormInput
                id="site-sc-url"
                tone="dense"
                padding="compact"
                monospace
                value={form.scUrl ?? ''}
                onChange={e => setForm(f => ({ ...f, scUrl: e.target.value }))}
                placeholder="https://example.github.io/"
              />
            </div>
            <div className="space-y-1">
              <FormLabel htmlFor="site-ga4-property-id">GA4 Property ID</FormLabel>
              <FormInput
                id="site-ga4-property-id"
                tone="dense"
                padding="compact"
                monospace
                value={form.ga4PropertyId ?? ''}
                onChange={e => setForm(f => ({ ...f, ga4PropertyId: e.target.value }))}
                placeholder="123456789"
              />
            </div>
            <div className="space-y-1">
              <FormLabel htmlFor="site-indexnow-key">IndexNow key</FormLabel>
              <FormInput
                id="site-indexnow-key"
                tone="dense"
                padding="compact"
                monospace
                value={form.indexNowKey ?? ''}
                onChange={e => setForm(f => ({ ...f, indexNowKey: e.target.value }))}
                placeholder="indexnow-key"
              />
              <p className="text-[11px] text-neutral-600">
                Use 8-128 letters, numbers, or hyphens. Serve this exact key from <span className="font-mono text-neutral-400">/{'{key}'}.txt</span> before using the ping action.
              </p>
            </div>
            <div className="space-y-1">
              <FormLabel htmlFor="site-color">Color</FormLabel>
              <div className="flex items-center gap-2">
                <FormInput
                  id="site-color"
                  type="color"
                  tone="dense"
                  padding="compact"
                  className="h-8 w-12 cursor-pointer"
                  value={form.color ?? CHART_NEUTRALS.tick}
                  onChange={e => setForm(f => ({ ...f, color: e.target.value }))}
                />
                {form.color && (
                  <TextButton
                    type="button"
                    onClick={() => setForm(f => ({ ...f, color: undefined }))}
                    variant="muted"
                  >
                    Clear
                  </TextButton>
                )}
              </div>
            </div>
            <div className="space-y-1 col-span-2">
              <FormLabel htmlFor="site-test-pages">Test pages (one path per line)</FormLabel>
              <FormTextarea
                id="site-test-pages"
                tone="dense"
                padding="compact"
                monospace
                className="resize-y"
                rows={3}
                value={form.testPages.join('\n')}
                onChange={e => setForm(f => ({ ...f, testPages: e.target.value.split('\n').filter(Boolean) }))}
                placeholder="/"
              />
            </div>
            <div className="space-y-1 col-span-2">
              <FormLabel>Skip checks</FormLabel>
              <div className="grid grid-cols-3 gap-x-4 gap-y-1.5 pt-1">
                {SKIP_CHECK_OPTIONS.map(({ id, label }) => (
                  <label key={id} className="flex items-center gap-2 cursor-pointer">
                    <FormCheckbox
                      checked={hasSkipCheck(form.skipChecks, id)}
                      onChange={e => setForm(f => {
                        return {
                          ...f,
                          skipChecks: toggleSkipCheck(f.skipChecks, id, e.target.checked),
                        };
                      })}
                    />
                    <span className="text-xs text-neutral-300">{label}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-2 col-span-2">
              <FormCheckbox
                id="sc-toggle"
                checked={form.searchConsole !== false}
                onChange={e => setForm(f => ({ ...f, searchConsole: e.target.checked }))}
              />
              <FormLabel htmlFor="sc-toggle" className="text-sm text-neutral-300">Search Console enabled</FormLabel>
            </div>
          </div>

          {error && <Notice tone="danger" size="sm" role="alert">{error}</Notice>}

          <div className="flex gap-2">
            <FormButton
              variant="primary"
              onClick={handleSave}
              disabled={!canSave}
              hasIcon
            >
              {saving && <Spinner />}
              {saving ? 'Saving…' : 'Save'}
            </FormButton>
            <FormButton
              onClick={cancelEdit}
            >
              Cancel
            </FormButton>
          </div>
        </Surface>
      )}
      {hasAuth && (
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <h3 className="text-sm font-medium text-neutral-300">Discover from Google</h3>
            <FormButton
              size="xs"
              onClick={handleDiscover}
              disabled={discovering || isEditing}
              hasIcon
            >
              {discovering && <Spinner />}
              {discovering ? 'Discovering…' : 'Discover sites'}
            </FormButton>
          </div>

          {discoverError && <Notice tone="danger" size="sm" role="alert">{discoverError}</Notice>}
          {discoverWarning && <Notice tone="warning" size="sm" role="status">{discoverWarning}</Notice>}
          {importSummary && (
            <Notice tone={importSummary.tone} size="sm" role="status">
              {importSummary.message}
            </Notice>
          )}

          {discovered !== null && (
            discovered.length === 0 ? (
              <Notice size="sm" className="text-neutral-500">
                All accessible sites already added.
              </Notice>
            ) : (
              <Surface className="space-y-3 border-neutral-700" padding="sm">
                <div className="flex items-center gap-3">
                  <TextButton
                    onClick={toggleSelectAll}
                  >
                    {selected.size === discovered.length ? 'Deselect All' : 'Select All'}
                  </TextButton>
                  {(() => {
                    let newCount = 0;
                    let updateCount = 0;
                    for (const s of discovered) {
                      if (s.isUpdate) updateCount++;
                      else newCount++;
                    }
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
                        <FormCheckbox
                          checked={selected.has(site.id)}
                          onChange={() => toggleSelect(site.id)}
                        />
                        <span className="text-sm text-white">{site.domain}</span>
                        {site.isUpdate && (
                          <Badge size="compact" shape="rounded" tone="warning">
                            update
                          </Badge>
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
                        <Notice tone="danger" size="none" role="alert" className="ml-6 border-0 bg-transparent p-0 text-xs text-red-400">
                          {site.importError}
                        </Notice>
                      )}
                    </div>
                  ))}
                </div>
                <FormButton
                  variant="primary"
                  onClick={handleImport}
                  disabled={importing || selected.size === 0}
                  hasIcon
                >
                  {importing && <Spinner />}
                  {importing ? 'Importing…' : `Import Selected (${selected.size})`}
                </FormButton>
              </Surface>
            )
          )}
        </div>
      )}
    </div>
  );
}
