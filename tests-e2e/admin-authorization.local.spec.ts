import { test, expect } from '@playwright/test';

test.describe('local admin authorization boundary', () => {
  test('signed-out admin navigation redirects to the login flow', async ({ page }) => {
    await page.goto('/admin');
    await expect(page).toHaveURL(/\/login\?next=%2Fadmin|\/login\?next=\/admin/);
  });

  test('signed-out admin API access is denied server-side', async ({ request }) => {
    const response = await request.get('/api/admin/overview');
    expect(response.status()).toBe(401);
    const body = await response.json();
    expect(body.error).toMatchObject({ code: 'UNAUTHORIZED' });
  });
});
