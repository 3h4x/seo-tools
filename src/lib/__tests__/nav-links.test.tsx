import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactNode } from 'react';

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: { href: string; children: ReactNode }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

const {
  mockUsePathname,
} = vi.hoisted(() => ({
  mockUsePathname: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  usePathname: mockUsePathname,
}));

import NavLinks from '../../../app/components/nav-links';

describe('NavLinks', () => {
  it('includes report and decay destinations', () => {
    mockUsePathname.mockReturnValue('/');

    const html = renderToStaticMarkup(<NavLinks />);

    expect(html).toContain('href="/report"');
    expect(html).toContain('Report');
    expect(html).toContain('href="/decay"');
    expect(html).toContain('Decay');
  });
});
