import type { CheckStatus, CheckResult } from '@/lib/audit';
import type { GapRecommendation } from '@/lib/gap-definitions';
import { CATEGORY_LABELS, GAP_SEVERITY_STYLES } from '@/lib/gap-definitions';
import { STATUS_COLORS } from '@/lib/constants';
import { Badge, Disclosure, Notice, Surface } from '@/components/ui';

const statusColors: Record<CheckStatus, string> = {
  pass: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  warn: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  fail: 'bg-red-500/10 text-red-400 border-red-500/20',
  error: 'bg-neutral-500/10 text-neutral-400 border-neutral-500/20',
};

export const statusDots: Record<CheckStatus, string> = {
  pass: STATUS_COLORS.pass.dot,
  warn: STATUS_COLORS.warn.dot,
  fail: STATUS_COLORS.fail.dot,
  error: STATUS_COLORS.error.dot,
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
    <Badge className={statusColors[status]}>
      {label ?? labels[status]}
    </Badge>
  );
}

export function Recommendation({ gap }: { gap: GapRecommendation }) {
  const s = GAP_SEVERITY_STYLES[gap.severity];
  return (
    <Notice size="card" className={`mt-3 ${s.bg} border-neutral-800`}>
      <div className="flex items-center gap-2 mb-1.5">
        <Badge size="compact" shape="rounded" className={`gap-1.5 ${s.bg} ${s.text} border-neutral-800`}>
          <span className={`size-1.5 rounded-full ${s.dot}`} aria-hidden="true" />
          {s.label} priority
        </Badge>
        <Badge size="compact" shape="rounded" className="border-neutral-800 text-neutral-600">
          {CATEGORY_LABELS[gap.category] || gap.category}
        </Badge>
      </div>
      <p className="text-neutral-300 text-sm font-medium">{gap.title}</p>
      <p className="text-neutral-500 text-xs mt-1">{gap.description}</p>
      {gap.evidence && gap.evidence.length > 0 && (
        <div className="mt-2 space-y-1">
          {gap.evidence.map((line) => (
            <div key={line} className="text-neutral-400 text-xs font-mono break-all">
              {line}
            </div>
          ))}
        </div>
      )}
      <Disclosure
        className="mt-2"
        summary="How to fix"
        summaryClassName="text-neutral-500 text-xs cursor-pointer hover:text-neutral-300 transition-colors"
      >
        <pre className="text-neutral-400 text-xs font-mono mt-1.5 whitespace-pre-wrap">{gap.hint}</pre>
      </Disclosure>
    </Notice>
  );
}

export function MetaChecksTable({ checks }: { checks: CheckResult[] }) {
  return (
    <div className="space-y-1">
      {checks.map((c, i) => (
        <div key={i} className="py-1">
          <div className="flex items-center gap-3 text-xs">
            <div className={`size-1.5 rounded-full shrink-0 ${statusDots[c.status]}`} />
            <span className="text-neutral-500 w-28 shrink-0">{c.label}</span>
            <span className={`font-mono truncate ${c.status === 'pass' ? 'text-neutral-300' : STATUS_COLORS[c.status].text}`}>
              {c.message}
            </span>
          </div>
          {c.details && (
            <pre className="ml-[calc(0.375rem+0.75rem+7rem)] mt-1 whitespace-pre-wrap break-words text-[11px] text-neutral-500 font-mono">
              {c.details}
            </pre>
          )}
        </div>
      ))}
    </div>
  );
}

export function CheckCard({ check, gaps, children }: { check: CheckResult; gaps?: GapRecommendation[]; children?: React.ReactNode }) {
  return (
    <Surface className={`border-l-4 ${accentBorder[check.status]}`}>
      <div className="flex items-center gap-3 mb-2">
        <StatusBadge status={check.status} />
        <span className="text-white font-semibold text-sm">{check.label}</span>
      </div>
      <p className="text-neutral-400 text-sm font-mono">{check.message}</p>
      {check.details && <p className="text-neutral-600 text-xs mt-2">{check.details}</p>}
      {children}
      {gaps?.map(g => <Recommendation key={g.id} gap={g} />)}
    </Surface>
  );
}
