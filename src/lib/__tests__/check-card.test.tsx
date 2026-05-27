import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Recommendation } from '../../../app/components/audit/check-card';
import type { GapRecommendation } from '../gap-definitions';

describe('audit check card', () => {
  it('renders recommendation metadata with shared badge styling', () => {
    const gap: GapRecommendation = {
      id: 'missing-json-ld',
      title: 'Add structured data',
      description: 'JSON-LD is missing.',
      severity: 'high',
      category: 'structured-data',
      hint: 'Add WebApplication schema.',
    };

    const html = renderToStaticMarkup(<Recommendation gap={gap} />);

    expect(html).toContain('inline-flex items-center border font-medium');
    expect(html).toContain('High priority');
    expect(html).toContain('Structured Data');
  });
});
