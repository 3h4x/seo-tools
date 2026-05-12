'use client';

import React, { useState, useEffect } from 'react';
import { PositionBadge } from './position-badge';
import type { SCQueryRow, PageQueryResult } from '@/lib/search-console';

interface PageQueriesTableProps {
  siteId: string;
  days: number;
}

export function PageQueriesTable({ siteId, days }: PageQueriesTableProps) {
  const [rows, setRows] = useState<PageQueryResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    setLoading(true);
    fetch(`/api/${siteId}/page-queries?days=${days}`)
      .then((r) => r.json())
      .then((body) => setRows(body.data ?? []))
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
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
        <p className="text-neutral-600 text-sm">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-neutral-600 text-sm">No page data available.</p>
      ) : (
        <div className="bg-neutral-900 rounded-lg border border-neutral-800 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-800 text-neutral-500 text-xs uppercase tracking-wider">
                <th className="px-4 py-3 font-semibold text-left">Page</th>
                <th className="px-4 py-3 font-semibold text-right">Clicks</th>
                <th className="px-4 py-3 font-semibold text-right hidden md:table-cell">Impr</th>
                <th className="px-4 py-3 font-semibold text-right">Pos</th>
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
                        <span className="inline-flex items-center gap-1.5">
                          <span className={`transition-transform text-neutral-600 text-[10px] ${isOpen ? 'rotate-90' : ''}`}>▶</span>
                          <span title={row.page}>{pathname(row.page)}</span>
                        </span>
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
                                  <th className="py-1 text-left font-medium">Query</th>
                                  <th className="py-1 text-right font-medium">Clicks</th>
                                  <th className="py-1 text-right font-medium hidden md:table-cell">Impr</th>
                                  <th className="py-1 text-right font-medium hidden md:table-cell">CTR</th>
                                  <th className="py-1 text-right font-medium">Pos</th>
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
