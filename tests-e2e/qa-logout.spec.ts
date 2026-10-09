import { test, expect } from '@playwright/test';

test('Logout bug test', async ({ page }) => {
  const baseURL = 'http://localhost:3000';
  const clientEmail = 'client.qa.test@example.com';
  
  // Login
  await page.goto(`${baseURL}/login`);
  await page.getByLabel(/Email Address/i).fill(clientEmail);
  await page.getByLabel(/Password/i).fill('Password123!');
  await page.getByRole('button', { name: /Sign In/i }).click();
  
  await expect(page).toHaveURL(/.*dashboard.*/, { timeout: 10000 });
  
  // Navigate to home page to see Header
  await page.goto(baseURL);
  
  // Logout
  const logoutBtn = page.getByRole('button', { name: /Log out/i });
  await expect(logoutBtn).toBeVisible();
  await logoutBtn.click();
  
  // Check where we end up
  await page.waitForTimeout(2000); // Wait to see what the browser does
  const url = page.url();
  console.log(`Ended up at: ${url}`);
  
  // The correct behavior is ending up at the home page or login page
  expect(url).not.toContain('/api/auth/logout');
  
  // Verify session is invalidated by trying to go back to dashboard
  await page.goto(`${baseURL}/dashboard/client`);
  await expect(page).toHaveURL(/.*login.*/, { timeout: 10000 });

});
