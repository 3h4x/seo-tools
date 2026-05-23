import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../app/components/nav-links', () => ({
  default: () => <div>Nav Links</div>,
}));

vi.mock('../../../app/components/refresh-button', () => ({
  default: () => <button>Refresh</button>,
}));

vi.mock('../../../app/components/refresh-context', () => ({
  RefreshProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock('../../../app/components/loading-overlay', () => ({
  default: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

import RootLayout from '../../../app/layout';

describe('RootLayout', () => {
  it('renders the app version with shared badge styling', () => {
    const html = renderToStaticMarkup(
      <RootLayout>
        <div>Dashboard</div>
      </RootLayout>
    );

    expect(html).toContain('SEO Tools');
    expect(html).toContain('dev');
    expect(html).toContain('inline-flex items-center border font-medium');
    expect(html).toContain('px-1.5 py-0.5 text-xs');
  });
});
