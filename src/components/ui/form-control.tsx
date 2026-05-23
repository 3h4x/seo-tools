import type { InputHTMLAttributes, TextareaHTMLAttributes } from 'react';

const CONTROL_CLASSES =
  'w-full bg-neutral-900 border border-neutral-700 rounded-md text-sm text-neutral-200 focus:outline-none focus:border-neutral-500';

const CONTROL_PADDING = {
  default: 'p-2.5',
  roomy: 'p-3',
} as const;

interface FormInputProps extends InputHTMLAttributes<HTMLInputElement> {
  monospace?: boolean;
}

interface FormTextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  monospace?: boolean;
  padding?: keyof typeof CONTROL_PADDING;
}

function getControlClassName(
  className: string | undefined,
  monospace: boolean,
  padding: keyof typeof CONTROL_PADDING
) {
  return [CONTROL_CLASSES, CONTROL_PADDING[padding], monospace ? 'font-mono' : undefined, className]
    .filter(Boolean)
    .join(' ');
}

export function FormInput({ className, monospace = false, ...props }: FormInputProps) {
  return (
    <input
      className={getControlClassName(className, monospace, 'default')}
      {...props}
    />
  );
}

export function FormTextarea({ className, monospace = false, padding = 'default', ...props }: FormTextareaProps) {
  return (
    <textarea
      className={getControlClassName(className, monospace, padding)}
      {...props}
    />
  );
}
