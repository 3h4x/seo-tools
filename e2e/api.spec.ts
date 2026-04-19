import { test, expect } from '@playwright/test';

test.describe('API routes', () => {
  test('GET /api/sites returns array', async ({ request }) => {
    const res = await request.get('/api/sites');
    expect(res.ok()).toBe(true);
    const data = await res.json();
    expect(Array.isArray(data)).toBe(true);
  });

  test('GET /api/daily returns data and sites', async ({ request }) => {
    const res = await request.get('/api/daily?days=7');
    expect(res.ok()).toBe(true);
    const data = await res.json();
    expect(data).toHaveProperty('data');
    expect(data).toHaveProperty('sites');
    expect(Array.isArray(data.sites)).toBe(true);
  });

  test('GET /api/config returns source field', async ({ request }) => {
    const res = await request.get('/api/config');
    expect(res.ok()).toBe(true);
    const data = await res.json();
    expect(data).toHaveProperty('source');
    expect(['db', 'env', 'none']).toContain(data.source);
  });

  test('POST /api/sites returns 400 for missing fields', async ({ request }) => {
    const res = await request.post('/api/sites', { data: { name: 'Incomplete' } });
    expect(res.status()).toBe(400);
    const data = await res.json();
    expect(data.ok).toBe(false);
  });

  test('DELETE /api/sites returns 400 when id is missing', async ({ request }) => {
    const res = await request.delete('/api/sites');
    expect(res.status()).toBe(400);
    const data = await res.json();
    expect(data.ok).toBe(false);
  });

  test('DELETE /api/cache clears cache and returns cleared:true', async ({ request }) => {
    const res = await request.delete('/api/cache');
    expect(res.ok()).toBe(true);
    const data = await res.json();
    expect(data.cleared).toBe(true);
  });
});
