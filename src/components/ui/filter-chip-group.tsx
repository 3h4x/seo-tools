import type { ReactNode } from 'react';

interface FilterChipOption<T extends string> {
  value: T;
  label: ReactNode;
  href?: string;
  count?: number;
  activeClassName?: string;
  countActiveClassName?: string;
}

type FilterChipGroupProps<T extends string> = {
  options: ReadonlyArray<FilterChipOption<T>>;
  value: T | null;
  ariaLabel?: string;
  hideZeroCounts?: boolean;
} & (
  | { onChange: (value: T | null) => void }
  | { onChange?: never }
);

const DEFAULT_ACTIVE_CLASS = 'bg-white/10 text-white border-white/20';
const DEFAULT_INACTIVE_CLASS =
  'bg-neutral-800 text-neutral-400 border-neutral-700 hover:text-white hover:border-neutral-500';

export function FilterChipGroup<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  hideZeroCounts,
}: FilterChipGroupProps<T>) {
  return (
    <div role="group" aria-label={ariaLabel} className="flex flex-wrap gap-1.5">
      {options.map((option) => {
        if (hideZeroCounts && option.count === 0) return null;
        const active = value === option.value;
        const activeClass = option.activeClassName ?? DEFAULT_ACTIVE_CLASS;
        const className = `text-xs px-2.5 py-1 rounded-full border transition-colors ${
          active ? activeClass : DEFAULT_INACTIVE_CLASS
        }`;
        const content = (
          <>
            {option.label}
            {option.count !== undefined && (
              <span
                className={`ml-1.5 font-mono text-[10px] ${
                  active
                    ? option.countActiveClassName ?? 'text-neutral-300'
                    : 'text-neutral-600'
                }`}
              >
                {option.count}
              </span>
            )}
          </>
        );

        if (option.href) {
          return (
            <a
              key={option.value}
              href={option.href}
              aria-current={active ? 'page' : undefined}
              className={className}
            >
              {content}
            </a>
          );
        }

        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active ? 'true' : 'false'}
            onClick={() => onChange?.(active ? null : option.value)}
            className={className}
          >
            {content}
          </button>
        );
      })}
    </div>
  );
}
