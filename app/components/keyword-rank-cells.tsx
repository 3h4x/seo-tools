import type { KeywordDelta } from '@/lib/keyword-history';

export function KwDeltaCell({ delta }: { delta: number | null }) {
  if (delta === null) return <span className="text-neutral-700">—</span>;
  if (Math.abs(delta) < 0.1) return <span className="text-neutral-500">±0</span>;
  const improved = delta > 0;
  return (
    <span className={improved ? 'text-emerald-400' : 'text-red-400'}>
      {improved ? '+' : ''}{delta.toFixed(1)}
    </span>
  );
}

export function KwTrendArrow({ trend }: { trend: KeywordDelta['trend'] }) {
  if (trend === 'up') return <span className="text-emerald-400">↑</span>;
  if (trend === 'down') return <span className="text-red-400">↓</span>;
  if (trend === 'new') return <span className="text-blue-400 text-[10px]">new</span>;
  return <span className="text-neutral-600">→</span>;
}
