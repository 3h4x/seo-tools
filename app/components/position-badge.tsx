export function PositionBadge({ position }: { position: number }) {
  const pos = Math.round(position);
  let cls: string;
  let label: string;

  if (pos <= 3) {
    cls = 'bg-amber-500/20 text-amber-300 border border-amber-500/30';
    label = '🥇';
  } else if (pos <= 10) {
    cls = 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/25';
    label = 'p1';
  } else if (pos <= 20) {
    cls = 'bg-blue-500/15 text-blue-300 border border-blue-500/25';
    label = 'p2';
  } else {
    cls = 'bg-neutral-700/30 text-neutral-500 border border-neutral-700/30';
    label = 'p3+';
  }

  return (
    <span className="inline-flex items-center gap-1 font-mono text-xs">
      <span className={`text-[9px] px-1 py-0 rounded ${cls}`}>{label}</span>
      <span className="text-neutral-400">{position.toFixed(1)}</span>
    </span>
  );
}
