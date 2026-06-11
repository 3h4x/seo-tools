import type { CSSProperties, HTMLAttributes, Key } from 'react';

interface ProgressBarProps extends HTMLAttributes<HTMLDivElement> {
  value?: number;
  fillClassName?: string;
  segments?: ProgressBarSegment[];
}

interface ProgressBarSegment {
  key: Key;
  value: number;
  className?: string;
  style?: CSSProperties;
}

export function ProgressBar({
  value,
  className,
  fillClassName = 'bg-blue-500/50',
  segments,
  ...props
}: ProgressBarProps) {
  const width = Number.isFinite(value) ? Math.min(Math.max(value ?? 0, 0), 100) : 0;
  const safeSegments = segments?.filter(segment => segment.value > 0);

  return (
    <div
      className={[
        'bg-neutral-800 rounded-full overflow-hidden',
        safeSegments ? 'flex gap-px' : undefined,
        className,
      ].filter(Boolean).join(' ')}
      {...props}
    >
      {safeSegments ? (
        safeSegments.map((segment) => (
          <div
            key={segment.key}
            className={[
              'h-full transition-all first:rounded-l-full last:rounded-r-full',
              segment.className,
            ].filter(Boolean).join(' ')}
            style={{ ...segment.style, width: `${Math.min(Math.max(segment.value, 0), 100)}%` }}
          />
        ))
      ) : (
        <div
          className={[
            'h-full rounded-full',
            fillClassName,
          ].filter(Boolean).join(' ')}
          style={{ width: `${width}%` }}
        />
      )}
    </div>
  );
}
