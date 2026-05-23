import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactElement } from 'react';
import TimeRange from '../../../app/components/time-range';

type SegmentedControlProps = {
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
};

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

function getProps(element: ReactElement<SegmentedControlProps>): SegmentedControlProps {
  return element.props;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockUsePathname.mockReturnValue('/dashboard');
  mockUseSearchParams.mockReturnValue(new URLSearchParams());
});

describe('TimeRange', () => {
  it('marks the default option active when the URL value is unsupported', () => {
    mockUseSearchParams.mockReturnValue(new URLSearchParams('days=999'));

    const element = TimeRange() as ReactElement<SegmentedControlProps>;

    expect(getProps(element).value).toBe('7');
  });

  it('marks a supported URL value active', () => {
    mockUseSearchParams.mockReturnValue(new URLSearchParams('days=30'));

    const element = TimeRange() as ReactElement<SegmentedControlProps>;

    expect(getProps(element).value).toBe('30');
  });

  it('navigates to the new value via onChange', () => {
    mockUseSearchParams.mockReturnValue(new URLSearchParams('days=7'));

    const element = TimeRange() as ReactElement<SegmentedControlProps>;
    getProps(element).onChange('30');

    expect(mockPush).toHaveBeenCalledWith('/dashboard?days=30');
  });
});
