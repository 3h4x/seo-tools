import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import * as React from 'react';
import ConfigForm from '../../../app/components/config-form';

describe('ConfigForm', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders config errors as an alert', () => {
    vi.spyOn(React, 'useState')
      .mockImplementationOnce(() => ['', vi.fn()])
      .mockImplementationOnce(() => ['db', vi.fn()])
      .mockImplementationOnce(() => ['error', vi.fn()])
      .mockImplementationOnce(() => ['Request failed — check console', vi.fn()])
      .mockImplementationOnce(() => [false, vi.fn()])
      .mockImplementationOnce(() => [false, vi.fn()]);

    const html = renderToStaticMarkup(<ConfigForm source="db" />);

    expect(html).toContain('role="alert"');
    expect(html).toContain('Request failed — check console');
  });

  it('renders the remove button only when source is db', () => {
    const noneHtml = renderToStaticMarkup(<ConfigForm source="none" />);
    expect(noneHtml).not.toContain('Remove');

    const dbHtml = renderToStaticMarkup(<ConfigForm source="db" />);
    expect(dbHtml).toContain('Remove');
  });
});
