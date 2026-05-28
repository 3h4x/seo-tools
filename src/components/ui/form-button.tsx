import type { ButtonHTMLAttributes, ReactNode } from 'react';

type FormButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'muted' | 'success';
type FormButtonSize = 'md' | 'sm' | 'xs' | 'row';

interface FormButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  variant?: FormButtonVariant;
  size?: FormButtonSize;
}

const VARIANT_CLASSES: Record<FormButtonVariant, string> = {
  primary: 'bg-white text-black hover:bg-neutral-200 disabled:opacity-40 disabled:cursor-not-allowed',
  secondary: 'bg-neutral-800 text-white hover:bg-neutral-700 disabled:opacity-40 disabled:cursor-not-allowed',
  danger: 'bg-neutral-800 text-red-400 hover:bg-neutral-700 disabled:opacity-40 disabled:cursor-not-allowed',
  ghost: 'bg-transparent text-neutral-300 hover:bg-transparent hover:text-white disabled:opacity-40 disabled:cursor-not-allowed',
  muted: 'bg-neutral-800 text-neutral-400 hover:bg-neutral-700 hover:text-neutral-300 disabled:opacity-40 disabled:cursor-not-allowed',
  success: 'bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20 disabled:opacity-40 disabled:cursor-not-allowed',
};

const SIZE_CLASSES: Record<FormButtonSize, string> = {
  md: 'px-4 py-2 text-sm',
  sm: 'px-3 py-1.5 text-sm',
  xs: 'px-3 py-1.5 text-xs',
  row: 'px-4 py-3 text-sm',
};

export function FormButton({
  children,
  className = '',
  size = 'md',
  type = 'button',
  variant = 'secondary',
  ...props
}: FormButtonProps) {
  return (
    <button
      className={`${SIZE_CLASSES[size]} rounded-md transition-colors ${VARIANT_CLASSES[variant]} ${className}`}
      type={type}
      {...props}
    >
      {children}
    </button>
  );
}
