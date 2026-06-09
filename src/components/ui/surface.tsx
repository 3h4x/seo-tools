import type { HTMLAttributes, ReactNode } from 'react';

type SurfacePadding = 'none' | 'xs' | 'sm' | 'md';

interface SurfaceProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  leftAccentClassName?: string;
  padding?: SurfacePadding;
}

const PADDING_CLASSES: Record<SurfacePadding, string> = {
  none: '',
  xs: 'p-3',
  sm: 'p-4',
  md: 'p-5',
};

export function Surface({
  children,
  className,
  leftAccentClassName,
  padding = 'md',
  ...props
}: SurfaceProps) {
  return (
    <div
      className={[
        'rounded-lg border border-neutral-800 bg-neutral-900',
        PADDING_CLASSES[padding],
        leftAccentClassName && 'border-l-4',
        leftAccentClassName,
        className,
      ].filter(Boolean).join(' ')}
      {...props}
    >
      {children}
    </div>
  );
}
