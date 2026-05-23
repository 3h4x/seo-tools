import type { ReactNode } from 'react';

interface ToggleButtonOption<T extends string> {
  value: T;
  label: ReactNode;
}

interface ToggleButtonGroupProps<T extends string> {
  options: ReadonlyArray<ToggleButtonOption<T>>;
  activeValues: ReadonlySet<T>;
  onToggle: (value: T) => void;
  ariaLabel?: string;
  renderLabel?: (option: ToggleButtonOption<T>, active: boolean) => ReactNode;
  className?: string;
  getButtonClassName?: (option: ToggleButtonOption<T>, active: boolean) => string;
}

const DEFAULT_GROUP_CLASS = 'flex gap-1 bg-neutral-800 rounded-md p-0.5';
const DEFAULT_ACTIVE_BUTTON_CLASS = 'bg-neutral-700 text-white';
const DEFAULT_INACTIVE_BUTTON_CLASS = 'text-neutral-400 hover:text-white';

export function ToggleButtonGroup<T extends string>({
  options,
  activeValues,
  onToggle,
  ariaLabel,
  renderLabel,
  className,
  getButtonClassName,
}: ToggleButtonGroupProps<T>) {
  return (
    <div role="group" aria-label={ariaLabel} className={className ?? DEFAULT_GROUP_CLASS}>
      {options.map((option) => {
        const active = activeValues.has(option.value);
        const buttonClassName =
          getButtonClassName?.(option, active) ??
          `px-2.5 py-1 text-xs rounded transition-colors ${
            active ? DEFAULT_ACTIVE_BUTTON_CLASS : DEFAULT_INACTIVE_BUTTON_CLASS
          }`;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onToggle(option.value)}
            aria-pressed={active ? 'true' : 'false'}
            className={buttonClassName}
          >
            {renderLabel ? renderLabel(option, active) : option.label}
          </button>
        );
      })}
    </div>
  );
}
