import { test, expect } from '@playwright/test';

test.describe('CPI Lancers Full QA', () => {
  const baseURL = 'http://localhost:3000';

  const ensureLoggedOut = async (page: any) => {
    await page.goto(baseURL);
    const logoutBtn = page.getByRole('button', { name: /Log out/i });
    if (await logoutBtn.isVisible()) {
      await logoutBtn.click();
      await page.waitForURL(baseURL);
    }
  };

  test('Phase 3: Auth Testing', async ({ page }) => {
    await ensureLoggedOut(page);

    await page.goto(`${baseURL}/login`);
    const createOneLink = page.getByRole('link', { name: /Create one/i });
    await createOneLink.scrollIntoViewIfNeeded();
    await createOneLink.click();
    await page.waitForURL('**/register');

    await page.getByRole('button', { name: /Hire Consultants/i }).click();
    await page.getByLabel(/First Name/i).fill('Alice');
    await page.getByLabel(/Last Name/i).fill('Client');
    // Using gmail to bypass potential Supabase test domain blocks
    const testEmail = `client.qa.${Date.now()}@gmail.com`;
    await page.getByLabel(/Email Address/i).fill(testEmail);
    await page.getByLabel(/^Password$/i).fill('Password123!');
    await page.getByLabel(/Confirm Password/i).fill('Password123!');
    await page.locator('#terms').check();
    
    await page.getByRole('button', { name: /Create Account/i }).click();

    // Verify successful registration
    await expect(page.getByText(/Registration Successful/i)).toBeVisible({ timeout: 10000 });
  });

  test('Phase 3: Auth - Login and Invalid Login', async ({ page }) => {
    await ensureLoggedOut(page);

    // Invalid Login
    await page.goto(`${baseURL}/login`);
    await page.getByLabel(/Email Address/i).fill('badlogin@gmail.com');
    await page.getByLabel(/Password/i).fill('wrongpass123!');
    await page.getByRole('button', { name: /Sign In/i }).click();
    
    // Correctly matching the actual error text from previous run
    await expect(page.getByText(/Invalid email or password/i)).toBeVisible({ timeout: 10000 });

    // Test protected route
    await page.goto(`${baseURL}/dashboard/client`);
    // Should redirect to login
    await expect(page).toHaveURL(/.*login.*/);
  });
});
