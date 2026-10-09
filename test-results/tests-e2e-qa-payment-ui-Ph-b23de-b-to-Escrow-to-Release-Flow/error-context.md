# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: tests-e2e\qa-payment-ui.spec.ts >> Phase 8: Payment & Escrow Flow UI >> End-to-End Job to Escrow to Release Flow
- Location: tests-e2e\qa-payment-ui.spec.ts:18:7

# Error details

```
Test timeout of 90000ms exceeded.
```

```
Error: locator.click: Test timeout of 90000ms exceeded.
Call log:
  - waiting for getByText('Payment E2E Job 1791562291497')

```

# Page snapshot

```yaml
- generic [active] [ref=f5e1]:
  - banner [ref=f5e2]:
    - generic [ref=f5e4]:
      - generic [ref=f5e5]:
        - link "CPI Lancers" [ref=f5e6] [cursor=pointer]:
          - /url: /
        - navigation [ref=f5e13]:
          - link "Browse Jobs" [ref=f5e14] [cursor=pointer]:
            - /url: /jobs
          - link "Browse Freelancers" [ref=f5e15] [cursor=pointer]:
            - /url: /consultants
          - link "Community" [ref=f5e16] [cursor=pointer]:
            - /url: /forum
      - generic [ref=f5e17]:
        - link "Dashboard" [ref=f5e18] [cursor=pointer]:
          - /url: /dashboard/consultant
        - button "Log out" [ref=f5e20] [cursor=pointer]
  - main [ref=f5e21]:
    - main [ref=f5e22]:
      - generic [ref=f5e24]:
        - generic [ref=f5e25]:
          - generic [ref=f5e26]:
            - paragraph [ref=f5e27]: Marketplace
            - heading "Find work with real momentum" [level=1] [ref=f5e28]
            - paragraph [ref=f5e29]: 0 open projects from serious clients around the world.
          - button "Saved jobs" [ref=f5e30] [cursor=pointer]
        - generic [ref=f5e31]:
          - textbox "Search jobs by title, skill, or company" [ref=f5e35]
          - button "Search jobs" [ref=f5e36] [cursor=pointer]
        - generic [ref=f5e37]:
          - generic [ref=f5e38]: All jobs
          - generic [ref=f5e39]: p2p
          - generic [ref=f5e40]: a2a
          - generic [ref=f5e41]: b2b
          - generic [ref=f5e42]: batch
          - generic [ref=f5e43]: realtime
          - generic [ref=f5e44]: event driven
          - generic [ref=f5e45]: hybrid
      - generic [ref=f5e46]:
        - complementary [ref=f5e47]:
          - generic [ref=f5e48]:
            - generic [ref=f5e49]:
              - heading "Filters" [level=2] [ref=f5e50]
              - button "Clear all" [ref=f5e51]
            - generic [ref=f5e52]:
              - generic [ref=f5e53]:
                - generic [ref=f5e54]: Engagement type
                - generic [ref=f5e57]:
                  - checkbox "Hourly" [ref=f5e58]
                  - generic [ref=f5e59]: Hourly
                - generic [ref=f5e60]:
                  - checkbox "Fixed price" [ref=f5e61]
                  - generic [ref=f5e62]: Fixed price
                - generic [ref=f5e63]:
                  - checkbox "Budget range" [ref=f5e64]
                  - generic [ref=f5e65]: Budget range
              - generic [ref=f5e66]:
                - generic [ref=f5e67]: Minimum budget
                - generic [ref=f5e70]:
                  - checkbox "$5,000+" [ref=f5e71]
                  - generic [ref=f5e72]: $5,000+
                - generic [ref=f5e73]:
                  - checkbox "$1,000–$4,999" [ref=f5e74]
                  - generic [ref=f5e75]: $1,000–$4,999
                - generic [ref=f5e76]:
                  - checkbox "$500–$999" [ref=f5e77]
                  - generic [ref=f5e78]: $500–$999
        - generic [ref=f5e79]:
          - generic [ref=f5e80]:
            - generic [ref=f5e81]:
              - heading "0 matching jobs" [level=2] [ref=f5e82]
              - paragraph [ref=f5e83]: Showing all currently open projects
            - generic [ref=f5e85]:
              - generic [ref=f5e86]: Most relevant
              - combobox "Most relevant":
                - option "Most relevant" [selected]
                - option "Recently updated"
                - option "Most viewed"
          - generic [ref=f5e89]:
            - generic [ref=f5e90]: Get alerts for all open projects
            - button "Save search" [ref=f5e96]
          - generic [ref=f5e98]:
            - paragraph [ref=f5e99]: No jobs found matching your criteria.
            - button "Show all jobs" [ref=f5e100]
  - contentinfo [ref=f5e101]:
    - generic [ref=f5e103]:
      - generic [ref=f5e104]:
        - link "CPI Lancers" [ref=f5e105] [cursor=pointer]:
          - /url: /
        - paragraph [ref=f5e112]: The premier B2B freelance marketplace dedicated to SAP Cloud Integration (CPI) and SAP Integration Suite specialists.
        - generic [ref=f5e113]: © 2026 CPI Lancers. All rights reserved.
      - generic [ref=f5e114]:
        - heading "For Clients" [level=4] [ref=f5e115]
        - list [ref=f5e116]:
          - listitem [ref=f5e117]:
            - link "Browse SAP CPI Consultants" [ref=f5e118] [cursor=pointer]:
              - /url: /consultants
          - listitem [ref=f5e119]:
            - link "Post an Integration Requirement" [ref=f5e120] [cursor=pointer]:
              - /url: /jobs/create
          - listitem [ref=f5e121]:
            - link "Escrow & Milestone Protection" [ref=f5e122] [cursor=pointer]:
              - /url: /how-it-works
          - listitem [ref=f5e123]:
            - link "Transparent Pricing" [ref=f5e124] [cursor=pointer]:
              - /url: /pricing
      - generic [ref=f5e125]:
        - heading "For Consultants" [level=4] [ref=f5e126]
        - list [ref=f5e127]:
          - listitem [ref=f5e128]:
            - link "Browse Open Integration Jobs" [ref=f5e129] [cursor=pointer]:
              - /url: /jobs
          - listitem [ref=f5e130]:
            - link "Create Consultant Profile" [ref=f5e131] [cursor=pointer]:
              - /url: /register
          - listitem [ref=f5e132]:
            - link "SAP Certification Verification" [ref=f5e133] [cursor=pointer]:
              - /url: /certifications
          - listitem [ref=f5e134]:
            - link "Direct Payouts & Low Fees" [ref=f5e135] [cursor=pointer]:
              - /url: /how-it-works
      - generic [ref=f5e136]:
        - heading "SAP Ecosystem" [level=4] [ref=f5e137]
        - list [ref=f5e138]:
          - listitem [ref=f5e139]: SAP Cloud Integration (CPI)
          - listitem [ref=f5e140]: SAP S/4HANA & ECC Integration
          - listitem [ref=f5e141]: SAP SuccessFactors & Ariba
          - listitem [ref=f5e142]: API Management & Event Mesh
          - listitem [ref=f5e143]: IDoc, OData, SOAP & REST
  - button "Open Next.js Dev Tools" [ref=f5e149] [cursor=pointer]
  - alert [ref=f5e153]
```

# Test source

```ts
  1   | import { test, expect } from '@playwright/test';
  2   | 
  3   | test.describe('Phase 8: Payment & Escrow Flow UI', () => {
  4   |   const baseURL = 'http://localhost:3000';
  5   |   const timestamp = Date.now();
  6   |   const clientEmail = 'client.qa.test@example.com';
  7   |   const consultantEmail = 'consultant.qa.test@example.com';
  8   | 
  9   |   const ensureLoggedOut = async (page: any) => {
  10  |     await page.goto(baseURL);
  11  |     const logoutBtn = page.getByRole('button', { name: /Log out/i });
  12  |     if (await logoutBtn.isVisible()) {
  13  |       await logoutBtn.click();
  14  |       await page.waitForURL('**/api/auth/logout');
  15  |     }
  16  |   };
  17  | 
  18  |   test('End-to-End Job to Escrow to Release Flow', async ({ page }) => {
  19  |     test.setTimeout(90000); 
  20  | 
  21  |     // === 1. Client creates a job ===
  22  |     await ensureLoggedOut(page);
  23  |     await page.goto(`${baseURL}/login`);
  24  |     await page.getByLabel(/Email Address/i).fill(clientEmail);
  25  |     await page.getByLabel(/Password/i).fill('Password123!');
  26  |     await page.getByRole('button', { name: /Sign In/i }).click();
  27  |     await expect(page).toHaveURL(/.*dashboard.*/, { timeout: 10000 });
  28  | 
  29  |     const jobTitle = `Payment E2E Job ${timestamp}`;
  30  |     await page.goto(`${baseURL}/jobs/create`);
  31  |     await page.getByLabel(/Title|Job Title/i).fill(jobTitle);
  32  |     await page.getByLabel(/Description/i).fill('Testing the payment flow.');
  33  |     await page.getByLabel(/Budget/i).fill('5000');
  34  |     await page.getByRole('button', { name: /Post|Create/i }).click();
  35  |     await expect(page).toHaveURL(/.*jobs.*/, { timeout: 10000 });
  36  |     
  37  |     await ensureLoggedOut(page);
  38  | 
  39  |     // === 2. Consultant submits a proposal ===
  40  |     await page.goto(`${baseURL}/login`);
  41  |     await page.getByLabel(/Email Address/i).fill(consultantEmail);
  42  |     await page.getByLabel(/Password/i).fill('Password123!');
  43  |     await page.getByRole('button', { name: /Sign In/i }).click();
  44  |     await expect(page).toHaveURL(/.*dashboard.*/, { timeout: 10000 });
  45  | 
  46  |     await page.goto(`${baseURL}/jobs`);
  47  |     await page.waitForTimeout(2000);
  48  |     const jobLink = page.getByText(jobTitle);
> 49  |     await jobLink.click();
      |                   ^ Error: locator.click: Test timeout of 90000ms exceeded.
  50  |     
  51  |     await page.getByRole('button', { name: /Submit Proposal/i }).click();
  52  |     await page.getByLabel(/Cover Letter|Proposal/i).fill('I will do it!');
  53  |     await page.getByLabel(/Rate|Amount/i).fill('4500');
  54  |     await page.getByRole('button', { name: /Submit/i }).click();
  55  |     await expect(page.getByText('Proposal submitted successfully')).toBeVisible({ timeout: 10000 });
  56  |     
  57  |     await ensureLoggedOut(page);
  58  | 
  59  |     // === 3. Client accepts the proposal ===
  60  |     await page.goto(`${baseURL}/login`);
  61  |     await page.getByLabel(/Email Address/i).fill(clientEmail);
  62  |     await page.getByLabel(/Password/i).fill('Password123!');
  63  |     await page.getByRole('button', { name: /Sign In/i }).click();
  64  |     
  65  |     await page.goto(`${baseURL}/dashboard/client`);
  66  |     await page.getByRole('button', { name: /View Proposals/i }).first().click();
  67  |     await page.waitForTimeout(1000);
  68  | 
  69  |     const acceptBtn = page.getByRole('button', { name: /Accept Proposal/i }).first();
  70  |     await acceptBtn.click();
  71  |     await expect(page.getByText(/Contract successfully created/i)).toBeVisible({ timeout: 10000 });
  72  |     
  73  |     // === 4. Client navigates to the contract and funds ===
  74  |     await page.goto(`${baseURL}/contracts`);
  75  |     await page.getByRole('button', { name: 'View' }).first().click();
  76  |     await expect(page.getByRole('heading', { name: 'Milestones' })).toBeVisible({ timeout: 10000 });
  77  |     
  78  |     await page.getByRole('button', { name: 'Fund' }).first().click();
  79  |     await expect(page.locator('span', { hasText: 'funded' }).first()).toBeVisible({ timeout: 10000 });
  80  | 
  81  |     await ensureLoggedOut(page);
  82  | 
  83  |     // === 5. Consultant submits work ===
  84  |     await page.goto(`${baseURL}/login`);
  85  |     await page.getByLabel(/Email Address/i).fill(consultantEmail);
  86  |     await page.getByLabel(/Password/i).fill('Password123!');
  87  |     await page.getByRole('button', { name: /Sign In/i }).click();
  88  | 
  89  |     await page.goto(`${baseURL}/contracts`);
  90  |     await page.getByRole('button', { name: 'View' }).first().click();
  91  |     
  92  |     await page.getByRole('button', { name: 'Start Work' }).first().click();
  93  |     await expect(page.locator('span', { hasText: /in progress/i }).first()).toBeVisible({ timeout: 10000 });
  94  |     
  95  |     await page.getByRole('button', { name: 'Submit Work' }).first().click();
  96  |     await expect(page.locator('span', { hasText: 'submitted' }).first()).toBeVisible({ timeout: 10000 });
  97  | 
  98  |     await ensureLoggedOut(page);
  99  | 
  100 |     // === 6. Client approves and releases payment ===
  101 |     await page.goto(`${baseURL}/login`);
  102 |     await page.getByLabel(/Email Address/i).fill(clientEmail);
  103 |     await page.getByLabel(/Password/i).fill('Password123!');
  104 |     await page.getByRole('button', { name: /Sign In/i }).click();
  105 |     
  106 |     await page.goto(`${baseURL}/contracts`);
  107 |     await page.getByRole('button', { name: 'View' }).first().click();
  108 |     
  109 |     await page.getByRole('button', { name: 'Approve & Release' }).first().click();
  110 |     await expect(page.locator('span', { hasText: 'approved' }).first()).toBeVisible({ timeout: 10000 });
  111 |   });
  112 | });
  113 | 
```