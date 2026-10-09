import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

/**
 * Realtime browser end-to-end verification.
 *
 * Proves the FULL path required for a real delivery claim:
 *
 *   Browser A -> application UI -> /api/messages -> Supabase Postgres
 *             -> Supabase Realtime (websocket) -> Browser B's DOM
 *
 * Two independent authenticated browser CONTEXTS are used, so B is a genuinely
 * separate session rather than a second tab sharing A's storage.
 *
 * SUBSCRIBED is read from the realtime websocket frames the browser itself
 * opens (Phoenix `phx_join` reply with "status":"ok"), not from application
 * state and not from a direct Supabase script.
 *
 * NOTE: SUBSCRIBED alone proves nothing about delivery. A table that is absent
 * from the `supabase_realtime` publication also reports SUBSCRIBED, so the
 * delivery assertions below are what actually decide the verdict.
 */
const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const EXEC = process.env.QA_CHROMIUM ||
  path.join(process.env.USERPROFILE, 'AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe');

const fx = JSON.parse(fs.readFileSync(path.join(APP, 'scripts', '.rt-fixtures.json'), 'utf8'));
const { origin, password, conversationId, emails } = fx;
const CH = 'messages:conversation_id=eq.' + conversationId;
const INPUT = 'input[placeholder="Type a message..."]';

const results = [];
function log(name, status, detail) {
  results.push({ name, status, detail });
  console.log('[' + status + '] ' + name + ' :: ' + detail);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function occurrences(page, text) {
  return page.evaluate((t) => {
    const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let n = 0;
    while (walk.nextNode()) if ((walk.currentNode.nodeValue || '').includes(t)) n++;
    return n;
  }, text);
}

async function waitForOccurrence(page, text, ms, exact) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    const n = await occurrences(page, text);
    if (exact ? n === exact : n > 0) return n;
    await sleep(300);
  }
  return exact ? -1 : 0;
}

function watchRealtime(page) {
  const state = { joined: false, frames: 0 };
  page.on('websocket', (ws) => {
    if (!/wss?:\/\/.*\/realtime/.test(ws.url())) return;
    ws.on('framereceived', (f) => {
      const s = typeof f.payload === 'string' ? f.payload : String(f.payload);
      state.frames++;
      if (s.includes(CH) && /"status"\s*:\s*"ok"/.test(s)) state.joined = true;
    });
  });
  return state;
}

async function login(ctx, email) {
  const page = await ctx.newPage();
  await page.goto(origin + '/login', { waitUntil: 'domcontentloaded' });
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
  return page;
}

async function send(page, text) {
  await page.fill(INPUT, text);
  const btn = page.locator('form button').last();
  await btn.click().catch(() => page.press(INPUT, 'Enter'));
  // Wait for the composer to clear. Without this the button can still be
  // disabled from the previous POST and a burst send is silently dropped,
  // which looks exactly like a delivery failure. Not a product defect.
  const cleared = await page.waitForFunction(
    (sel) => { const el = document.querySelector(sel); return el && el.value === ''; },
    INPUT, { timeout: 15000 }
  ).then(() => true).catch(() => false);
  if (!cleared) await sleep(500);
}

function finish() {
  const pass = results.filter((r) => r.status === 'PASS').length;
  const fail = results.filter((r) => r.status === 'FAIL').length;
  const nt = results.filter((r) => r.status === 'NOT TESTED').length;
  // The verdict must never read VERIFIED unless the delivery assertions
  // actually ran and passed. Requiring the A->B and B->A delivery rows keeps a
  // harness crash from being reported as a successful realtime result.
  const need = ['Client A -> Consultant B delivery (no refresh)',
                'Consultant B -> Client A delivery (no refresh)',
                'No duplicate delivery to B'];
  const delivered = need.every((n) => results.some((r) => r.name === n && r.status === 'PASS'));
  const ok = fail === 0 && delivered;
  console.log('\n=== SUMMARY ===');
  console.log('PASS=' + pass + ' FAIL=' + fail + ' NOT TESTED=' + nt);
  console.log('DELIVERY_VERDICT=' + (ok ? 'VERIFIED' : 'NOT VERIFIED'));
  fs.writeFileSync(path.join(APP, 'scripts', '.rt-results.json'), JSON.stringify(results, null, 2));
  process.exit(ok ? 0 : 1);
}
(async () => {
  const stamp = Date.now().toString(36);
  const A1 = 'RT-A1-' + stamp;
  const B1 = 'RT-B1-' + stamp;
  const burst = ['RT-M1-' + stamp, 'RT-M2-' + stamp, 'RT-M3-' + stamp];

  const browser = await chromium.launch({ executablePath: EXEC, headless: true });
  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  const ctxOut = await browser.newContext();

  // --- 1/2. two independent authenticated contexts ----------------------
  const pageA = await login(ctxA, emails.client);
  const pageB = await login(ctxB, emails.consultant);

  const meA = await pageA.evaluate(() => fetch('/api/auth/me').then((r) => r.status));
  const meB = await pageB.evaluate(() => fetch('/api/auth/me').then((r) => r.status));
  log('Client A authenticated (/api/auth/me)', meA === 200 ? 'PASS' : 'FAIL', 'HTTP ' + meA);
  log('Consultant B authenticated (/api/auth/me)', meB === 200 ? 'PASS' : 'FAIL', 'HTTP ' + meB);

  // --- 3/4. both open the conversation and reach SUBSCRIBED -------------
  const wA = watchRealtime(pageA);
  const wB = watchRealtime(pageB);
  await pageA.goto(origin + '/messages/' + conversationId, { waitUntil: 'domcontentloaded' });
  await pageB.goto(origin + '/messages/' + conversationId, { waitUntil: 'domcontentloaded' });
  // Generous: the first hit on this route in `next dev` triggers an on-demand
  // compile that can exceed a normal UI timeout.
  await pageA.waitForSelector(INPUT, { timeout: 90000 }).catch(async (e) => {
    console.log('DIAG A url=' + pageA.url() + ' body=' +
      (await pageA.evaluate(() => document.body.innerText)).replace(/\s+/g, ' ').slice(0, 200));
    throw e;
  });
  await pageB.waitForSelector(INPUT, { timeout: 90000 }).catch(async (e) => {
    console.log('DIAG B url=' + pageB.url() + ' body=' +
      (await pageB.evaluate(() => document.body.innerText)).replace(/\s+/g, ' ').slice(0, 200));
    throw e;
  });

  const subDeadline = Date.now() + 25000;
  while (Date.now() < subDeadline && !(wA.joined && wB.joined)) await sleep(400);
  log('Client A channel SUBSCRIBED', wA.joined ? 'PASS' : 'FAIL',
    wA.joined ? 'join ok for ' + CH : 'no ok frame (' + wA.frames + ' frames seen)');
  log('Consultant B channel SUBSCRIBED', wB.joined ? 'PASS' : 'FAIL',
    wB.joined ? 'join ok for ' + CH : 'no ok frame (' + wB.frames + ' frames seen)');

  if (!wA.joined || !wB.joined) {
    console.log('\nRealtime channel never reached SUBSCRIBED; delivery cannot be proven.');
    await browser.close();
    return finish();
  }
  // --- 5/6. A sends, B receives WITHOUT refresh --------------------------
  await send(pageA, A1);
  const gotA1 = await waitForOccurrence(pageB, A1, 20000, false);
  log('Client A -> Consultant B delivery (no refresh)', gotA1 > 0 ? 'PASS' : 'FAIL',
    gotA1 > 0 ? 'B rendered "' + A1 + '"' : 'B never rendered "' + A1 + '"');

  // --- 7/8. B replies, A receives WITHOUT refresh ------------------------
  await send(pageB, B1);
  const gotB1 = await waitForOccurrence(pageA, B1, 20000, false);
  log('Consultant B -> Client A delivery (no refresh)', gotB1 > 0 ? 'PASS' : 'FAIL',
    gotB1 > 0 ? 'A rendered "' + B1 + '"' : 'A never rendered "' + B1 + '"');

  // --- 9/10. burst of three, no duplicates ------------------------------
  for (const m of burst) { await send(pageA, m); }
  for (const m of burst) await waitForOccurrence(pageB, m, 20000, false);
  const counts = [];
  let allPresent = true;
  for (const m of burst) {
    const n = await occurrences(pageB, m);
    counts.push(m + '=' + n);
    if (n < 1) allPresent = false;
  }
  log('Burst of 3 delivered to B', allPresent ? 'PASS' : 'FAIL', counts.join(' '));
  log('No duplicate delivery to B', counts.every((c) => Number(c.split('=')[1]) === 1) ? 'PASS' : 'FAIL', counts.join(' '));

  // --- 11. persistence after refresh ------------------------------------
  await pageB.reload({ waitUntil: 'domcontentloaded' });
  await pageB.waitForSelector(INPUT, { timeout: 30000 });
  await sleep(3000);
  const persist = [];
  for (const t of [A1, B1, ...burst]) persist.push(await occurrences(pageB, t));
  log('Persists after refresh', persist.every((n) => n > 0) ? 'PASS' : 'FAIL', 'counts ' + persist.join(','));

  // --- 12/13. non-member isolation --------------------------------------
  const pageOut = await login(ctxOut, emails.outsider);
  const apiOut = await pageOut.evaluate((id) =>
    fetch('/api/messages/conversations/' + id + '/messages').then(async (r) => ({ s: r.status, b: (await r.text()).slice(0, 200) })),
    conversationId);
  log('Non-member API read denied', apiOut.s >= 400 ? 'PASS' : 'FAIL',
    'HTTP ' + apiOut.s + ' ' + apiOut.b.replace(/\s+/g, ' ').slice(0, 120));

  await pageOut.goto(origin + '/messages/' + conversationId, { waitUntil: 'domcontentloaded' }).catch(() => {});
  await sleep(3000);
  const leaked = await occurrences(pageOut, A1);
  const outBody = await pageOut.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').slice(0, 200));
  log('Non-member page shows no conversation content', leaked === 0 ? 'PASS' : 'FAIL',
    leaked === 0 ? 'no QA message content; page: ' + outBody : 'outsider saw ' + leaked + ' QA message(s)');

  // --- 6b. ownership: controls only on the caller's own messages ----------
  // Count the per-message action buttons and compare against how many messages
  // each side actually authored. The client authored RT-A1 + the 3-message
  // burst; the consultant authored RT-B1. So the client must see controls on
  // exactly its own count and none on the consultant's message.
  //
  // Before the fix `isOwnMessage` compared against roster[0], which put the
  // controls on the other participant's messages and removed them from the
  // caller's own.
  const ownership = await pageA.evaluate(() => {
    const counts = { edit: 0, trash: 0, report: 0 };
    for (const b of document.querySelectorAll('button')) {
      const cls = b.querySelector('svg')?.getAttribute('class') || '';
      if (/lucide-(pencil|edit)/.test(cls)) counts.edit++;
      else if (/lucide-trash/.test(cls)) counts.trash++;
      else if (/lucide-flag/.test(cls)) counts.report++;
    }
    return counts;
  }).catch(() => ({ edit: -1, trash: -1, report: -1 }));

  // Sent by the client in this run: A1 + M1..M3 = 4. Sent by the consultant: B1 = 1.
  const clientOwned = 4;
  const ownControlsCorrect = ownership.trash === clientOwned && ownership.edit === clientOwned;
  log('Author sees controls on exactly their own messages', ownControlsCorrect ? 'PASS' : 'FAIL',
    'client sees edit=' + ownership.edit + ' delete=' + ownership.trash +
    ' (expected ' + clientOwned + '/' + clientOwned + ' for the ' + clientOwned + ' it authored)');

  // --- 6c. the non-author's own view -------------------------------------
  const consultantOwn = await pageB.evaluate(() => {
    let trash = 0;
    for (const b of document.querySelectorAll('button')) {
      const cls = b.querySelector('svg')?.getAttribute('class') || '';
      if (/lucide-trash/.test(cls)) trash++;
    }
    return trash;
  }).catch(() => -1);
  log('Non-author sees no controls on the other side messages', consultantOwn === 1 ? 'PASS' : 'FAIL',
    'consultant sees delete=' + consultantOwn + ' (expected 1, its own only)');

  // --- 10b. server refuses a cross-user edit even when the UI is bypassed --
  const crossEdit = await pageA.evaluate(async (id) => {
    const g = await fetch('/api/messages/conversations/' + id + '/messages?page=1&limit=50');
    const j = await g.json().catch(() => null);
    const list = j?.data || [];
    const foreign = list.find((m) => m.sender_id !== m.__self);
    const target = list.find((m) => m.sender_id && m.content && String(m.content).startsWith('RT-B1-'));
    if (!target) return { attempted: false };
    const r = await fetch('/api/messages/messages/' + target.id, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'edit', newContent: 'TAMPERED-BY-NON-AUTHOR' }),
    });
    return { attempted: true, status: r.status, foreign: !!foreign };
  }, conversationId);
  log('Server refuses cross-user edit (UI bypassed)', crossEdit.attempted && crossEdit.status >= 400 ? 'PASS' : 'FAIL',
    crossEdit.attempted ? 'POST edit on another user message -> HTTP ' + crossEdit.status : 'no foreign message found to test');

  // --- 14. HTTP messaging still functional -------------------------------
  const httpMsg = 'RT-HTTP-' + stamp;
  await send(pageA, httpMsg);
  await sleep(1500);
  await pageB.reload({ waitUntil: 'domcontentloaded' });
  await pageB.waitForSelector(INPUT, { timeout: 30000 });
  await sleep(3000);
  const httpSeen = await occurrences(pageB, httpMsg);
  log('HTTP send + reload persistence', httpSeen > 0 ? 'PASS' : 'FAIL',
    httpSeen > 0 ? 'present after reload' : 'missing after reload');

  // --- 15. edit / delete at the API boundary ----------------------------
  const edit = await pageA.evaluate(async (id) => {
    const r = await fetch('/api/messages/conversations/' + id + '/messages');
    const j = await r.json().catch(() => null);
    const list = j?.messages || j?.data || [];
    if (!list.length) return { ok: false, why: 'no messages returned for edit probe' };
    const target = list[list.length - 1];
    const e = await fetch('/api/messages/messages/' + target.id, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'edit', newContent: 'RT-EDITED-' + Date.now().toString(36) }),
    });
    return { ok: e.ok, status: e.status };
  }, conversationId);
  log('Message edit (own message)', edit.ok ? 'PASS' : 'FAIL', 'HTTP ' + edit.status + (edit.why ? ' ' + edit.why : ''));

  await browser.close();
  finish();
})().catch((e) => { console.log('HARNESS ERROR ' + e.message); finish(); });