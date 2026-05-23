'use client';

import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { SegmentedControl } from '@/components/ui';

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
  const requestedValue = searchParams.get(param);
  const current = options.some((option) => option.value === requestedValue) ? requestedValue! : defaultValue;

  return (
    <SegmentedControl
      ariaLabel="Time range"
      options={options}
      value={current}
      onChange={(value) => {
        const params = new URLSearchParams(searchParams);
        params.set(param, value);
        router.push(`${pathname}?${params.toString()}`);
      }}
    />
  );
}
