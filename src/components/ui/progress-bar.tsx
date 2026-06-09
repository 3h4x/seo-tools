import type { HTMLAttributes } from 'react';

interface ProgressBarProps extends HTMLAttributes<HTMLDivElement> {
  value: number;
  fillClassName?: string;
}

export function ProgressBar({
  value,
  className,
  fillClassName = 'bg-blue-500/50',
  ...props
}: ProgressBarProps) {
  const width = Number.isFinite(value) ? Math.min(Math.max(value, 0), 100) : 0;

  return (
    <div
      className={[
        'bg-neutral-800 rounded-full overflow-hidden',
        className,
      ].filter(Boolean).join(' ')}
      {...props}
    >
      <div
        className={[
          'h-full rounded-full',
          fillClassName,
        ].filter(Boolean).join(' ')}
        style={{ width: `${width}%` }}
      />
    </div>
  );
}
