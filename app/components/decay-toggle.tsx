'use client';

import { useRouter, usePathname, useSearchParams } from 'next/navigation';

const periods = [
  { value: '7', label: '7d' },
  { value: '30', label: '30d' },
];

export default function DecayToggle() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const current = searchParams.get('period') || '7';

  return (
    <div className="flex gap-1 bg-neutral-800 rounded-md p-0.5">
      {periods.map((p) => (
        <button
          key={p.value}
          onClick={() => {
            const params = new URLSearchParams(searchParams);
            params.set('period', p.value);
            router.push(`${pathname}?${params.toString()}`);
          }}
          className={`px-2.5 py-1 text-xs rounded transition-colors ${
            current === p.value
              ? 'bg-neutral-700 text-white'
              : 'text-neutral-400 hover:text-white'
          }`}
        >
          {p.label}
        </button>
      ))}
    </div>
  );
}
