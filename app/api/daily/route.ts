import { NextRequest, NextResponse } from 'next/server';
import { getScDaily, getGa4Daily } from '@/lib/db';
import { getManagedSites } from '@/lib/sites';

export async function GET(req: NextRequest) {
  const days = Math.min(365, Math.max(1, parseInt(req.nextUrl.searchParams.get('days') || '30')));

  // Calculate the cutoff date
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffStr = cutoff.toISOString().split('T')[0];

  const result: Record<string, Record<string, { users: number; views: number; clicks: number; impressions: number }>> = {};

  const sites = await getManagedSites();
  for (const site of sites) {
    const sc = getScDaily(site.id, days);
    const ga4 = getGa4Daily(site.id, days);

    for (const row of sc) {
      if (row.date < cutoffStr) continue;
      if (!result[row.date]) result[row.date] = {};
      if (!result[row.date][site.id]) result[row.date][site.id] = { users: 0, views: 0, clicks: 0, impressions: 0 };
      result[row.date][site.id].clicks = row.clicks;
      result[row.date][site.id].impressions = row.impressions;
    }

    for (const row of ga4) {
      if (row.date < cutoffStr) continue;
      if (!result[row.date]) result[row.date] = {};
      if (!result[row.date][site.id]) result[row.date][site.id] = { users: 0, views: 0, clicks: 0, impressions: 0 };
      result[row.date][site.id].users = row.users;
      result[row.date][site.id].views = row.views;
    }
  }

  const sitesMeta = sites.map((s, i) => {
    const defaults = ['#10b981', '#3b82f6', '#8b5cf6', '#f59e0b', '#06b6d4', '#f43f5e', '#a78bfa'];
    return { id: s.id, name: s.name, color: s.color ?? defaults[i % defaults.length] };
  });

  return NextResponse.json({ data: result, sites: sitesMeta });
}
