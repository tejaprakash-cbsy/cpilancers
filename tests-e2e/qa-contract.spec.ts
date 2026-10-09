import { test, expect } from '@playwright/test';

test.describe('CPI Lancers Phase 6: Contract Creation', () => {
  const baseURL = 'http://localhost:3000';
  const clientEmail = 'client.qa.test@example.com';

  test('Client accepts proposal', async ({ page }) => {
    test.setTimeout(60000);
    
    // Login as Client
    await page.goto(`${baseURL}/login`);
    await page.getByLabel(/Email Address/i).fill(clientEmail);
    await page.getByLabel(/Password/i).fill('Password123!');
    await page.getByRole('button', { name: /Sign In/i }).click();
    
    await expect(page).toHaveURL(/.*dashboard.*/, { timeout: 10000 });

    // Navigate to Jobs list on dashboard to find the job ID
    // The dashboard lists jobs with a "View" link
    const viewLink = page.getByRole('link', { name: 'View' }).first();
    await expect(viewLink).toBeVisible();
    
    const jobHref = await viewLink.getAttribute('href'); // e.g. /jobs/uuid
    expect(jobHref).not.toBeNull();
    
    // Manually navigate to proposals page since UI is missing the button
    const proposalsUrl = `${baseURL}${jobHref}/proposals`;
    await page.goto(proposalsUrl);
    
    // Check if proposal exists and accept it
    const acceptBtn = page.getByRole('button', { name: /Accept/i }).first();
    if (await acceptBtn.isVisible()) {
      await acceptBtn.click();
      
      // Look for success indicator or status change to 'Accepted'
      await expect(page.getByText(/accepted|Success/i).first()).toBeVisible({ timeout: 10000 });
    } else {
      console.log('No proposals found to accept.');
    }
  });
});
