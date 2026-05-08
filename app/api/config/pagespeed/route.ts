import { NextResponse } from 'next/server';
import { getConfig, setConfig, deleteConfig, clearCache } from '@/lib/db';

const KEY = 'pagespeed_api_key';

export async function GET() {
  const dbValue = getConfig(KEY);
  const envValue = process.env.PAGESPEED_API_KEY;
  const source: 'db' | 'env' | 'none' = dbValue ? 'db' : envValue ? 'env' : 'none';
  return NextResponse.json({ source });
}

export async function POST(req: Request) {
  const { key, testOnly } = await req.json() as { key: string; testOnly?: boolean };
  const trimmed = (key ?? '').trim();
  if (!trimmed) {
    return NextResponse.json({ ok: false, error: 'Empty key' }, { status: 400 });
  }

  try {
    const params = new URLSearchParams({
      url: 'https://www.example.com',
      strategy: 'mobile',
      key: trimmed,
    });
    const res = await fetch(`https://www.googleapis.com/pagespeedonline/v5/runPagespeed?${params}`);
    if (res.status === 400 || res.status === 401 || res.status === 403) {
      const body = await res.json().catch(() => ({})) as { error?: { message?: string } };
      const msg = body.error?.message || `HTTP ${res.status}`;
      return NextResponse.json({ ok: false, error: msg }, { status: 400 });
    }
    if (!res.ok && res.status !== 429) {
      return NextResponse.json({ ok: false, error: `HTTP ${res.status}` }, { status: 400 });
    }
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 400 });
  }

  if (!testOnly) {
    setConfig(KEY, trimmed);
    clearCache('psi-');
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  deleteConfig(KEY);
  clearCache('psi-');
  return NextResponse.json({ ok: true });
}
