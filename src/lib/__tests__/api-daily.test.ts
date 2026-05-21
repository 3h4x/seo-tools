import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

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
import { CHART_COLORS } from '../constants';
import { dateOnlyDaysBack, todayDateOnly } from '../date-only';

function getReq(days?: number): NextRequest {
  const url = days !== undefined ? `http://localhost/api/daily?days=${days}` : 'http://localhost/api/daily';
  return new NextRequest(url);
}

function getReqRaw(query: string): NextRequest {
  return new NextRequest(`http://localhost/api/daily?${query}`);
}

const SITE = { id: 'site1', name: 'Site One', domain: 'site1.com', testPages: [] };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getManagedSites).mockResolvedValue([SITE] as never);
  vi.mocked(getScDaily).mockReturnValue([]);
  vi.mocked(getGa4Daily).mockReturnValue([]);
});

afterEach(() => {
  vi.useRealTimers();
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
    const today = todayDateOnly();
    vi.mocked(getScDaily).mockReturnValue([{ date: today, clicks: 10, impressions: 100 }] as never);

    const res = await GET(getReq(7));
    const body = await res.json();
    expect(body.data[today]?.site1?.clicks).toBe(10);
    expect(body.data[today]?.site1?.impressions).toBe(100);
  });

  it('aggregates GA4 daily users and views', async () => {
    const today = todayDateOnly();
    vi.mocked(getGa4Daily).mockReturnValue([{ date: today, users: 50, views: 200 }] as never);

    const res = await GET(getReq(7));
    const body = await res.json();
    expect(body.data[today]?.site1?.users).toBe(50);
    expect(body.data[today]?.site1?.views).toBe(200);
  });

  it('merges SC and GA4 data for the same date', async () => {
    const today = todayDateOnly();
    vi.mocked(getScDaily).mockReturnValue([{ date: today, clicks: 5, impressions: 50 }] as never);
    vi.mocked(getGa4Daily).mockReturnValue([{ date: today, users: 20, views: 80 }] as never);

    const res = await GET(getReq());
    const body = await res.json();
    const entry = body.data[today]?.site1;
    expect(entry).toMatchObject({ clicks: 5, impressions: 50, users: 20, views: 80 });
  });

  it('filters out rows older than the requested window', async () => {
    const recentDate = dateOnlyDaysBack(6);
    const staleDate = dateOnlyDaysBack(8);

    vi.mocked(getScDaily).mockReturnValue([
      { date: staleDate, clicks: 99, impressions: 999 },
      { date: recentDate, clicks: 5, impressions: 50 },
    ] as never);
    vi.mocked(getGa4Daily).mockReturnValue([
      { date: staleDate, users: 77, views: 777 },
      { date: recentDate, users: 20, views: 80 },
    ] as never);

    const res = await GET(getReq(7));
    const body = await res.json();

    expect(body.data[staleDate]).toBeUndefined();
    expect(body.data[recentDate]?.site1).toMatchObject({
      clicks: 5,
      impressions: 50,
      users: 20,
      views: 80,
    });
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

  it('defaults to 30 days when days param is invalid', async () => {
    await GET(getReqRaw('days=abc'));
    expect(getScDaily).toHaveBeenCalledWith('site1', 30);
    expect(getGa4Daily).toHaveBeenCalledWith('site1', 30);
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

  it('aggregates rows independently for multiple sites on the same date', async () => {
    const today = todayDateOnly();
    vi.mocked(getManagedSites).mockResolvedValue([
      SITE,
      { id: 'site2', name: 'Site Two', domain: 'site2.com', testPages: [] },
    ] as never);
    vi.mocked(getScDaily)
      .mockReturnValueOnce([{ date: today, clicks: 10, impressions: 100 }] as never)
      .mockReturnValueOnce([{ date: today, clicks: 20, impressions: 200 }] as never);
    vi.mocked(getGa4Daily)
      .mockReturnValueOnce([{ date: today, users: 30, views: 300 }] as never)
      .mockReturnValueOnce([{ date: today, users: 40, views: 400 }] as never);

    const res = await GET(getReq(7));
    const body = await res.json();

    expect(body.data[today]?.site1).toMatchObject({
      clicks: 10,
      impressions: 100,
      users: 30,
      views: 300,
    });
    expect(body.data[today]?.site2).toMatchObject({
      clicks: 20,
      impressions: 200,
      users: 40,
      views: 400,
    });
    expect(body.sites).toEqual([
      { id: 'site1', name: 'Site One', color: CHART_COLORS[0] },
      { id: 'site2', name: 'Site Two', color: CHART_COLORS[1] },
    ]);
  });

  it('filters with local date-only math across DST-sensitive windows', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 2, 30, 1, 30));

    vi.mocked(getScDaily).mockReturnValue([
      { date: '2026-03-27', clicks: 99, impressions: 999 },
      { date: '2026-03-28', clicks: 10, impressions: 100 },
      { date: '2026-03-29', clicks: 20, impressions: 200 },
    ] as never);

    const res = await GET(getReq(2));
    const body = await res.json();

    expect(body.data['2026-03-27']).toBeUndefined();
    expect(body.data['2026-03-28']?.site1?.clicks).toBe(10);
    expect(body.data['2026-03-29']?.site1?.clicks).toBe(20);
  });

  it('returns a JSON 500 when daily data cannot be loaded', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.mocked(getScDaily).mockImplementationOnce(() => {
      throw new Error('daily table unavailable');
    });

    const res = await GET(getReq(7));

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'failed_to_load_daily_data' });
    expect(consoleError).toHaveBeenCalledWith('[GET /api/daily]', expect.any(Error));

    consoleError.mockRestore();
  });
});
