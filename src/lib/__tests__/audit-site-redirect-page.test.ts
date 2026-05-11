import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockGetManagedSite,
  mockRedirect,
  mockNotFound,
} = vi.hoisted(() => ({
  mockGetManagedSite: vi.fn(),
  mockRedirect: vi.fn((url: string) => {
    throw new Error(`redirect:${url}`);
  }),
  mockNotFound: vi.fn(() => {
    throw new Error('notFound');
  }),
}));

vi.mock('next/navigation', () => ({
  redirect: mockRedirect,
  notFound: mockNotFound,
}));

vi.mock('@/lib/sites', () => ({
  getManagedSite: mockGetManagedSite,
}));

import AuditSiteRedirectPage from '../../../app/audit/[site]/page';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('audit site redirect page', () => {
  it('redirects valid legacy audit URLs to the canonical site detail route', async () => {
    mockGetManagedSite.mockResolvedValueOnce({
      id: 'site-1',
      name: 'Site 1',
      domain: 'site1.com',
      testPages: [],
    });

    await expect(AuditSiteRedirectPage({
      params: Promise.resolve({ site: 'site-1' }),
    })).rejects.toThrow('redirect:/site-1');

    expect(mockGetManagedSite).toHaveBeenCalledWith('site-1');
    expect(mockRedirect).toHaveBeenCalledWith('/site-1');
  });

  it('does not redirect unknown site IDs to arbitrary root routes', async () => {
    mockGetManagedSite.mockResolvedValueOnce(null);

    await expect(AuditSiteRedirectPage({
      params: Promise.resolve({ site: 'missing' }),
    })).rejects.toThrow('notFound');

    expect(mockGetManagedSite).toHaveBeenCalledWith('missing');
    expect(mockRedirect).not.toHaveBeenCalled();
  });

  it('rejects decoded slash inputs before building a redirect target', async () => {
    await expect(AuditSiteRedirectPage({
      params: Promise.resolve({ site: '//evil.example' }),
    })).rejects.toThrow('notFound');

    expect(mockGetManagedSite).not.toHaveBeenCalled();
    expect(mockRedirect).not.toHaveBeenCalled();
  });

  it('encodes the stored site ID as a path segment when redirecting', async () => {
    mockGetManagedSite.mockResolvedValueOnce({
      id: 'site_1',
      name: 'Site 1',
      domain: 'site1.com',
      testPages: [],
    });

    await expect(AuditSiteRedirectPage({
      params: Promise.resolve({ site: 'site_1' }),
    })).rejects.toThrow('redirect:/site_1');

    expect(mockRedirect).toHaveBeenCalledWith('/site_1');
  });
});
