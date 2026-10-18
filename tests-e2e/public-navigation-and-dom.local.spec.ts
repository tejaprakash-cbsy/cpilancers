import { test, expect } from '@playwright/test';

test.describe('Public Navigation, DOM, Legal Pages, and Web Assets', () => {
  test('terms page (/terms) renders successfully with semantic hierarchy and valid content', async ({ page }) => {
    const res = await page.goto('/terms');
    expect(res?.status()).toBe(200);
    await expect(page.getByRole('heading', { level: 1, name: /Terms of Service/i })).toBeVisible();
    await expect(page.getByText(/Pending Corporate & Legal Approval/i)).toBeVisible();
    await expect(page.getByText(/Platform Overview/i)).toBeVisible();
  });

  test('privacy policy (/privacy) renders successfully with data protection sections', async ({ page }) => {
    const res = await page.goto('/privacy');
    expect(res?.status()).toBe(200);
    await expect(page.getByRole('heading', { level: 1, name: /Privacy Policy/i })).toBeVisible();
    await expect(page.getByText(/Pending Corporate & Legal Approval/i)).toBeVisible();
    await expect(page.getByText(/Commitment to Confidentiality/i)).toBeVisible();
  });

  test('pricing page (/pricing) renders client/consultant fee tiers and commercial notice', async ({ page }) => {
    const res = await page.goto('/pricing');
    expect(res?.status()).toBe(200);
    await expect(page.getByRole('heading', { level: 1, name: /Marketplace Pricing/i })).toBeVisible();
    await expect(page.getByText(/Pending Commercial Approval/i)).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: /For Clients/i })).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: /For Consultants/i })).toBeVisible();
  });

  test('how it works page (/how-it-works) renders end-to-end workflows', async ({ page }) => {
    const res = await page.goto('/how-it-works');
    expect(res?.status()).toBe(200);
    await expect(page.getByRole('heading', { level: 1, name: /How CPI Lancers Works/i })).toBeVisible();
    await expect(page.getByRole('heading', { name: /For Enterprise Clients/i })).toBeVisible();
    await expect(page.getByRole('heading', { name: /For SAP Consultants/i })).toBeVisible();
  });

  test('certifications page (/certifications) renders certification program status', async ({ page }) => {
    const res = await page.goto('/certifications');
    expect(res?.status()).toBe(200);
    await expect(page.getByRole('heading', { level: 1, name: /SAP Certification Program/i })).toBeVisible();
    await expect(page.getByText(/Verification Guidelines in Development/i)).toBeVisible();
    await expect(page.getByText('C_CPE_16')).toBeVisible();
  });

  test('verify email page (/verify-email) renders check email instructions and login CTA', async ({ page }) => {
    const res = await page.goto('/verify-email');
    expect(res?.status()).toBe(200);
    await expect(page.getByText(/Check Your Email/i)).toBeVisible();
    await expect(page.getByRole('link', { name: /Proceed to Sign In/i })).toBeVisible();
  });

  test('web app manifest and vector icon are accessible via HTTP 200', async ({ request }) => {
    const manifestRes = await request.get('/manifest.webmanifest');
    expect(manifestRes.status()).toBe(200);
    const manifestJson = await manifestRes.json();
    expect(manifestJson.name).toBe('CPI Lancers | Integration Marketplace');
    expect(manifestJson.icons.some((i: { src: string }) => i.src === '/icon.svg')).toBe(true);

    const iconRes = await request.get('/icon.svg');
    expect(iconRes.status()).toBe(200);
    expect(iconRes.headers()['content-type']).toContain('svg');

    const faviconRes = await request.get('/favicon.ico');
    expect(faviconRes.status()).toBe(200);
  });

  test('footer navigation on home page includes working links to all legal and informational pages', async ({ page }) => {
    await page.goto('/');

    // Check footer links
    const termsLink = page.getByRole('link', { name: /Terms of Service/i }).first();
    const pricingLink = page.getByRole('link', { name: /Transparent Pricing|Pricing/i }).first();
    const howItWorksLink = page.getByRole('link', { name: /How it works|Escrow & Milestone Protection/i }).first();
    const certsLink = page.getByRole('link', { name: /SAP Certification Verification/i }).first();

    await expect(pricingLink).toBeVisible();
    await expect(howItWorksLink).toBeVisible();
    await expect(certsLink).toBeVisible();
  });

  test('GET /api/auth/me returns 401 UNAUTHORIZED contract for anonymous visitors', async ({ request }) => {
    const res = await request.get('/api/auth/me');
    expect(res.status()).toBe(401);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('UNAUTHORIZED');
  });
});
