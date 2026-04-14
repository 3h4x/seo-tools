import type { CheckStatus, CheckResult } from '@/lib/audit';
import type { GapRecommendation } from '@/lib/gaps';
import { Recommendation } from './recommendation';

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

export function StatusBadge({ status }: { status: CheckStatus }) {
  const labels: Record<CheckStatus, string> = { pass: 'Pass', warn: 'Warn', fail: 'Fail', error: 'Error' };
  return (
    <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${statusColors[status]}`}>
      {labels[status]}
    </span>
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
