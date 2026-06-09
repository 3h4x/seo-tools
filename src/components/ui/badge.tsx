import type { HTMLAttributes, ReactNode } from 'react';

const BADGE_SIZE = {
  inline: 'p-0 text-[10px]',
  xs: 'px-2 py-0.5 text-[10px]',
  sm: 'px-2 py-0.5 text-[11px]',
  compact: 'px-1.5 py-0.5 text-xs',
  md: 'px-3 py-2 text-xs',
} as const;

const BADGE_SHAPE = {
  rounded: 'rounded',
  pill: 'rounded-full',
} as const;

const BADGE_TONE = {
  neutral: '',
  muted: 'border-neutral-700 bg-neutral-900 text-neutral-400',
  mutedText: 'text-neutral-700',
  subtle: 'border-neutral-700 bg-neutral-900 text-neutral-500',
  success: 'border-emerald-800/80 bg-emerald-950/50 text-emerald-300',
  successMuted: 'border-emerald-900/80 bg-emerald-950/40 text-emerald-300',
  successText: 'text-emerald-400',
  danger: 'border-red-900/80 bg-red-950/40 text-red-300',
  dangerText: 'text-red-400',
  gapHigh: 'border-red-500/20 bg-red-500/10 text-red-400',
  gapMedium: 'border-amber-500/20 bg-amber-500/10 text-amber-400',
  gapLow: 'border-blue-500/20 bg-blue-500/10 text-blue-400',
  warning: 'border-amber-900/80 bg-amber-950/40 text-amber-300',
  warningText: 'text-amber-400',
  info: 'border-sky-900/80 bg-sky-950/40 text-sky-300',
  infoText: 'text-blue-400',
  accent: 'border-violet-900/80 bg-violet-950/40 text-violet-300',
} as const;

type BadgeProps = HTMLAttributes<HTMLSpanElement> & {
  children: ReactNode;
  size?: keyof typeof BADGE_SIZE;
  shape?: keyof typeof BADGE_SHAPE;
  tone?: keyof typeof BADGE_TONE;
  borderless?: boolean;
  uppercase?: boolean;
};

export function Badge({
  children,
  className,
  size = 'xs',
  shape = 'pill',
  tone = 'neutral',
  borderless = false,
  uppercase = false,
  ...props
}: BadgeProps) {
  return (
    <span
      className={[
        borderless ? 'inline-flex items-center border-0 bg-transparent font-medium' : 'inline-flex items-center border font-medium',
        BADGE_SIZE[size],
        BADGE_SHAPE[shape],
        BADGE_TONE[tone],
        uppercase ? 'uppercase tracking-wider' : undefined,
        className,
      ].filter(Boolean).join(' ')}
      {...props}
    >
      {children}
    </span>
  );
}
