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

  it('supports compact inline action sizing', () => {
    const html = renderToStaticMarkup(<FormButton size="compact">Copy</FormButton>);

    expect(html).toContain('px-2 py-1 text-xs');
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

  it('supports muted and success action states', () => {
    const muted = renderToStaticMarkup(<FormButton variant="muted">Copy</FormButton>);
    const success = renderToStaticMarkup(<FormButton variant="success">Copied</FormButton>);

    expect(muted).toContain('bg-neutral-800 text-neutral-400');
    expect(muted).toContain('hover:text-neutral-300');
    expect(success).toContain('bg-emerald-500/20 text-emerald-400');
  });

  it('supports icon and spinner alignment', () => {
    const html = renderToStaticMarkup(<FormButton hasIcon>Refresh</FormButton>);

    expect(html).toContain('inline-flex items-center gap-1.5');
  });
});
