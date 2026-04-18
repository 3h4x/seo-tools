import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../db', () => ({
  getConfig: vi.fn(),
}));

vi.mock('google-auth-library', () => ({
  GoogleAuth: vi.fn(),
}));

import { getCredentials } from '../google-auth';
import { getConfig } from '../db';

const mockGetConfig = vi.mocked(getConfig);

beforeEach(() => {
  vi.resetAllMocks();
  delete process.env.GOOGLE_SA_KEY_JSON;
});

describe('getCredentials', () => {
  it('returns empty object when no config or env var', () => {
    mockGetConfig.mockReturnValue(null);
    const creds = getCredentials();
    expect(creds).toEqual({});
  });

  it('uses env var when DB has no value', () => {
    mockGetConfig.mockReturnValue(null);
    process.env.GOOGLE_SA_KEY_JSON = JSON.stringify({ type: 'service_account', project_id: 'test' });
    const creds = getCredentials();
    expect(creds.project_id).toBe('test');
  });

  it('prefers DB value over env var', () => {
    mockGetConfig.mockReturnValue(JSON.stringify({ type: 'service_account', project_id: 'from-db' }));
    process.env.GOOGLE_SA_KEY_JSON = JSON.stringify({ type: 'service_account', project_id: 'from-env' });
    const creds = getCredentials();
    expect(creds.project_id).toBe('from-db');
  });

  it('normalizes escaped newlines in private_key', () => {
    const raw = { type: 'service_account', private_key: '-----BEGIN\\nEND-----' };
    mockGetConfig.mockReturnValue(JSON.stringify(raw));
    const creds = getCredentials();
    expect(creds.private_key).toBe('-----BEGIN\nEND-----');
  });

  it('does not modify credentials without private_key', () => {
    const raw = { type: 'service_account', project_id: 'test' };
    mockGetConfig.mockReturnValue(JSON.stringify(raw));
    const creds = getCredentials();
    expect(creds.project_id).toBe('test');
    expect(creds.private_key).toBeUndefined();
  });

  it('handles double-escaped newlines from JSON serialization', () => {
    // Simulates the known issue where .env.local stores \\n instead of \n
    const raw = { private_key: 'KEY\\nMORE\\nDATA' };
    mockGetConfig.mockReturnValue(JSON.stringify(raw));
    const creds = getCredentials();
    expect(creds.private_key).toBe('KEY\nMORE\nDATA');
  });
});
