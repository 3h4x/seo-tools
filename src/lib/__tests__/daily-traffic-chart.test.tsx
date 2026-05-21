import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import * as React from 'react';
import DailyTrafficChart from '../../../app/components/daily-traffic-chart';

describe('DailyTrafficChart', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders a structured skeleton while daily traffic data is loading', () => {
    const html = renderToStaticMarkup(<DailyTrafficChart days={7} />);

    expect(html).toContain('aria-label="Loading daily traffic data"');
    expect(html).not.toContain('Loading daily data');
  });

  it('renders an error state when daily traffic data fails to load', () => {
    vi.spyOn(React, 'useState')
      .mockImplementationOnce(() => [null, vi.fn()])
      .mockImplementationOnce(() => ['Daily traffic data could not be loaded. Refresh the dashboard to try again.', vi.fn()])
      .mockImplementation(() => [null, vi.fn()]);

    const html = renderToStaticMarkup(<DailyTrafficChart days={7} />);

    expect(html).toContain('role="alert"');
    expect(html).toContain('Daily Traffic Unavailable');
    expect(html).toContain('Daily traffic data could not be loaded.');
    expect(html).not.toContain('aria-label="Loading daily traffic data"');
  });
});
