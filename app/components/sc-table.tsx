import { PositionBadge } from './position-badge';
import { ExportButton } from './export-button';

interface ScTableRow {
  label: string;
  title?: string;
  clicks: number;
  impressions: number;
  ctr?: number;
  position: number;
}

interface ScTableProps {
  heading: string;
  columnLabel: string;
  rows: ScTableRow[];
  emptyMessage: string;
  exportData?: Record<string, string | number>[];
  filename?: string;
}

export function ScTable({ heading, columnLabel, rows, emptyMessage, exportData, filename }: ScTableProps) {
  const showCtr = rows.some(r => r.ctr !== undefined);
  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-xs uppercase tracking-wider text-neutral-500 font-semibold">{heading}</h2>
        {exportData && exportData.length > 0 && filename && (
          <ExportButton data={exportData} filename={filename} />
        )}
      </div>
      {rows.length > 0 ? (
        <div className="bg-neutral-900 rounded-lg border border-neutral-800 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-800 text-neutral-500 text-left text-xs uppercase tracking-wider">
                <th className="px-4 py-3 font-semibold">{columnLabel}</th>
                <th className="px-4 py-3 font-semibold text-right">Clicks</th>
                <th className="px-4 py-3 font-semibold text-right hidden md:table-cell">Impr</th>
                {showCtr && <th className="px-4 py-3 font-semibold text-right hidden md:table-cell">CTR</th>}
                <th className="px-4 py-3 font-semibold text-right">Pos</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-800">
              {rows.map((row, i) => (
                <tr key={i} className="hover:bg-neutral-800/30 transition-colors">
                  <td className="px-4 py-2.5 text-neutral-300 font-mono text-xs truncate max-w-[200px]" title={row.title}>{row.label}</td>
                  <td className="px-4 py-2.5 text-right text-neutral-300 font-mono">{row.clicks.toLocaleString()}</td>
                  <td className="px-4 py-2.5 text-right text-neutral-400 font-mono hidden md:table-cell">{row.impressions.toLocaleString()}</td>
                  {showCtr && <td className="px-4 py-2.5 text-right text-neutral-400 font-mono hidden md:table-cell">{row.ctr !== undefined ? `${(row.ctr * 100).toFixed(1)}%` : '—'}</td>}
                  <td className="px-4 py-2.5 text-right"><PositionBadge position={row.position} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-neutral-600 text-sm">{emptyMessage}</p>
      )}
    </div>
  );
}
