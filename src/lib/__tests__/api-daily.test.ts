import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../db', () => ({
  getScDaily: vi.fn(),
  getGa4Daily: vi.fn(),
}));

vi.mock('../sites', () => ({
  getManagedSites: vi.fn(),
  dbGetSites: vi.fn(),
}));

import { getScDaily, getGa4Daily } from '../db';
import { getManagedSites } from '../sites';
import { GET } from '../../../app/api/daily/route';
import { NextRequest } from 'next/server';

function getReq(days?: number): NextRequest {
  const url = days !== undefined ? `http://localhost/api/daily?days=${days}` : 'http://localhost/api/daily';
  return new NextRequest(url);
}

const SITE = { id: 'site1', name: 'Site One', domain: 'site1.com', testPages: [] };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getManagedSites).mockResolvedValue([SITE] as never);
  vi.mocked(getScDaily).mockReturnValue([]);
  vi.mocked(getGa4Daily).mockReturnValue([]);
});

describe('GET /api/daily', () => {
  it('returns data and sites metadata', async () => {
    const res = await GET(getReq());
    const body = await res.json();
    expect(body).toHaveProperty('data');
    expect(body).toHaveProperty('sites');
    expect(body.sites[0]).toMatchObject({ id: 'site1', name: 'Site One' });
  });

  it('aggregates SC daily clicks and impressions', async () => {
    const today = new Date().toISOString().split('T')[0];
    vi.mocked(getScDaily).mockReturnValue([{ date: today, clicks: 10, impressions: 100 }] as never);

    const res = await GET(getReq(7));
    const body = await res.json();
    expect(body.data[today]?.site1?.clicks).toBe(10);
    expect(body.data[today]?.site1?.impressions).toBe(100);
  });

  it('aggregates GA4 daily users and views', async () => {
    const today = new Date().toISOString().split('T')[0];
    vi.mocked(getGa4Daily).mockReturnValue([{ date: today, users: 50, views: 200 }] as never);

    const res = await GET(getReq(7));
    const body = await res.json();
    expect(body.data[today]?.site1?.users).toBe(50);
    expect(body.data[today]?.site1?.views).toBe(200);
  });

  it('merges SC and GA4 data for the same date', async () => {
    const today = new Date().toISOString().split('T')[0];
    vi.mocked(getScDaily).mockReturnValue([{ date: today, clicks: 5, impressions: 50 }] as never);
    vi.mocked(getGa4Daily).mockReturnValue([{ date: today, users: 20, views: 80 }] as never);

    const res = await GET(getReq());
    const body = await res.json();
    const entry = body.data[today]?.site1;
    expect(entry).toMatchObject({ clicks: 5, impressions: 50, users: 20, views: 80 });
  });

  it('clamps days to 365 maximum', async () => {
    await GET(getReq(9999));
    expect(getScDaily).toHaveBeenCalledWith('site1', 365);
  });

  it('clamps days to 1 minimum', async () => {
    await GET(getReq(0));
    expect(getScDaily).toHaveBeenCalledWith('site1', 1);
  });

  it('defaults to 30 days when no param provided', async () => {
    await GET(getReq());
    expect(getScDaily).toHaveBeenCalledWith('site1', 30);
  });

  it('assigns a default color to sites metadata', async () => {
    const res = await GET(getReq());
    const body = await res.json();
    expect(body.sites[0].color).toBeDefined();
    expect(typeof body.sites[0].color).toBe('string');
  });

  it('uses site.color when defined', async () => {
    vi.mocked(getManagedSites).mockResolvedValue([{ ...SITE, color: '#ff0000' }] as never);
    const res = await GET(getReq());
    const body = await res.json();
    expect(body.sites[0].color).toBe('#ff0000');
  });
});
