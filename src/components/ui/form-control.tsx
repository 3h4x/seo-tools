import type { InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';

const CONTROL_CLASSES =
  'w-full border border-neutral-700 text-sm focus:outline-none focus:border-neutral-500';

const CONTROL_TONE = {
  default: 'bg-neutral-900 rounded-md text-neutral-200',
  dense: 'bg-neutral-800 rounded text-white',
} as const;

const CONTROL_PADDING = {
  default: 'p-2.5',
  dense: 'px-3 py-2',
  compact: 'px-3 py-1.5',
  roomy: 'p-3',
} as const;

interface FormInputProps extends InputHTMLAttributes<HTMLInputElement> {
  monospace?: boolean;
  padding?: keyof typeof CONTROL_PADDING;
  tone?: keyof typeof CONTROL_TONE;
}

interface FormSelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  monospace?: boolean;
  padding?: keyof typeof CONTROL_PADDING;
  tone?: keyof typeof CONTROL_TONE;
}

interface FormTextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  monospace?: boolean;
  padding?: keyof typeof CONTROL_PADDING;
  tone?: keyof typeof CONTROL_TONE;
}

type FormCheckboxProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>;

function getControlClassName(
  className: string | undefined,
  monospace: boolean,
  padding: keyof typeof CONTROL_PADDING,
  tone: keyof typeof CONTROL_TONE
) {
  return [CONTROL_CLASSES, CONTROL_TONE[tone], CONTROL_PADDING[padding], monospace ? 'font-mono' : undefined, className]
    .filter(Boolean)
    .join(' ');
}

export function FormInput({ className, monospace = false, padding = 'default', tone = 'default', ...props }: FormInputProps) {
  return (
    <input
      className={getControlClassName(className, monospace, padding, tone)}
      {...props}
    />
  );
}

export function FormSelect({ className, monospace = false, padding = 'default', tone = 'default', ...props }: FormSelectProps) {
  return (
    <select
      className={getControlClassName(className, monospace, padding, tone)}
      {...props}
    />
  );
}

export function FormTextarea({ className, monospace = false, padding = 'default', tone = 'default', ...props }: FormTextareaProps) {
  return (
    <textarea
      className={getControlClassName(className, monospace, padding, tone)}
      {...props}
    />
  );
}

export function FormCheckbox({ className, ...props }: FormCheckboxProps) {
  return (
    <input
      type="checkbox"
      className={['rounded border-neutral-600', className].filter(Boolean).join(' ')}
      {...props}
    />
  );
}
