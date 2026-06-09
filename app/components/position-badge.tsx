import type { ComponentProps } from 'react';
import { Badge } from '@/components/ui';

type BadgeTone = ComponentProps<typeof Badge>['tone'];

export function PositionBadge({ position }: { position: number }) {
  const pos = Math.round(position);
  let tone: BadgeTone;
  let label: string;

  if (pos <= 3) {
    tone = 'warning';
    label = '🥇';
  } else if (pos <= 10) {
    tone = 'successMuted';
    label = 'p1';
  } else if (pos <= 20) {
    tone = 'info';
    label = 'p2';
  } else {
    tone = 'subtle';
    label = 'p3+';
  }

  return (
    <span className="inline-flex items-center gap-1 font-mono text-xs">
      <Badge size="xs" shape="rounded" tone={tone} className="!px-1 !py-0 !text-[9px] !font-normal">
        {label}
      </Badge>
      <span className="text-neutral-400">{position.toFixed(1)}</span>
    </span>
  );
}
