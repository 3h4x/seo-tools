import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { FormButton } from '../../../src/components/ui/form-button';

describe('FormButton', () => {
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
});
