import type { HTMLAttributes, ReactNode } from 'react';

type NoticeTone = 'warning' | 'info' | 'neutral' | 'danger' | 'success';
type NoticeSize = 'xs' | 'sm' | 'md' | 'card' | 'panel' | 'lg' | 'spacious' | 'none';
type NoticeAccent = 'none' | 'left';

interface NoticeProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  accent?: NoticeAccent;
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

const LEFT_ACCENT_CLASSES: Record<NoticeTone, string> = {
  warning: 'border-l-4 border-l-amber-500',
  info: 'border-l-4 border-l-blue-500',
  neutral: 'border-l-4 border-l-neutral-600',
  danger: 'border-l-4 border-l-red-500',
  success: 'border-l-4 border-l-emerald-500',
};

export function Notice({
  children,
  accent = 'none',
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
        accent === 'left' ? LEFT_ACCENT_CLASSES[tone] : undefined,
        className,
      ].filter(Boolean).join(' ')}
      {...props}
    >
      {children}
    </div>
  );
}
