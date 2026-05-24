import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import NavLinks from '../../../app/components/nav-links';

const { mockUsePathname } = vi.hoisted(() => ({
  mockUsePathname: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  usePathname: mockUsePathname,
}));

beforeEach(() => {
  mockUsePathname.mockReturnValue('/');
});

describe('NavLinks', () => {
  it('marks only the current top-level route as the active page', () => {
    mockUsePathname.mockReturnValue('/performance/site-a');

    const html = renderToStaticMarkup(<NavLinks />);

    expect(html).toContain('<a href="/performance" aria-current="page"');
    expect(html).not.toContain('<a href="/audit" aria-current="page"');
    expect(html).not.toContain('<a href="/" aria-current="page"');
  });
});
