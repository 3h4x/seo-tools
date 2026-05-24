import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { FormButton } from '../../../src/components/ui/form-button';

describe('FormButton', () => {
  it('defaults to a non-submit button type', () => {
    const html = renderToStaticMarkup(
      <FormButton>
        Save
      </FormButton>
    );

    expect(html).toContain('type="button"');
  });

  it('allows callers to opt into submit behavior', () => {
    const html = renderToStaticMarkup(
      <FormButton type="submit">
        Save
      </FormButton>
    );

    expect(html).toContain('type="submit"');
  });

  it('keeps disabled affordances for danger actions', () => {
    const html = renderToStaticMarkup(
      <FormButton variant="danger" disabled>
        Remove
      </FormButton>
    );

    expect(html).toContain('disabled:opacity-40');
    expect(html).toContain('disabled:cursor-not-allowed');
    expect(html).toContain(' disabled>');
  });

  it('supports compact sizes for existing form actions', () => {
    const html = renderToStaticMarkup(
      <FormButton variant="primary" size="xs">
        Discover sites
      </FormButton>
    );

    expect(html).toContain('px-3 py-1.5 text-xs');
    expect(html).toContain('bg-white text-black');
  });

  it('supports ghost row controls without local important overrides', () => {
    const html = renderToStaticMarkup(
      <FormButton variant="ghost" size="row">
        Toggle setup
      </FormButton>
    );

    expect(html).toContain('px-4 py-3 text-sm');
    expect(html).toContain('bg-transparent text-neutral-300');
    expect(html).toContain('hover:text-white');
  });
});
