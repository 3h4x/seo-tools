import type { HTMLAttributes } from 'react';

export function Divider({ className, ...props }: HTMLAttributes<HTMLHRElement>) {
  return (
    <hr
      className={['border-neutral-800', className].filter(Boolean).join(' ')}
      {...props}
    />
  );
}
