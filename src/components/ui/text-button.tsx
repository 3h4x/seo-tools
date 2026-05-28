import Link from 'next/link';
import type { LinkProps } from 'next/link';
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from 'react';

type TextButtonVariant = 'neutral' | 'quiet' | 'muted' | 'danger' | 'danger-muted' | 'reorder';
type TextButtonSize = 'xs' | 'xxs';

interface TextButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  variant?: TextButtonVariant;
  size?: TextButtonSize;
}

interface TextLinkProps extends LinkProps, Omit<AnchorHTMLAttributes<HTMLAnchorElement>, keyof LinkProps> {
  children: ReactNode;
  variant?: TextButtonVariant;
  size?: TextButtonSize;
}

const VARIANT_CLASSES: Record<TextButtonVariant, string> = {
  neutral: 'text-neutral-400 hover:text-white disabled:opacity-40',
  quiet: 'text-neutral-500 hover:text-white disabled:opacity-40',
  muted: 'text-neutral-500 hover:text-neutral-300 disabled:opacity-40',
  danger: 'text-red-400 hover:text-red-300 disabled:opacity-40',
  'danger-muted': 'text-neutral-600 hover:text-red-400 disabled:opacity-40',
  reorder: 'text-neutral-500 hover:text-white disabled:opacity-30',
};

const SIZE_CLASSES: Record<TextButtonSize, string> = {
  xs: 'text-xs',
  xxs: 'text-[11px]',
};

function getTextActionClassName(
  className: string | undefined,
  size: TextButtonSize,
  variant: TextButtonVariant
) {
  return `${SIZE_CLASSES[size]} transition-colors ${VARIANT_CLASSES[variant]} ${className ?? ''}`;
}

export function TextButton({
  children,
  className = '',
  size = 'xs',
  type = 'button',
  variant = 'neutral',
  ...props
}: TextButtonProps) {
  return (
    <button
      className={getTextActionClassName(className, size, variant)}
      type={type}
      {...props}
    >
      {children}
    </button>
  );
}

export function TextLink({
  children,
  className = '',
  size = 'xs',
  variant = 'neutral',
  ...props
}: TextLinkProps) {
  return (
    <Link
      className={getTextActionClassName(className, size, variant)}
      {...props}
    >
      {children}
    </Link>
  );
}
