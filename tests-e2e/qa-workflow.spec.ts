import { test, expect } from '@playwright/test';

test.describe('CPI Lancers Workflow QA', () => {
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

  test('Phase 4 & 5: Job Creation and Proposals', async ({ page }) => {
    test.setTimeout(60000); // Allow enough time for interactions
    // === 1. Client Workflow ===
    await ensureLoggedOut(page);
    
    // Login as Client
    await page.goto(`${baseURL}/login`);
    await page.getByLabel(/Email Address/i).fill(clientEmail);
    await page.getByLabel(/Password/i).fill('Password123!');
    await page.getByRole('button', { name: /Sign In/i }).click();
    
    // Verify Dashboard
    await expect(page).toHaveURL(/.*dashboard.*/, { timeout: 10000 });

    // Create Job
    await page.goto(`${baseURL}/jobs/create`);
    await page.getByLabel(/Title|Job Title/i).fill(`Integration Job ${timestamp}`);
    await page.getByLabel(/Description/i).fill('Need an SAP CPI expert to integrate SuccessFactors with S/4HANA.');
    await page.getByLabel(/Budget/i).fill('5000');
    
    // Click Post
    const postButton = page.getByRole('button', { name: /Post|Create/i });
    if (await postButton.isVisible()) {
      await postButton.click();
      await expect(page).toHaveURL(/.*jobs.*/, { timeout: 10000 });
    }

    await ensureLoggedOut(page);

    // === 2. Consultant Workflow ===
    // Login as Consultant
    await page.goto(`${baseURL}/login`);
    await page.getByLabel(/Email Address/i).fill(consultantEmail);
    await page.getByLabel(/Password/i).fill('Password123!');
    await page.getByRole('button', { name: /Sign In/i }).click();
    
    await expect(page).toHaveURL(/.*dashboard.*/, { timeout: 10000 });

    // Browse Jobs
    await page.goto(`${baseURL}/jobs`);
    // Wait for jobs to load
    await page.waitForTimeout(2000);
    const jobLink = page.getByText(`Integration Job ${timestamp}`);
    if (await jobLink.isVisible()) {
      await jobLink.click();
      
      // Submit Proposal
      const proposeButton = page.getByRole('button', { name: /Submit Proposal/i });
      if (await proposeButton.isVisible()) {
        await proposeButton.click();
        await page.getByLabel(/Cover Letter|Proposal/i).fill('I am an expert in this.');
        await page.getByLabel(/Rate|Amount/i).fill('4500');
        await page.getByRole('button', { name: /Submit/i }).click();
        await expect(page.getByText(/Success/i)).toBeVisible({ timeout: 10000 });
      }
    }
    // === 3. Client Workflow (Accept Proposal) ===
    await ensureLoggedOut(page);
    
    // Login as Client
    await page.goto(`${baseURL}/login`);
    await page.getByLabel(/Email Address/i).fill(clientEmail);
    await page.getByLabel(/Password/i).fill('Password123!');
    await page.getByRole('button', { name: /Sign In/i }).click();
    
    await expect(page).toHaveURL(/.*dashboard.*/, { timeout: 10000 });

    // Go to Jobs page and find the job ID
    await page.goto(`${baseURL}/jobs`);
    const clientJobLink = page.getByText(`Integration Job ${timestamp}`);
    if (await clientJobLink.isVisible()) {
      await clientJobLink.click();
      await page.waitForURL(/.*\/jobs\/.*/);
      
      const jobHref = page.url(); 
      // Click 'View proposals' button
      const viewProposalsBtn = page.getByRole('button', { name: /View proposals/i });
      if (await viewProposalsBtn.isVisible()) {
        await viewProposalsBtn.click();
        await page.waitForURL(/.*\/proposals/);
      }
      
      // Accept the proposal
      const acceptBtn = page.getByRole('button', { name: /Accept/i }).first();
      if (await acceptBtn.isVisible()) {
        await acceptBtn.click();
        await expect(page.getByText(/accepted/i).first()).toBeVisible({ timeout: 10000 });
      }
    }
  });
});
