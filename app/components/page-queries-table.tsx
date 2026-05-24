'use client';

import React, { useState, useEffect } from 'react';
import { PositionBadge } from './position-badge';
import { Skeleton } from './skeletons';
import type { SCQueryRow, PageQueryResult } from '@/lib/search-console';

interface PageQueriesTableProps {
  siteId: string;
  days: number;
}

interface PageQueriesApiResponse {
  data?: PageQueryResult[];
  error?: string;
}

function PageQueriesSkeleton() {
  return (
    <div className="bg-neutral-900 rounded-lg border border-neutral-800 p-4 space-y-3" aria-label="Loading page query data">
      {[...Array(5)].map((_, index) => (
        <div key={index} className="grid grid-cols-[1fr_4rem_4rem] items-center gap-4 md:grid-cols-[1fr_4rem_4rem_4rem]">
          <div className="flex items-center gap-2">
            <Skeleton className="size-2 rounded-sm" />
            <Skeleton className="h-3 w-full max-w-56" />
          </div>
          <Skeleton className="h-3 w-12 justify-self-end" />
          <Skeleton className="hidden h-3 w-12 justify-self-end md:block" />
          <Skeleton className="h-5 w-12 justify-self-end rounded-full" />
        </div>
      ))}
    </div>
  );
}

function PageQueriesError({ message }: { message: string }) {
  return (
    <div className="bg-neutral-900 rounded-lg border border-red-950 p-4" role="alert">
      <div className="h-32 flex flex-col items-center justify-center text-center">
        <h3 className="text-xs uppercase tracking-wider text-red-300 font-semibold">Page Queries Unavailable</h3>
        <p className="mt-2 max-w-md text-sm text-neutral-400">{message}</p>
      </div>
    </div>
  );
}

export function PageQueriesTable({ siteId, days }: PageQueriesTableProps) {
  const [rows, setRows] = useState<PageQueryResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    fetch(`/api/${siteId}/page-queries?days=${days}`)
      .then(async (r) => {
        const body = await r.json() as PageQueriesApiResponse;
        if (!r.ok) {
          throw new Error(body.error ?? `Page queries request failed with status ${r.status}`);
        }
        return body;
      })
      .then((body) => {
        if (cancelled) return;
        setRows(body.data ?? []);
      })
      .catch((error) => {
        if (cancelled) return;
        console.error('[PageQueriesTable]', error);
        setRows([]);
        setLoadError('Search Console page query data could not be loaded. Refresh the dashboard to try again.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [siteId, days]);

  function toggle(page: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(page)) {
        next.delete(page);
      } else {
        next.add(page);
      }
      return next;
    });
  }

  function pathname(url: string) {
    try { return new URL(url).pathname; } catch { return url; }
  }

  return (
    <div>
      <h2 className="text-xs uppercase tracking-wider text-neutral-500 mb-3 font-semibold">
        Top Pages (Search Console)
      </h2>
      {loading ? (
        <PageQueriesSkeleton />
      ) : loadError ? (
        <PageQueriesError message={loadError} />
      ) : rows.length === 0 ? (
        <p className="text-neutral-600 text-sm">No page data available.</p>
      ) : (
        <div className="bg-neutral-900 rounded-lg border border-neutral-800 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-800 text-neutral-500 text-xs uppercase tracking-wider">
                <th scope="col" className="px-4 py-3 font-semibold text-left">Page</th>
                <th scope="col" className="px-4 py-3 font-semibold text-right">Clicks</th>
                <th scope="col" className="px-4 py-3 font-semibold text-right hidden md:table-cell">Impr</th>
                <th scope="col" className="px-4 py-3 font-semibold text-right">Pos</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const isOpen = expanded.has(row.page);
                return (
                  <React.Fragment key={row.page}>
                    <tr
                      className="hover:bg-neutral-800/30 transition-colors cursor-pointer border-b border-neutral-800/50 last:border-0"
                      onClick={() => toggle(row.page)}
                    >
                      <td className="px-4 py-2.5 text-neutral-300 text-xs truncate max-w-[200px]">
                        <button
                          type="button"
                          aria-expanded={isOpen ? 'true' : 'false'}
                          aria-label={`${isOpen ? 'Hide' : 'Show'} queries for ${pathname(row.page)}`}
                          title={row.page}
                          onClick={(event) => {
                            event.stopPropagation();
                            toggle(row.page);
                          }}
                          className="inline-flex items-center gap-1.5 text-left"
                        >
                          <span className={`transition-transform text-neutral-600 text-[10px] ${isOpen ? 'rotate-90' : ''}`}>▶</span>
                          <span>{pathname(row.page)}</span>
                        </button>
                      </td>
                      <td className="px-4 py-2.5 text-neutral-300 text-right">{row.clicks.toLocaleString()}</td>
                      <td className="px-4 py-2.5 text-neutral-400 text-right hidden md:table-cell">{row.impressions.toLocaleString()}</td>
                      <td className="px-4 py-2.5 text-right">
                        <PositionBadge position={row.position} />
                      </td>
                    </tr>
                    {isOpen && (
                      <tr key={`${row.page}-expanded`} className="bg-neutral-950/50">
                        <td colSpan={4} className="px-6 pb-3 pt-1">
                          {row.queries.length === 0 ? (
                            <p className="text-neutral-600 text-xs">No query data for this page.</p>
                          ) : (
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="text-neutral-600 uppercase tracking-wider">
                                  <th scope="col" className="py-1 text-left font-medium">Query</th>
                                  <th scope="col" className="py-1 text-right font-medium">Clicks</th>
                                  <th scope="col" className="py-1 text-right font-medium hidden md:table-cell">Impr</th>
                                  <th scope="col" className="py-1 text-right font-medium hidden md:table-cell">CTR</th>
                                  <th scope="col" className="py-1 text-right font-medium">Pos</th>
                                </tr>
                              </thead>
                              <tbody>
                                {row.queries.map((q: SCQueryRow) => (
                                  <tr key={q.query} className="border-t border-neutral-800/30">
                                    <td className="py-1 text-neutral-400 truncate max-w-[180px]">{q.query}</td>
                                    <td className="py-1 text-neutral-400 text-right">{q.clicks.toLocaleString()}</td>
                                    <td className="py-1 text-neutral-500 text-right hidden md:table-cell">{q.impressions.toLocaleString()}</td>
                                    <td className="py-1 text-neutral-500 text-right hidden md:table-cell">{(q.ctr * 100).toFixed(1)}%</td>
                                    <td className="py-1 text-right"><PositionBadge position={q.position} /></td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
