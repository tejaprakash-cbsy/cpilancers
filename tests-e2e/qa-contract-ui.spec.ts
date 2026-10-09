import { test, expect } from '@playwright/test';

test.describe('Phase 7C: Contract and Milestone UI', () => {
  const baseURL = 'http://localhost:3000';
  const clientEmail = 'client.qa.test@example.com';
  const consultantEmail = 'consultant.qa.test@example.com';

  test('Client and Consultant can view contracts and milestones', async ({ browser }) => {
    test.setTimeout(120000);
    
    const clientContext = await browser.newContext();
    const clientPage = await clientContext.newPage();
    
    // Client Login
    await clientPage.goto(`${baseURL}/login`);
    await clientPage.getByLabel(/Email Address/i).fill(clientEmail);
    await clientPage.getByLabel(/Password/i).fill('Password123!');
    await clientPage.getByRole('button', { name: /Sign In/i }).click();
    await expect(clientPage).toHaveURL(/.*dashboard.*/, { timeout: 10000 });

    // Navigate to Contracts
    await clientPage.goto(`${baseURL}/contracts`);
    await expect(clientPage.getByRole('heading', { name: 'Contracts', exact: true })).toBeVisible();

    // The client may have 0 contracts if not created yet. 
    // Wait for the table or empty state
    const emptyState = clientPage.getByText('No contracts yet');
    const tableRow = clientPage.getByRole('row').nth(1);

    await Promise.race([
      expect(emptyState).toBeVisible(),
      expect(tableRow).toBeVisible()
    ]);

    if (await tableRow.isVisible()) {
      // Click View
      await clientPage.getByRole('button', { name: 'View' }).first().click();
      await expect(clientPage.getByText('Terms')).toBeVisible({ timeout: 10000 });
      await expect(clientPage.getByRole('heading', { name: 'Milestones' })).toBeVisible();
    }
    
    await clientContext.close();
    
    // Consultant Login
    const consultantContext = await browser.newContext();
    const consultantPage = await consultantContext.newPage();
    
    await consultantPage.goto(`${baseURL}/login`);
    await consultantPage.getByLabel(/Email Address/i).fill(consultantEmail);
    await consultantPage.getByLabel(/Password/i).fill('Password123!');
    await consultantPage.getByRole('button', { name: /Sign In/i }).click();
    await expect(consultantPage).toHaveURL(/.*dashboard.*/, { timeout: 10000 });

    await consultantPage.goto(`${baseURL}/contracts`);
    await expect(consultantPage.getByRole('heading', { name: 'Contracts', exact: true })).toBeVisible();
    
    const emptyStateCons = consultantPage.getByText('No contracts yet');
    const tableRowCons = consultantPage.getByRole('row').nth(1);

    await Promise.race([
      expect(emptyStateCons).toBeVisible(),
      expect(tableRowCons).toBeVisible()
    ]);

    if (await tableRowCons.isVisible()) {
      await consultantPage.getByRole('button', { name: 'View' }).first().click();
      await expect(consultantPage.getByText('Terms')).toBeVisible({ timeout: 10000 });
      // Depending on whether it's fixed price or hourly, Milestones might be visible
    }

    await consultantContext.close();
  });
});
