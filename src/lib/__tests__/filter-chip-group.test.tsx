import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { FilterChipGroup } from '../../../src/components/ui/filter-chip-group';

describe('FilterChipGroup', () => {
  it('marks the active option with aria-pressed and active styling', () => {
    const html = renderToStaticMarkup(
      <FilterChipGroup
        ariaLabel="Filter"
        value="b"
        onChange={() => {}}
        options={[
          { value: 'a', label: 'A' },
          { value: 'b', label: 'B' },
        ]}
      />,
    );

    expect(html).toContain('aria-label="Filter"');
    expect(html).toContain('aria-pressed');
    expect(html).toContain('bg-white/10');
    expect(html).toContain('text-neutral-400');
  });

  it('renders counts and uses inactive count styling for inactive chips', () => {
    const html = renderToStaticMarkup(
      <FilterChipGroup
        value={null}
        onChange={() => {}}
        options={[
          { value: 'one', label: 'One', count: 3 },
          { value: 'two', label: 'Two', count: 7 },
        ]}
      />,
    );

    expect(html).toContain('>3<');
    expect(html).toContain('>7<');
    expect(html).toContain('text-neutral-600');
  });

  it('hides options with zero count when hideZeroCounts is set', () => {
    const html = renderToStaticMarkup(
      <FilterChipGroup
        value={null}
        onChange={() => {}}
        hideZeroCounts
        options={[
          { value: 'kept', label: 'Kept', count: 1 },
          { value: 'gone', label: 'Gone', count: 0 },
        ]}
      />,
    );

    expect(html).toContain('Kept');
    expect(html).not.toContain('Gone');
  });

  it('applies per-option active styling when provided', () => {
    const html = renderToStaticMarkup(
      <FilterChipGroup
        value="high"
        onChange={() => {}}
        options={[
          {
            value: 'high',
            label: 'High',
            count: 2,
            activeClassName: 'bg-red-500/10 text-red-400 border-red-500/20',
          },
        ]}
      />,
    );

    expect(html).toContain('bg-red-500/10');
    expect(html).toContain('text-red-400');
    expect(html).toContain('border-red-500/20');
  });
});
