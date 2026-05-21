import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactElement } from 'react';
import TimeRange from '../../../app/components/time-range';

type TimeRangeButtonElement = ReactElement<{ className?: string; children: string }>;
type TimeRangeElement = ReactElement<{ children: TimeRangeButtonElement[] }>;

const {
  mockPush,
  mockUsePathname,
  mockUseSearchParams,
} = vi.hoisted(() => ({
  mockPush: vi.fn(),
  mockUsePathname: vi.fn(),
  mockUseSearchParams: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
  usePathname: mockUsePathname,
  useSearchParams: mockUseSearchParams,
}));

function getButtons(element: TimeRangeElement): TimeRangeButtonElement[] {
  return element.props.children;
}

function getActiveLabels(element: TimeRangeElement): string[] {
  return getButtons(element)
    .filter((button) => String(button.props.className).includes('bg-neutral-700'))
    .map((button) => button.props.children);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockUsePathname.mockReturnValue('/dashboard');
  mockUseSearchParams.mockReturnValue(new URLSearchParams());
});

describe('TimeRange', () => {
  it('marks the default option active when the URL value is unsupported', () => {
    mockUseSearchParams.mockReturnValue(new URLSearchParams('days=999'));

    const element = TimeRange() as TimeRangeElement;

    expect(getActiveLabels(element)).toEqual(['7d']);
  });

  it('marks a supported URL value active', () => {
    mockUseSearchParams.mockReturnValue(new URLSearchParams('days=30'));

    const element = TimeRange() as TimeRangeElement;

    expect(getActiveLabels(element)).toEqual(['30d']);
  });
});
