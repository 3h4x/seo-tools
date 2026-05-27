import type { HTMLAttributes, ReactNode } from 'react';

type NoticeTone = 'warning' | 'info' | 'neutral';
type NoticeSize = 'sm' | 'md';

interface NoticeProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  tone?: NoticeTone;
  size?: NoticeSize;
}

const TONE_CLASSES: Record<NoticeTone, string> = {
  warning: 'border-amber-500/30 bg-amber-500/10 text-amber-200',
  info: 'border-blue-500/40 bg-blue-500/10 text-blue-200',
  neutral: 'border-neutral-800 bg-neutral-900/60 text-neutral-300',
};

const SIZE_CLASSES: Record<NoticeSize, string> = {
  sm: 'px-3 py-2 text-sm',
  md: 'px-4 py-3 text-sm',
};

export function Notice({
  children,
  className,
  size = 'md',
  tone = 'neutral',
  ...props
}: NoticeProps) {
  return (
    <div
      className={[
        'rounded-md border',
        TONE_CLASSES[tone],
        SIZE_CLASSES[size],
        className,
      ].filter(Boolean).join(' ')}
      {...props}
    >
      {children}
    </div>
  );
}
