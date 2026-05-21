import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import DailyTrafficChart from '../../../app/components/daily-traffic-chart';

describe('DailyTrafficChart', () => {
  it('renders a structured skeleton while daily traffic data is loading', () => {
    const html = renderToStaticMarkup(<DailyTrafficChart days={7} />);

    expect(html).toContain('aria-label="Loading daily traffic data"');
    expect(html).not.toContain('Loading daily data');
  });
});
