'use client';

import { useRouter, usePathname, useSearchParams } from 'next/navigation';

const DEFAULT_RANGES = [
  { value: '1', label: '1d' },
  { value: '7', label: '7d' },
  { value: '30', label: '30d' },
  { value: '90', label: '90d' },
  { value: '180', label: '180d' },
  { value: '365', label: '1y' },
];

export default function TimeRange({
  param = 'days',
  options = DEFAULT_RANGES,
  defaultValue = '7',
}: {
  param?: string;
  options?: { value: string; label: string }[];
  defaultValue?: string;
} = {}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const current = searchParams.get(param) || defaultValue;

  return (
    <div className="flex gap-1 bg-neutral-800 rounded-md p-0.5">
      {options.map((r) => (
        <button
          key={r.value}
          onClick={() => {
            const params = new URLSearchParams(searchParams);
            params.set(param, r.value);
            router.push(`${pathname}?${params.toString()}`);
          }}
          className={`px-2.5 py-1 text-xs rounded transition-colors ${
            current === r.value
              ? 'bg-neutral-700 text-white'
              : 'text-neutral-400 hover:text-white'
          }`}
        >
          {r.label}
        </button>
      ))}
    </div>
  );
}
