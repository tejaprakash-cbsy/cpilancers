import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

/**
 * Pre-security QA route sweep.
 *
 * Drives anonymous, client and consultant across every implemented route at
 * three viewports, and records HTTP status plus whether the page actually
 * rendered (not an error boundary, not a bounce to /login).
 *
 * Only routes that exist under src/app are exercised. Nothing is invented.
 */
const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const EXEC = process.env.QA_CHROMIUM ||
  path.join(process.env.USERPROFILE, 'AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe');

const fx = JSON.parse(fs.readFileSync(path.join(APP, 'scripts', '.rt-fixtures.json'), 'utf8'));
const { origin, password, conversationId } = fx;
const results = [];
const log = (area, name, status, detail) => {
  results.push({ area, name, status, detail });
  console.log('[' + status + '] ' + area + ' / ' + name + ' :: ' + detail);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const VIEWPORTS = {
  mobile: { width: 390, height: 844 },
  tablet: { width: 820, height: 1180 },
  desktop: { width: 1440, height: 900 },
};

const PUBLIC = ['/', '/jobs', '/consultants'];
const CLIENT = ['/dashboard/client', '/profile', '/profile/edit', '/jobs/create', '/messages'];
const CONSULTANT = ['/dashboard/consultant', '/profile', '/profile/edit', '/proposals', '/messages'];
const INVALID = [
  '/jobs/00000000-0000-0000-0000-000000000000',
  '/consultants/00000000-0000-0000-0000-000000000000',
  '/jobs/not-a-uuid',
  '/forum/00000000-0000-0000-0000-000000000000',
];
const PROTECTED = ['/dashboard/client', '/jobs/create', '/profile', '/messages', '/proposals', '/forum/new'];

async function check(page, route, label, expect) {
  let status = 0;
  try {
    const r = await page.goto(origin + route, { waitUntil: 'domcontentloaded', timeout: 60000 });
    status = r ? r.status() : 0;
  } catch (e) {
    log(label, route, 'FAIL', 'navigation error: ' + e.message.slice(0, 80));
    return;
  }
  await sleep(1500);
  const info = await page.evaluate(() => ({
    url: location.pathname,
    text: document.body.innerText.replace(/\s+/g, ' ').trim(),
  }));
  const atLogin = /\/login/.test(info.url);
  let verdict = 'PASS';
  let detail;

  if (expect === 'login') {
    // Protected route while signed out: bouncing to /login is the CORRECT
    // outcome, not a failure.
    verdict = atLogin ? 'PASS' : 'FAIL';
    detail = atLogin ? 'guarded, redirected to ' + info.url : 'NOT guarded, rendered ' + info.url;
  } else if (status >= 500 || /Application error|Internal Server Error/i.test(info.text.slice(0, 300))) {
    verdict = 'FAIL';
    detail = 'HTTP ' + status + ' error page: ' + info.text.slice(0, 100);
  } else if (atLogin) {
    verdict = 'FAIL';
    detail = 'unexpectedly redirected to ' + info.url;
  } else if (info.text.length < 20) {
    verdict = 'FAIL';
    detail = 'HTTP ' + status + ' rendered empty';
  } else {
    detail = 'HTTP ' + status + ', ' + info.text.length + ' chars';
  }
  if (expect === 'text') detail += ' | ' + info.text.slice(0, 160);
  log(label, route, verdict, detail);
}

async function login(ctx, email) {
  const page = await ctx.newPage();
  await page.goto(origin + '/login', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');
  await sleep(5000);
  return page;
}

(async () => {
  const browser = await chromium.launch({ executablePath: EXEC, headless: true });

  // anonymous + public routes at every viewport
  const anonCtx = await browser.newContext({ viewport: VIEWPORTS.desktop });
  const anon = await anonCtx.newPage();
  for (const v of ['desktop', 'mobile', 'tablet']) {
    await anon.setViewportSize(VIEWPORTS[v]);
    for (const r of PUBLIC) await check(anon, r, 'public/' + v);
  }

  // invalid / unknown ids must not 500
  await anon.setViewportSize(VIEWPORTS.desktop);
  for (const r of INVALID) await check(anon, r, 'invalid-id');

  // protected routes while signed out -- redirecting to /login IS the pass
  for (const r of PROTECTED) await check(anon, r, 'anon/protected', 'login');

  // forum, anonymous. /forum/new requires auth, /forum is public.
  await check(anon, '/forum', 'forum/anon');
  await check(anon, '/forum/new', 'forum/anon', 'login');

  // client
  const clientPage = await login(await browser.newContext({ viewport: VIEWPORTS.desktop }), fx.emails.client);
  if (!/\/dashboard\/client/.test(clientPage.url())) log('auth', 'client login redirect', 'FAIL', 'landed on ' + clientPage.url());
  else log('auth', 'client login redirect', 'PASS', 'routed to ' + clientPage.url().replace(origin, ''));
  for (const r of CLIENT) await check(clientPage, r, 'client');
  await check(clientPage, '/messages/' + conversationId, 'client');

  // consultant
  const consPage = await login(await browser.newContext({ viewport: VIEWPORTS.desktop }), fx.emails.consultant);
  if (!/\/dashboard\/consultant/.test(consPage.url())) log('auth', 'consultant login redirect', 'FAIL', 'landed on ' + consPage.url());
  else log('auth', 'consultant login redirect', 'PASS', 'routed to ' + consPage.url().replace(origin, ''));
  for (const r of CONSULTANT) await check(consPage, r, 'consultant');

  // cross-role guards. Text is captured because a role reaching another role's
  // page may render a refusal (correct) or the real UI (a guard gap).
  for (const r of ['/jobs/create', '/dashboard/client']) await check(consPage, r, 'cross-role/consultant', 'text');
  for (const r of ['/dashboard/consultant', '/proposals']) await check(clientPage, r, 'cross-role/client', 'text');

  // dashboards rendered very little text; confirm they are not broken shells
  await check(clientPage, '/dashboard/client', 'dashboard-content', 'text');
  await check(consPage, '/dashboard/consultant', 'dashboard-content', 'text');

  // responsive on the heaviest authenticated page
  for (const [name, page] of [['client', clientPage], ['consultant', consPage]]) {
    for (const v of ['mobile', 'tablet']) {
      await page.setViewportSize(VIEWPORTS[v]);
      await check(page, '/messages', 'responsive/' + name + '/' + v);
      await page.setViewportSize(VIEWPORTS.desktop);
    }
  }

  // logout. The control is a <button> inside a form in the header. It is not
  // present on /dashboard/client until that shell finishes hydrating, so settle
  // on /profile first, then assert the session is actually destroyed.
  const outPage = await login(await browser.newContext({ viewport: VIEWPORTS.desktop }), fx.emails.client);
  await outPage.goto(origin + '/profile', { waitUntil: 'domcontentloaded' });
  await sleep(4000);
  const before = await outPage.evaluate(() => fetch('/api/auth/me').then((r) => r.status).catch(() => 0));
  const logout = outPage.locator('button', { hasText: /log\s*out/i }).first();
  if (await logout.count()) {
    await logout.click();
    await sleep(4000);
    const after = await outPage.evaluate(() => fetch('/api/auth/me').then((r) => r.status).catch(() => 0));
    log('auth', 'logout', before === 200 && after === 401 ? 'PASS' : 'FAIL',
      '/api/auth/me before=' + before + ' after=' + after);
  } else {
    log('auth', 'logout', 'NOT TESTED', 'no logout control found on /profile');
  }

  await browser.close();
  const count = (s) => results.filter((r) => r.status === s).length;
  console.log('\n=== SWEEP SUMMARY ===');
  console.log('PASS=' + count('PASS') + ' FAIL=' + count('FAIL') + ' NOT TESTED=' + count('NOT TESTED'));
  fs.writeFileSync(path.join(APP, 'scripts', '.route-sweep.json'), JSON.stringify(results, null, 2));
})().catch((e) => { console.log('HARNESS ERROR ' + e.message); process.exit(1); });