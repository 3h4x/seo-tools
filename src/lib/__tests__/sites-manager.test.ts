import { describe, expect, it } from 'vitest';
import { formatDiscoverError } from '../../../app/components/sites-manager';

describe('formatDiscoverError', () => {
  it('maps known snake_case error codes to operator-facing messages', () => {
    expect(formatDiscoverError('search_console_api_failed', 500)).toBe(
      'Search Console API request failed. Check server logs.',
    );
    expect(formatDiscoverError('failed_to_load_existing_sites', 500)).toBe(
      'Could not load existing sites. Check server logs.',
    );
  });

  it('passes through other error strings unchanged', () => {
    expect(formatDiscoverError('No SA key configured', 400)).toBe('No SA key configured');
    expect(formatDiscoverError('Some other error', 502)).toBe('Some other error');
  });

  it('falls back to status when no error string is provided', () => {
    expect(formatDiscoverError(undefined, 503)).toBe('Discovery failed (503)');
    expect(formatDiscoverError('', 500)).toBe('Discovery failed (500)');
    expect(formatDiscoverError('   ', 500)).toBe('Discovery failed (500)');
  });
});
