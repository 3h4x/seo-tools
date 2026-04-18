import { pluralize, formatSource } from '@/lib/format';

interface TrafficSource {
  source: string;
  medium: string;
  sessions: number;
}

export function TrafficSourcesList({
  sources,
  limit,
}: {
  sources: TrafficSource[];
  limit?: number;
}) {
  const items = limit ? sources.slice(0, limit) : sources;
  if (items.length === 0) return <p className="text-neutral-600 text-sm">No traffic source data available.</p>;
  return (
    <div className="bg-neutral-900 rounded-lg border border-neutral-800 p-4">
      <div className="space-y-1.5">
        {items.map((src, i) => (
          <div key={i} className="flex items-center justify-between text-xs">
            <span className="text-neutral-400 font-mono">{formatSource(src.source, src.medium)}</span>
            <span className="text-neutral-500 font-mono">{pluralize(src.sessions, 'session')}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
