import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CopyButton } from '../../../app/components/copy-button';

describe('CopyButton', () => {
  it('keeps compact caller spacing classes available', () => {
    const html = renderToStaticMarkup(
      <CopyButton
        text="https://example.test"
        label="domain"
        className="text-[10px] px-1.5 py-0.5"
      />
    );

    expect(html).toContain('px-2 py-1 text-xs');
    expect(html).toContain('rounded');
    expect(html).not.toContain('!px-2');
    expect(html).not.toContain('!py-1');
    expect(html).not.toContain('!rounded');
    expect(html).toContain('text-[10px] px-1.5 py-0.5');
  });

  it('includes a polite status region for copy feedback', () => {
    const html = renderToStaticMarkup(
      <CopyButton text="https://example.test" label="domain" />
    );

    expect(html).toContain('role="status"');
    expect(html).toContain('aria-live="polite"');
  });
});
