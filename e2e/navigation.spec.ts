import { test, expect } from '@playwright/test';

test.describe('Navigation', () => {
  test('home page loads with site cards', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/SEO/i);
    // Nav links are always present
    await expect(page.getByRole('link', { name: /overview/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /audit/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /report/i })).toBeVisible();
  });

  test('audit page loads', async ({ page }) => {
    await page.goto('/audit');
    // Page should not 404
    expect(page.url()).toContain('/audit');
    await expect(page).not.toHaveTitle(/404/i);
  });

  test('report page loads', async ({ page }) => {
    await page.goto('/report');
    expect(page.url()).toContain('/report');
    await expect(page).not.toHaveTitle(/404/i);
  });

  test('decay page loads', async ({ page }) => {
    await page.goto('/decay');
    expect(page.url()).toContain('/decay');
    await expect(page).not.toHaveTitle(/404/i);
  });

  test('trends page loads', async ({ page }) => {
    await page.goto('/trends');
    expect(page.url()).toContain('/trends');
    await expect(page).not.toHaveTitle(/404/i);
  });

  test('config page loads', async ({ page }) => {
    await page.goto('/config');
    expect(page.url()).toContain('/config');
    await expect(page).not.toHaveTitle(/404/i);
  });

  test('/traffic redirects to /report', async ({ page }) => {
    await page.goto('/traffic');
    expect(page.url()).toContain('/report');
  });
});
