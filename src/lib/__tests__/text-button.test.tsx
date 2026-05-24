import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { TextButton } from '../../../src/components/ui/text-button';

describe('TextButton', () => {
  it('defaults to a non-submit button type', () => {
    const html = renderToStaticMarkup(
      <TextButton>
        Edit
      </TextButton>
    );

    expect(html).toContain('type="button"');
  });

  it('allows callers to opt into submit behavior', () => {
    const html = renderToStaticMarkup(
      <TextButton type="submit">
        Apply
      </TextButton>
    );

    expect(html).toContain('type="submit"');
  });

  it('renders the default low-emphasis action style', () => {
    const html = renderToStaticMarkup(
      <TextButton disabled>
        Edit
      </TextButton>
    );

    expect(html).toContain('text-xs');
    expect(html).toContain('text-neutral-400');
    expect(html).toContain('hover:text-white');
    expect(html).toContain('disabled:opacity-40');
    expect(html).toContain(' disabled>');
  });

  it('supports compact reorder controls', () => {
    const html = renderToStaticMarkup(
      <TextButton size="xxs" variant="reorder">
        Up
      </TextButton>
    );

    expect(html).toContain('text-[11px]');
    expect(html).toContain('disabled:opacity-30');
  });
});
