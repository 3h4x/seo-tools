import type { CheckResult } from '@/lib/audit';
import { statusDots } from './check-card';

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
