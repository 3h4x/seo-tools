import { NextResponse } from 'next/server';
import { GoogleAuth } from 'google-auth-library';
import { searchconsole_v1 } from '@googleapis/searchconsole';
import { getConfig, setConfig, deleteConfig, clearCache } from '@/lib/db';

const SCOPES = [
  'https://www.googleapis.com/auth/webmasters',
  'https://www.googleapis.com/auth/webmasters.readonly',
  'https://www.googleapis.com/auth/analytics.readonly',
  'https://www.googleapis.com/auth/analytics.edit',
];

function getSource(): { source: 'db' | 'env' | 'none'; raw: string | null } {
  const dbValue = getConfig('google_sa_key');
  if (dbValue) return { source: 'db', raw: dbValue };
  const envValue = process.env.GOOGLE_SA_KEY_JSON ?? null;
  if (envValue) return { source: 'env', raw: envValue };
  return { source: 'none', raw: null };
}

async function validateKey(raw: string): Promise<void> {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('Invalid JSON');
  }

  if (!parsed.private_key || !parsed.client_email || !parsed.type) {
    throw new Error('Key must include private_key, client_email, and type');
  }

  // Normalize escaped newlines before passing to GoogleAuth
  if (typeof parsed.private_key === 'string') {
    parsed.private_key = parsed.private_key.replace(/\\n/g, '\n');
  }

  const auth = new GoogleAuth({ credentials: parsed, scopes: SCOPES });
  const sc = new searchconsole_v1.Searchconsole({ auth });
  // Lightweight call to verify credentials work
  await sc.sites.list();
}

export async function GET() {
  const { source } = getSource();
  return NextResponse.json({ source });
}

export async function POST(req: Request) {
  const { key, testOnly } = await req.json() as { key: string; testOnly: boolean };

  try {
    await validateKey(key);
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 400 });
  }

  if (!testOnly) {
    setConfig('google_sa_key', key);
    clearCache();
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  deleteConfig('google_sa_key');
  clearCache();
  return NextResponse.json({ ok: true });
}
