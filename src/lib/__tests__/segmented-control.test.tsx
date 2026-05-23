import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { SegmentedControl } from '../../../src/components/ui/segmented-control';

describe('SegmentedControl', () => {
  it('marks the active option with selected styling and aria-selected', () => {
    const html = renderToStaticMarkup(
      <SegmentedControl
        options={[
          { value: 'a', label: 'A' },
          { value: 'b', label: 'B' },
        ]}
        value="b"
        onChange={() => {}}
        ariaLabel="Choices"
      />,
    );

    expect(html).toContain('aria-label="Choices"');
    expect(html).toContain('aria-selected="true"');
    expect(html).toContain('bg-neutral-700');
    expect(html).toContain('text-neutral-400');
  });

  it('uses renderLabel for custom option content', () => {
    const html = renderToStaticMarkup(
      <SegmentedControl
        options={[
          { value: 'one', label: 'One' },
          { value: 'two', label: 'Two' },
        ]}
        value="one"
        onChange={() => {}}
        renderLabel={(option, active) => (
          <span data-active={active ? 'yes' : 'no'}>{option.label}</span>
        )}
      />,
    );

    expect(html).toContain('data-active="yes"');
    expect(html).toContain('data-active="no"');
  });
});
