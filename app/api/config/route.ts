import { GoogleAuth } from 'google-auth-library';
import { searchconsole_v1 } from '@googleapis/searchconsole';
import { createConfigRouteHandlers } from '@/lib/config-route';
import { clearGa4DiscoveryCache } from '@/lib/ga4';

const SCOPES = [
  'https://www.googleapis.com/auth/webmasters',
  'https://www.googleapis.com/auth/webmasters.readonly',
  'https://www.googleapis.com/auth/analytics.readonly',
  'https://www.googleapis.com/auth/analytics.edit',
];

async function validateKey(raw: string): Promise<string> {
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
  return raw;
}

export const { GET, POST, DELETE } = createConfigRouteHandlers({
  configKey: 'google_sa_key',
  envKey: 'GOOGLE_SA_KEY_JSON',
  afterMutate: clearGa4DiscoveryCache,
  validateAndNormalize: validateKey,
});
