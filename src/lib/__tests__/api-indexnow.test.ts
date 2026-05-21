import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const {
  mockGetManagedSite,
  mockClearCacheEntry,
  mockCheckIndexNowKey,
  mockSubmitIndexNowForSite,
} = vi.hoisted(() => ({
  mockGetManagedSite: vi.fn(),
  mockClearCacheEntry: vi.fn(),
  mockCheckIndexNowKey: vi.fn(),
  mockSubmitIndexNowForSite: vi.fn(),
}));

vi.mock('@/lib/sites', () => ({
  getManagedSite: mockGetManagedSite,
}));

vi.mock('@/lib/db', () => ({
  clearCacheEntry: mockClearCacheEntry,
}));

vi.mock('@/lib/indexnow.js', () => ({
  checkIndexNowKey: mockCheckIndexNowKey,
  submitIndexNowForSite: mockSubmitIndexNowForSite,
}));

import { POST } from '../../../app/api/indexnow/route';

const site = {
  id: 'site-a',
  name: 'Site A',
  domain: 'a.test',
  indexNowKey: 'indexnow-key-123',
  testPages: ['/'],
};

function postReq(body: object): NextRequest {
  return new NextRequest('http://localhost/api/indexnow', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function rawPostReq(body: string): NextRequest {
  return new NextRequest('http://localhost/api/indexnow', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetManagedSite.mockResolvedValue(site);
  mockCheckIndexNowKey.mockResolvedValue({
    status: 'pass',
    label: 'IndexNow',
    message: 'Key file is reachable and matches the configured key',
  });
  mockSubmitIndexNowForSite.mockResolvedValue({
    sitemapUrl: 'https://a.test/sitemap.xml',
    submittedCount: 2,
    totalUrls: 2,
    truncated: false,
    keyLocation: 'https://a.test/indexnow-key-123.txt',
  });
});

describe('POST /api/indexnow', () => {
  it('returns 400 when the JSON body is malformed', async () => {
    const res = await POST(rawPostReq('{'));
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data).toEqual({ error: 'Invalid JSON body' });
    expect(mockGetManagedSite).not.toHaveBeenCalled();
    expect(mockCheckIndexNowKey).not.toHaveBeenCalled();
    expect(mockSubmitIndexNowForSite).not.toHaveBeenCalled();
    expect(mockClearCacheEntry).not.toHaveBeenCalled();
  });

  it('returns 400 when the JSON body is not an object', async () => {
    const res = await POST(rawPostReq('null'));
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data).toEqual({ error: 'siteId is required' });
    expect(mockGetManagedSite).not.toHaveBeenCalled();
    expect(mockCheckIndexNowKey).not.toHaveBeenCalled();
    expect(mockSubmitIndexNowForSite).not.toHaveBeenCalled();
    expect(mockClearCacheEntry).not.toHaveBeenCalled();
  });

  it('returns 400 when siteId is missing', async () => {
    const res = await POST(postReq({}));
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data).toEqual({ error: 'siteId is required' });
    expect(mockGetManagedSite).not.toHaveBeenCalled();
    expect(mockCheckIndexNowKey).not.toHaveBeenCalled();
    expect(mockSubmitIndexNowForSite).not.toHaveBeenCalled();
    expect(mockClearCacheEntry).not.toHaveBeenCalled();
  });

  it('returns 404 when the site is unknown', async () => {
    mockGetManagedSite.mockResolvedValue(null);

    const res = await POST(postReq({ siteId: 'missing-site' }));
    const data = await res.json();

    expect(res.status).toBe(404);
    expect(data).toEqual({ error: 'Unknown site: missing-site' });
    expect(mockGetManagedSite).toHaveBeenCalledWith('missing-site');
    expect(mockCheckIndexNowKey).not.toHaveBeenCalled();
    expect(mockSubmitIndexNowForSite).not.toHaveBeenCalled();
    expect(mockClearCacheEntry).not.toHaveBeenCalled();
  });

  it('returns 400 when IndexNow key verification fails', async () => {
    mockCheckIndexNowKey.mockResolvedValue({
      status: 'fail',
      label: 'IndexNow',
      message: 'Key file unreachable (404)',
      details: 'Expected https://a.test/indexnow-key-123.txt to return the configured key.',
    });

    const res = await POST(postReq({ siteId: 'site-a' }));
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data).toEqual({
      error: 'Key file unreachable (404)',
      details: 'Expected https://a.test/indexnow-key-123.txt to return the configured key.',
    });
    expect(mockCheckIndexNowKey).toHaveBeenCalledWith(site);
    expect(mockSubmitIndexNowForSite).not.toHaveBeenCalled();
    expect(mockClearCacheEntry).not.toHaveBeenCalled();
  });

  it('returns 502 when IndexNow key verification throws', async () => {
    mockCheckIndexNowKey.mockRejectedValue(new Error('Key verification timed out'));

    const res = await POST(postReq({ siteId: 'site-a' }));
    const data = await res.json();

    expect(res.status).toBe(502);
    expect(data).toEqual({ error: 'Key verification timed out' });
    expect(mockCheckIndexNowKey).toHaveBeenCalledWith(site);
    expect(mockSubmitIndexNowForSite).not.toHaveBeenCalled();
    expect(mockClearCacheEntry).not.toHaveBeenCalled();
  });

  it('submits IndexNow and clears the site audit cache on success', async () => {
    const res = await POST(postReq({ siteId: ' site-a ' }));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data).toEqual({
      ok: true,
      sitemapUrl: 'https://a.test/sitemap.xml',
      submittedCount: 2,
      totalUrls: 2,
      truncated: false,
      keyLocation: 'https://a.test/indexnow-key-123.txt',
    });
    expect(mockGetManagedSite).toHaveBeenCalledWith('site-a');
    expect(mockCheckIndexNowKey).toHaveBeenCalledWith(site);
    expect(mockSubmitIndexNowForSite).toHaveBeenCalledWith(site);
    expect(mockClearCacheEntry).toHaveBeenCalledWith('audit', 'site-a');
  });

  it('returns 502 when IndexNow submission fails', async () => {
    mockSubmitIndexNowForSite.mockRejectedValue(new Error('IndexNow rejected the submission (422)'));

    const res = await POST(postReq({ siteId: 'site-a' }));
    const data = await res.json();

    expect(res.status).toBe(502);
    expect(data).toEqual({ error: 'IndexNow rejected the submission (422)' });
    expect(mockCheckIndexNowKey).toHaveBeenCalledWith(site);
    expect(mockSubmitIndexNowForSite).toHaveBeenCalledWith(site);
    expect(mockClearCacheEntry).not.toHaveBeenCalled();
  });
});
