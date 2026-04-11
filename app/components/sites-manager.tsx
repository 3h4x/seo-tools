'use client';

import { useState } from 'react';

interface Site {
  id: string;
  name: string;
  domain: string;
  scUrl?: string;
  ga4PropertyId?: string;
  searchConsole?: boolean;
  color?: string;
  testPages: string[];
  skipChecks?: string[];
}

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
  searchConsole: true,
  color: undefined,
  testPages: ['/'],
  skipChecks: [],
};

export default function SitesManager({ initialSites, hasAuth }: Props) {
  const [sites, setSites] = useState<Site[]>(initialSites);
  const [editMode, setEditMode] = useState<EditMode>('none');
  const [form, setForm] = useState<Site>({ id: '', ...EMPTY_SITE });
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [discovering, setDiscovering] = useState(false);
  const [discovered, setDiscovered] = useState<Site[] | null>(null);
  const [discoverError, setDiscoverError] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [importing, setImporting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function slugify(domain: string): string {
    return domain.replace(/\./g, '-').replace(/[^a-z0-9-]/gi, '').toLowerCase();
  }

  function startNew() {
    setForm({ id: '', ...EMPTY_SITE });
    setEditMode('new');
    setError('');
  }

  function startEdit(site: Site) {
    setForm({ ...site, scUrl: site.scUrl ?? '', ga4PropertyId: site.ga4PropertyId ?? '' });
    setEditMode(site.id);
    setError('');
  }

  function cancelEdit() {
    setEditMode('none');
    setError('');
  }

  async function reloadSites() {
    const res = await fetch('/api/sites');
    const data = await res.json() as Site[];
    setSites(data);
  }

  async function handleSave() {
    setSaving(true);
    setError('');
    const siteToSave: Site = {
      ...form,
      id: editMode === 'new' ? (form.id || slugify(form.domain)) : form.id,
      scUrl: form.scUrl?.trim() || undefined,
      ga4PropertyId: form.ga4PropertyId?.trim() || undefined,
    };

    try {
      const res = await fetch('/api/sites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(siteToSave),
      });
      const data = await res.json() as { ok: boolean; error?: string };
      if (!data.ok) {
        setError(data.error ?? 'Save failed');
        return;
      }
      await reloadSites();
      setEditMode('none');
    } catch {
      setError('Request failed');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    try {
      await fetch(`/api/sites?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
      setSites(prev => prev.filter(s => s.id !== id));
      setDeleteConfirm(null);
      if (editMode === id) setEditMode('none');
    } catch {
      setError('Delete failed');
    }
  }

  async function handleDiscover() {
    setDiscovering(true);
    setDiscoverError('');
    setDiscovered(null);
    setSelected(new Set());
    try {
      const res = await fetch('/api/sites/discover');
      const data = await res.json() as Site[] | { error: string };
      if ('error' in data) {
        setDiscoverError(data.error);
      } else {
        setDiscovered(data);
        setSelected(new Set(data.map(s => s.id)));
      }
    } catch {
      setDiscoverError('Request failed');
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
    const toImport = discovered.filter(s => selected.has(s.id));
    try {
      await Promise.all(toImport.map(site =>
        fetch('/api/sites', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(site),
        })
      ));
      await reloadSites();
      setDiscovered(null);
      setSelected(new Set());
    } catch {
      setDiscoverError('Import failed');
    } finally {
      setImporting(false);
    }
  }

  const isEditing = editMode !== 'none';

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-white">Managed Sites</h2>
        <button
          onClick={startNew}
          disabled={isEditing}
          className="px-3 py-1.5 rounded-md text-sm bg-white text-black hover:bg-neutral-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          + Add Site
        </button>
      </div>

      {/* Sites table */}
      {sites.length === 0 && !isEditing && (
        <p className="text-sm text-neutral-500">
          No sites configured — add a site or use Discover to import from Google.
        </p>
      )}

      {sites.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead>
              <tr className="text-neutral-500 border-b border-neutral-800">
                <th className="py-2 pr-4 font-medium">Name</th>
                <th className="py-2 pr-4 font-medium">Domain</th>
                <th className="py-2 pr-4 font-medium">Search Console</th>
                <th className="py-2 pr-4 font-medium">GA4</th>
                <th className="py-2 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {sites.map(site => (
                <tr key={site.id} className="border-b border-neutral-900 hover:bg-neutral-900/40">
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
                  <td className="py-2 pr-4 text-neutral-400">{site.ga4PropertyId ? '✓' : '–'}</td>
                  <td className="py-2 flex gap-2">
                    <button
                      onClick={() => startEdit(site)}
                      disabled={isEditing}
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
                        disabled={isEditing}
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

      {/* Edit / Add panel */}
      {isEditing && (
        <div className="border border-neutral-700 rounded-lg p-4 space-y-4 bg-neutral-900/50">
          <h3 className="text-sm font-medium text-white">
            {editMode === 'new' ? 'Add Site' : `Edit: ${form.name}`}
          </h3>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs text-neutral-400">ID{editMode !== 'new' ? ' (locked)' : ' (auto from domain)'}</label>
              <input
                className="w-full bg-neutral-800 border border-neutral-700 rounded px-3 py-1.5 text-sm text-white font-mono focus:outline-none focus:border-neutral-500 disabled:opacity-50"
                value={form.id}
                onChange={e => setForm(f => ({ ...f, id: e.target.value }))}
                disabled={editMode !== 'new'}
                placeholder="auto"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-neutral-400">Name *</label>
              <input
                className="w-full bg-neutral-800 border border-neutral-700 rounded px-3 py-1.5 text-sm text-white focus:outline-none focus:border-neutral-500"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="My Site"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-neutral-400">Domain *</label>
              <input
                className="w-full bg-neutral-800 border border-neutral-700 rounded px-3 py-1.5 text-sm text-white font-mono focus:outline-none focus:border-neutral-500"
                value={form.domain}
                onChange={e => setForm(f => ({ ...f, domain: e.target.value }))}
                placeholder="example.com"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-neutral-400">SC URL override</label>
              <input
                className="w-full bg-neutral-800 border border-neutral-700 rounded px-3 py-1.5 text-sm text-white font-mono focus:outline-none focus:border-neutral-500"
                value={form.scUrl ?? ''}
                onChange={e => setForm(f => ({ ...f, scUrl: e.target.value }))}
                placeholder="https://example.github.io/"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-neutral-400">GA4 Property ID</label>
              <input
                className="w-full bg-neutral-800 border border-neutral-700 rounded px-3 py-1.5 text-sm text-white font-mono focus:outline-none focus:border-neutral-500"
                value={form.ga4PropertyId ?? ''}
                onChange={e => setForm(f => ({ ...f, ga4PropertyId: e.target.value }))}
                placeholder="123456789"
              />
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
                className="w-full bg-neutral-800 border border-neutral-700 rounded px-3 py-1.5 text-sm text-white font-mono focus:outline-none focus:border-neutral-500 resize-y"
                rows={3}
                value={form.testPages.join('\n')}
                onChange={e => setForm(f => ({ ...f, testPages: e.target.value.split('\n').filter(Boolean) }))}
                placeholder="/"
              />
            </div>
            <div className="space-y-1 col-span-2">
              <label className="text-xs text-neutral-400">Skip checks</label>
              <div className="grid grid-cols-3 gap-x-4 gap-y-1.5 pt-1">
                {['robots.txt','Sitemap','SC Sitemap','Indexing','title','description','og:title','og:description','og:image','OG Image','twitter:card','canonical','JSON-LD','HTTPS','HSTS','Favicon','TTFB','Images','Internal Links'].map(label => (
                  <label key={label} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={(form.skipChecks ?? []).map(s => s.toLowerCase()).includes(label.toLowerCase())}
                      onChange={e => setForm(f => {
                        const current = f.skipChecks ?? [];
                        return {
                          ...f,
                          skipChecks: e.target.checked
                            ? [...current, label]
                            : current.filter(s => s.toLowerCase() !== label.toLowerCase()),
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

          {error && <p className="text-sm text-red-400">{error}</p>}

          <div className="flex gap-2">
            <button
              onClick={handleSave}
              disabled={saving || !form.name || !form.domain}
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

      {/* Discover section */}
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

          {discoverError && <p className="text-sm text-red-400">{discoverError}</p>}

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
                  <span className="text-xs text-neutral-600">{discovered.length} new site{discovered.length !== 1 ? 's' : ''} found</span>
                </div>
                <div className="space-y-2">
                  {discovered.map(site => (
                    <label key={site.id} className="flex items-center gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selected.has(site.id)}
                        onChange={() => toggleSelect(site.id)}
                        className="rounded border-neutral-600"
                      />
                      <span className="text-sm text-white">{site.domain}</span>
                      {site.ga4PropertyId && (
                        <span className="text-xs text-neutral-500">GA4: {site.ga4PropertyId}</span>
                      )}
                    </label>
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
