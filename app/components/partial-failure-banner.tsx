import { Notice } from '@/components/ui';

export function PartialFailureBanner({ failures }: { failures: string[] }) {
  if (failures.length === 0) return null;
  return (
    <Notice role="status" tone="warning" className="border-amber-500/40">
      <span className="font-semibold">Some data sources are unavailable: </span>
      <span className="text-amber-100/80">{failures.join(', ')}</span>
      <span className="text-amber-100/60"> — use Refresh to retry.</span>
    </Notice>
  );
}
