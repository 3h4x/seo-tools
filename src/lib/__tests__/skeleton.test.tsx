import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Skeleton } from '../../../src/components/ui/skeleton';

describe('Skeleton', () => {
  it('renders the shared loading placeholder classes', () => {
    const html = renderToStaticMarkup(<Skeleton className="h-4 w-24 rounded-full" />);

    expect(html).toContain('animate-pulse bg-neutral-800 rounded');
    expect(html).toContain('h-4 w-24 rounded-full');
  });
});
