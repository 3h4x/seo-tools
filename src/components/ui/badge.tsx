import type { HTMLAttributes, ReactNode } from 'react';

const BADGE_SIZE = {
  xs: 'px-2 py-0.5 text-[10px]',
  sm: 'px-2 py-0.5 text-[11px]',
  compact: 'px-1.5 py-0.5 text-xs',
  md: 'px-3 py-2 text-xs',
} as const;

const BADGE_SHAPE = {
  rounded: 'rounded',
  pill: 'rounded-full',
} as const;

type BadgeProps = HTMLAttributes<HTMLSpanElement> & {
  children: ReactNode;
  size?: keyof typeof BADGE_SIZE;
  shape?: keyof typeof BADGE_SHAPE;
  uppercase?: boolean;
};

export function Badge({
  children,
  className,
  size = 'xs',
  shape = 'pill',
  uppercase = false,
  ...props
}: BadgeProps) {
  return (
    <span
      className={[
        'inline-flex items-center border font-medium',
        BADGE_SIZE[size],
        BADGE_SHAPE[shape],
        uppercase ? 'uppercase tracking-wider' : undefined,
        className,
      ].filter(Boolean).join(' ')}
      {...props}
    >
      {children}
    </span>
  );
}
