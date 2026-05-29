import type { HTMLAttributes, ReactNode } from 'react';

type SurfacePadding = 'none' | 'md';

interface SurfaceProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  padding?: SurfacePadding;
}

const PADDING_CLASSES: Record<SurfacePadding, string> = {
  none: '',
  md: 'p-5',
};

export function Surface({
  children,
  className,
  padding = 'md',
  ...props
}: SurfaceProps) {
  return (
    <div
      className={[
        'rounded-lg border border-neutral-800 bg-neutral-900',
        PADDING_CLASSES[padding],
        className,
      ].filter(Boolean).join(' ')}
      {...props}
    >
      {children}
    </div>
  );
}
