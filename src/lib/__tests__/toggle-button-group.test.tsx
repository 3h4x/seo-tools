import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ToggleButtonGroup } from '../../../src/components/ui/toggle-button-group';

describe('ToggleButtonGroup', () => {
  it('marks active options with pressed state and active styling', () => {
    const html = renderToStaticMarkup(
      <ToggleButtonGroup
        options={[
          { value: 'views', label: 'Views' },
          { value: 'clicks', label: 'Clicks' },
        ]}
        activeValues={new Set(['clicks'])}
        onToggle={() => {}}
        ariaLabel="Metrics"
      />,
    );

    expect(html).toContain('aria-label="Metrics"');
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain('bg-neutral-700');
    expect(html).toContain('text-neutral-400');
  });

  it('uses renderLabel for custom option content', () => {
    const html = renderToStaticMarkup(
      <ToggleButtonGroup
        options={[
          { value: 'one', label: 'One' },
          { value: 'two', label: 'Two' },
        ]}
        activeValues={new Set(['one'])}
        onToggle={() => {}}
        renderLabel={(option, active) => (
          <span data-active={active ? 'yes' : 'no'}>{option.label}</span>
        )}
      />,
    );

    expect(html).toContain('data-active="yes"');
    expect(html).toContain('data-active="no"');
  });

  it('allows callers to override group and button classes', () => {
    const html = renderToStaticMarkup(
      <ToggleButtonGroup
        options={[
          { value: 'one', label: 'One' },
          { value: 'two', label: 'Two' },
        ]}
        activeValues={new Set(['one'])}
        onToggle={() => {}}
        className="custom-group"
        getButtonClassName={(_option, active) => active ? 'custom-active' : 'custom-inactive'}
      />,
    );

    expect(html).toContain('class="custom-group"');
    expect(html).toContain('class="custom-active"');
    expect(html).toContain('class="custom-inactive"');
    expect(html).not.toContain('bg-neutral-800');
  });

  it('renders compact legend controls for chart legends', () => {
    const html = renderToStaticMarkup(
      <ToggleButtonGroup
        options={[
          { value: 'one', label: 'One' },
          { value: 'two', label: 'Two' },
        ]}
        activeValues={new Set(['one'])}
        onToggle={() => {}}
        buttonVariant="legend"
      />,
    );

    expect(html).toContain('flex items-center gap-2 text-xs px-2 py-1 rounded transition-colors hover:bg-neutral-800');
    expect(html).toContain('flex items-center gap-2 text-xs px-2 py-1 rounded transition-colors opacity-40 hover:opacity-60');
    expect(html).not.toContain('bg-neutral-700');
  });
});
