import type { ButtonHTMLAttributes, ReactNode } from 'react';

type FormButtonVariant = 'primary' | 'secondary' | 'danger';

interface FormButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  variant?: FormButtonVariant;
}

const VARIANT_CLASSES: Record<FormButtonVariant, string> = {
  primary: 'bg-white text-black hover:bg-neutral-200 disabled:opacity-40 disabled:cursor-not-allowed',
  secondary: 'bg-neutral-800 text-white hover:bg-neutral-700 disabled:opacity-40 disabled:cursor-not-allowed',
  danger: 'bg-neutral-800 text-red-400 hover:bg-neutral-700',
};

export function FormButton({
  children,
  className = '',
  variant = 'secondary',
  ...props
}: FormButtonProps) {
  return (
    <button
      className={`px-4 py-2 rounded-md text-sm transition-colors ${VARIANT_CLASSES[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
