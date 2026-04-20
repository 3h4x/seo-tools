import type { GapRecommendation, GapSeverity } from '@/lib/gaps';
import { CATEGORY_LABELS } from '@/lib/gaps';

export const SEVERITY_COLORS: Record<GapSeverity, { bg: string; text: string; dot: string }> = {
  high: { bg: 'bg-red-500/10', text: 'text-red-400', dot: 'bg-red-500' },
  medium: { bg: 'bg-amber-500/10', text: 'text-amber-400', dot: 'bg-amber-500' },
  low: { bg: 'bg-blue-500/10', text: 'text-blue-400', dot: 'bg-blue-500' },
};

export function Recommendation({ gap }: { gap: GapRecommendation }) {
  const colors = SEVERITY_COLORS[gap.severity];
  return (
    <div className={`mt-3 rounded-md ${colors.bg} border border-neutral-800 p-4`}>
      <div className="flex items-center gap-2 mb-1.5">
        <div className={`size-1.5 rounded-full ${colors.dot}`} />
        <span className={`text-xs font-semibold ${colors.text}`}>
          {gap.severity === 'high' ? 'High' : gap.severity === 'medium' ? 'Medium' : 'Low'} priority
        </span>
        <span className="text-neutral-600 text-xs">{CATEGORY_LABELS[gap.category] || gap.category}</span>
      </div>
      <p className="text-neutral-300 text-sm font-medium">{gap.title}</p>
      <p className="text-neutral-500 text-xs mt-1">{gap.description}</p>
      <details className="mt-2">
        <summary className="text-neutral-500 text-xs cursor-pointer hover:text-neutral-300 transition-colors">How to fix</summary>
        <pre className="text-neutral-400 text-xs font-mono mt-1.5 whitespace-pre-wrap">{gap.hint}</pre>
      </details>
    </div>
  );
}
