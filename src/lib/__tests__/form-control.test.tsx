import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { FormInput, FormLabel, FormSelect, FormTextarea } from '../../../src/components/ui/form-control';

describe('form controls', () => {
  it('applies shared dashboard form control styling to inputs', () => {
    const html = renderToStaticMarkup(<FormInput type="email" placeholder="alerts@example.com" />);

    expect(html).toContain('bg-neutral-900 rounded-md text-neutral-200');
    expect(html).toContain('border border-neutral-700');
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

  it('supports roomier textarea padding without conflicting defaults', () => {
    const html = renderToStaticMarkup(
      <FormTextarea padding="roomy" className="h-48 resize-y" />
    );

    expect(html).toContain('p-3');
    expect(html).not.toContain('p-2.5');
  });

  it('supports dense manager controls without conflicting default tone or padding', () => {
    const html = renderToStaticMarkup(
      <FormInput tone="dense" padding="compact" monospace />
    );

    expect(html).toContain('bg-neutral-800 rounded text-white');
    expect(html).toContain('px-3 py-1.5');
    expect(html).toContain('font-mono');
    expect(html).not.toContain('bg-neutral-900');
    expect(html).not.toContain('p-2.5');
  });

  it('renders shared select controls with forwarded options', () => {
    const html = renderToStaticMarkup(
      <FormSelect tone="dense" padding="dense" defaultValue="ga4">
        <option value="ga4">GA4 sessions</option>
      </FormSelect>
    );

    expect(html).toContain('<select');
    expect(html).toContain('bg-neutral-800 rounded text-white');
    expect(html).toContain('px-3 py-2');
    expect(html).toContain('GA4 sessions');
  });

  it('renders shared compact form labels', () => {
    const html = renderToStaticMarkup(
      <FormLabel htmlFor="service-key" className="block">Service key</FormLabel>
    );

    expect(html).toContain('<label');
    expect(html).toContain('for="service-key"');
    expect(html).toContain('text-xs text-neutral-400');
    expect(html).toContain('block');
  });
});
