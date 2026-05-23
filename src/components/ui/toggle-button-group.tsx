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
}

export function ToggleButtonGroup<T extends string>({
  options,
  activeValues,
  onToggle,
  ariaLabel,
  renderLabel,
}: ToggleButtonGroupProps<T>) {
  return (
    <div role="group" aria-label={ariaLabel} className="flex gap-1 bg-neutral-800 rounded-md p-0.5">
      {options.map((option) => {
        const active = activeValues.has(option.value);
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onToggle(option.value)}
            aria-pressed={active ? 'true' : 'false'}
            className={`px-2.5 py-1 text-xs rounded transition-colors ${
              active
                ? 'bg-neutral-700 text-white'
                : 'text-neutral-400 hover:text-white'
            }`}
          >
            {renderLabel ? renderLabel(option, active) : option.label}
          </button>
        );
      })}
    </div>
  );
}
