import type { KeywordDelta } from '@/lib/keyword-history';

function KwDeltaCell({ delta }: { delta: number | null }) {
  if (delta === null) return <span className="text-neutral-700">—</span>;
  if (Math.abs(delta) < 0.1) return <span className="text-neutral-500">±0</span>;
  const improved = delta > 0;
  return (
    <span className={improved ? 'text-emerald-400' : 'text-red-400'}>
      {improved ? '+' : ''}{delta.toFixed(1)}
    </span>
  );
}

function KwTrendArrow({ trend }: { trend: KeywordDelta['trend'] }) {
  if (trend === 'up') return <span className="text-emerald-400">↑</span>;
  if (trend === 'down') return <span className="text-red-400">↓</span>;
  if (trend === 'new') return <span className="text-blue-400 text-[10px]">new</span>;
  return <span className="text-neutral-600">→</span>;
}

export function KeywordRankTable({ deltas, limit = 20 }: { deltas: KeywordDelta[]; limit?: number }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-neutral-600 border-b border-neutral-800">
            <th className="text-left py-2 pr-4 font-medium">Query</th>
            <th className="text-right py-2 px-3 font-medium">Position</th>
            <th className="text-right py-2 px-3 font-medium">7d Δ</th>
            <th className="text-right py-2 px-3 font-medium">30d Δ</th>
            <th className="text-right py-2 pl-3 font-medium">Trend</th>
          </tr>
        </thead>
        <tbody>
          {deltas.slice(0, limit).map((kw) => (
            <tr key={kw.query} className="border-b border-neutral-800/50 hover:bg-neutral-800/30">
              <td className="py-1.5 pr-4 text-neutral-300 font-mono truncate max-w-xs">{kw.query}</td>
              <td className="py-1.5 px-3 text-right font-mono text-neutral-300">{kw.currentPosition.toFixed(1)}</td>
              <td className="py-1.5 px-3 text-right font-mono"><KwDeltaCell delta={kw.delta7d} /></td>
              <td className="py-1.5 px-3 text-right font-mono"><KwDeltaCell delta={kw.delta30d} /></td>
              <td className="py-1.5 pl-3 text-right"><KwTrendArrow trend={kw.trend} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
