export function PartialFailureBanner({ failures }: { failures: string[] }) {
  if (failures.length === 0) return null;
  return (
    <div
      role="status"
      className="rounded-md border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-200"
    >
      <span className="font-semibold">Some data sources are unavailable: </span>
      <span className="text-amber-100/80">{failures.join(', ')}</span>
      <span className="text-amber-100/60"> — use Refresh to retry.</span>
    </div>
  );
}
