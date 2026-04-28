import type { CheckStatus, CheckResult } from '@/lib/audit';
import type { GapRecommendation } from '@/lib/gaps';
import { CATEGORY_LABELS, GAP_SEVERITY_STYLES } from '@/lib/gaps';

export const statusColors: Record<CheckStatus, string> = {
  pass: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  warn: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  fail: 'bg-red-500/10 text-red-400 border-red-500/20',
  error: 'bg-neutral-500/10 text-neutral-400 border-neutral-500/20',
};

export const statusDots: Record<CheckStatus, string> = {
  pass: 'bg-emerald-500',
  warn: 'bg-amber-500',
  fail: 'bg-red-500',
  error: 'bg-neutral-500',
};

export const accentBorder: Record<CheckStatus, string> = {
  pass: 'border-l-emerald-500',
  warn: 'border-l-amber-500',
  fail: 'border-l-red-500',
  error: 'border-l-neutral-600',
};

export function StatusBadge({ status, label }: { status: CheckStatus; label?: string }) {
  const labels: Record<CheckStatus, string> = { pass: 'Pass', warn: 'Warn', fail: 'Fail', error: 'Error' };
  return (
    <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${statusColors[status]}`}>
      {label ?? labels[status]}
    </span>
  );
}

export function Recommendation({ gap }: { gap: GapRecommendation }) {
  const s = GAP_SEVERITY_STYLES[gap.severity];
  return (
    <div className={`mt-3 rounded-md ${s.bg} border border-neutral-800 p-4`}>
      <div className="flex items-center gap-2 mb-1.5">
        <div className={`size-1.5 rounded-full ${s.dot}`} />
        <span className={`text-xs font-semibold ${s.text}`}>
          {s.label} priority
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

export function MetaChecksTable({ checks }: { checks: CheckResult[] }) {
  return (
    <div className="space-y-1">
      {checks.map((c, i) => (
        <div key={i} className="flex items-center gap-3 text-xs py-1">
          <div className={`size-1.5 rounded-full shrink-0 ${statusDots[c.status]}`} />
          <span className="text-neutral-500 w-28 shrink-0">{c.label}</span>
          <span className={`font-mono truncate ${c.status === 'fail' ? 'text-red-400' : 'text-neutral-300'}`}>
            {c.message}
          </span>
        </div>
      ))}
    </div>
  );
}

export function CheckCard({ check, gaps, children }: { check: CheckResult; gaps?: GapRecommendation[]; children?: React.ReactNode }) {
  return (
    <div className={`bg-neutral-900 rounded-lg border border-neutral-800 border-l-4 ${accentBorder[check.status]} p-5`}>
      <div className="flex items-center gap-3 mb-2">
        <StatusBadge status={check.status} />
        <span className="text-white font-semibold text-sm">{check.label}</span>
      </div>
      <p className="text-neutral-400 text-sm font-mono">{check.message}</p>
      {check.details && <p className="text-neutral-600 text-xs mt-2">{check.details}</p>}
      {children}
      {gaps?.map(g => <Recommendation key={g.id} gap={g} />)}
    </div>
  );
}
