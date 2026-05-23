import type { ReactNode } from 'react';

interface SegmentedOption<T extends string> {
  value: T;
  label: ReactNode;
}

interface SegmentedControlProps<T extends string> {
  options: ReadonlyArray<SegmentedOption<T>>;
  value: T;
  onChange: (value: T) => void;
  ariaLabel?: string;
  renderLabel?: (option: SegmentedOption<T>, active: boolean) => ReactNode;
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  renderLabel,
}: SegmentedControlProps<T>) {
  return (
    <div role="tablist" aria-label={ariaLabel} className="flex gap-1 bg-neutral-800 rounded-md p-0.5">
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={active ? 'true' : 'false'}
            onClick={() => onChange(option.value)}
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
