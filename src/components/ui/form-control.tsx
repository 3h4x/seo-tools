import type { InputHTMLAttributes, TextareaHTMLAttributes } from 'react';

const CONTROL_CLASSES =
  'w-full bg-neutral-900 border border-neutral-700 rounded-md p-2.5 text-sm text-neutral-200 focus:outline-none focus:border-neutral-500';

interface FormInputProps extends InputHTMLAttributes<HTMLInputElement> {
  monospace?: boolean;
}

interface FormTextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  monospace?: boolean;
}

function getControlClassName(className: string | undefined, monospace: boolean) {
  return [CONTROL_CLASSES, monospace ? 'font-mono' : undefined, className].filter(Boolean).join(' ');
}

export function FormInput({ className, monospace = false, ...props }: FormInputProps) {
  return (
    <input
      className={getControlClassName(className, monospace)}
      {...props}
    />
  );
}

export function FormTextarea({ className, monospace = false, ...props }: FormTextareaProps) {
  return (
    <textarea
      className={getControlClassName(className, monospace)}
      {...props}
    />
  );
}
