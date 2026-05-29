import type { HTMLAttributes, ReactNode } from 'react';

type NoticeTone = 'warning' | 'info' | 'neutral' | 'danger' | 'success';
type NoticeSize = 'xs' | 'sm' | 'md' | 'card' | 'panel' | 'lg' | 'spacious' | 'none';

interface NoticeProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  tone?: NoticeTone;
  size?: NoticeSize;
}

const TONE_CLASSES: Record<NoticeTone, string> = {
  warning: 'border-amber-500/30 bg-amber-500/10 text-amber-200',
  info: 'border-blue-500/40 bg-blue-500/10 text-blue-200',
  neutral: 'border-neutral-800 bg-neutral-900/60 text-neutral-300',
  danger: 'border-red-950 bg-neutral-900 text-neutral-300',
  success: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200',
};

const SIZE_CLASSES: Record<NoticeSize, string> = {
  xs: 'px-3 py-1.5 text-xs',
  sm: 'px-3 py-2 text-sm',
  md: 'px-4 py-3 text-sm',
  card: 'p-4',
  panel: 'p-5',
  lg: 'p-6',
  spacious: 'p-8',
  none: '',
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
