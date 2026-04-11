import { GoogleAuth } from 'google-auth-library';
import { getConfig } from './db';

const SCOPES = [
  'https://www.googleapis.com/auth/webmasters',
  'https://www.googleapis.com/auth/webmasters.readonly',
  'https://www.googleapis.com/auth/analytics.readonly',
  'https://www.googleapis.com/auth/analytics.edit',
];

export function getCredentials(): Record<string, unknown> {
  // DB takes priority over env var
  const dbValue = getConfig('google_sa_key');
  const raw = dbValue ?? process.env.GOOGLE_SA_KEY_JSON ?? '{}';
  const credentials = JSON.parse(raw);
  if (credentials.private_key) {
    credentials.private_key = credentials.private_key.replace(/\\n/g, '\n');
  }
  return credentials;
}

export function getAuth(): GoogleAuth {
  return new GoogleAuth({
    credentials: getCredentials(),
    scopes: SCOPES,
  });
}

// Convenience wrapper kept for callers that need a raw auth client
export async function getAuthClient() {
  return await getAuth().getClient();
}
