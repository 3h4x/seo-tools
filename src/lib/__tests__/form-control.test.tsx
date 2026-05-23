import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { FormInput, FormTextarea } from '../../../src/components/ui/form-control';

describe('form controls', () => {
  it('applies shared dashboard form control styling to inputs', () => {
    const html = renderToStaticMarkup(<FormInput type="email" placeholder="alerts@example.com" />);

    expect(html).toContain('bg-neutral-900 border border-neutral-700 rounded-md');
    expect(html).toContain('focus:outline-none focus:border-neutral-500');
    expect(html).toContain('type="email"');
  });

  it('supports monospace literal fields and local layout classes', () => {
    const html = renderToStaticMarkup(
      <FormTextarea monospace className="md:col-span-2 min-h-24" />
    );

    expect(html).toContain('font-mono');
    expect(html).toContain('md:col-span-2 min-h-24');
  });
});
