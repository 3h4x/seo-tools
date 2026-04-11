import { TrendBadge } from './trend-badge';

export function SummaryCard({ icon, label, value, previous, accent }: {
  icon: React.ReactNode;
  label: string;
  value: number;
  previous?: number;
  accent: string;
}) {
  return (
    <div className={`bg-neutral-900 rounded-lg border border-neutral-800 border-l-4 ${accent} p-4`}>
      <div className="flex items-center gap-2 text-neutral-500 mb-2">
        {icon}
        <span className="text-xs uppercase tracking-wider">{label}</span>
      </div>
      <div className="flex items-baseline gap-2">
        <span className="text-white text-2xl font-mono font-bold">
          {value > 0 ? value.toLocaleString() : '\u2014'}
        </span>
        {previous !== undefined && value > 0 && (
          <TrendBadge current={value} previous={previous} />
        )}
      </div>
    </div>
  );
}
