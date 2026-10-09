import { test, expect } from '@playwright/test';

test.describe('Phase 8: Payment & Escrow Flow UI', () => {
  const baseURL = 'http://localhost:3000';
  const timestamp = Date.now();
  const clientEmail = 'client.qa.test@example.com';
  const consultantEmail = 'consultant.qa.test@example.com';

  const ensureLoggedOut = async (page: any) => {
    await page.goto(baseURL);
    const logoutBtn = page.getByRole('button', { name: /Log out/i });
    if (await logoutBtn.isVisible()) {
      await logoutBtn.click();
      await page.waitForURL('**/api/auth/logout');
    }
  };

  test('End-to-End Job to Escrow to Release Flow', async ({ page }) => {
    test.setTimeout(90000); 

    // === 1. Client creates a job ===
    await ensureLoggedOut(page);
    await page.goto(`${baseURL}/login`);
    await page.getByLabel(/Email Address/i).fill(clientEmail);
    await page.getByLabel(/Password/i).fill('Password123!');
    await page.getByRole('button', { name: /Sign In/i }).click();
    await expect(page).toHaveURL(/.*dashboard.*/, { timeout: 10000 });

    const jobTitle = `Payment E2E Job ${timestamp}`;
    await page.goto(`${baseURL}/jobs/create`);
    await page.getByLabel(/Title|Job Title/i).fill(jobTitle);
    await page.getByLabel(/Description/i).fill('Testing the payment flow.');
    await page.getByLabel(/Budget/i).fill('5000');
    await page.getByRole('button', { name: /Post|Create/i }).click();
    await expect(page).toHaveURL(/.*jobs.*/, { timeout: 10000 });
    
    await ensureLoggedOut(page);

    // === 2. Consultant submits a proposal ===
    await page.goto(`${baseURL}/login`);
    await page.getByLabel(/Email Address/i).fill(consultantEmail);
    await page.getByLabel(/Password/i).fill('Password123!');
    await page.getByRole('button', { name: /Sign In/i }).click();
    await expect(page).toHaveURL(/.*dashboard.*/, { timeout: 10000 });

    await page.goto(`${baseURL}/jobs`);
    await page.waitForTimeout(2000);
    const jobLink = page.getByText(jobTitle);
    await jobLink.click();
    
    await page.getByRole('button', { name: /Submit Proposal/i }).click();
    await page.getByLabel(/Cover Letter|Proposal/i).fill('I will do it!');
    await page.getByLabel(/Rate|Amount/i).fill('4500');
    await page.getByRole('button', { name: /Submit/i }).click();
    await expect(page.getByText('Proposal submitted successfully')).toBeVisible({ timeout: 10000 });
    
    await ensureLoggedOut(page);

    // === 3. Client accepts the proposal ===
    await page.goto(`${baseURL}/login`);
    await page.getByLabel(/Email Address/i).fill(clientEmail);
    await page.getByLabel(/Password/i).fill('Password123!');
    await page.getByRole('button', { name: /Sign In/i }).click();
    
    await page.goto(`${baseURL}/dashboard/client`);
    await page.getByRole('button', { name: /View Proposals/i }).first().click();
    await page.waitForTimeout(1000);

    const acceptBtn = page.getByRole('button', { name: /Accept Proposal/i }).first();
    await acceptBtn.click();
    await expect(page.getByText(/Contract successfully created/i)).toBeVisible({ timeout: 10000 });
    
    // === 4. Client navigates to the contract and funds ===
    await page.goto(`${baseURL}/contracts`);
    await page.getByRole('button', { name: 'View' }).first().click();
    await expect(page.getByRole('heading', { name: 'Milestones' })).toBeVisible({ timeout: 10000 });
    
    await page.getByRole('button', { name: 'Fund' }).first().click();
    await expect(page.locator('span', { hasText: 'funded' }).first()).toBeVisible({ timeout: 10000 });

    await ensureLoggedOut(page);

    // === 5. Consultant submits work ===
    await page.goto(`${baseURL}/login`);
    await page.getByLabel(/Email Address/i).fill(consultantEmail);
    await page.getByLabel(/Password/i).fill('Password123!');
    await page.getByRole('button', { name: /Sign In/i }).click();

    await page.goto(`${baseURL}/contracts`);
    await page.getByRole('button', { name: 'View' }).first().click();
    
    await page.getByRole('button', { name: 'Start Work' }).first().click();
    await expect(page.locator('span', { hasText: /in progress/i }).first()).toBeVisible({ timeout: 10000 });
    
    await page.getByRole('button', { name: 'Submit Work' }).first().click();
    await expect(page.locator('span', { hasText: 'submitted' }).first()).toBeVisible({ timeout: 10000 });

    await ensureLoggedOut(page);

    // === 6. Client approves and releases payment ===
    await page.goto(`${baseURL}/login`);
    await page.getByLabel(/Email Address/i).fill(clientEmail);
    await page.getByLabel(/Password/i).fill('Password123!');
    await page.getByRole('button', { name: /Sign In/i }).click();
    
    await page.goto(`${baseURL}/contracts`);
    await page.getByRole('button', { name: 'View' }).first().click();
    
    await page.getByRole('button', { name: 'Approve & Release' }).first().click();
    await expect(page.locator('span', { hasText: 'approved' }).first()).toBeVisible({ timeout: 10000 });
  });
});
