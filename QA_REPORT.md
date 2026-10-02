# QA Report — CPI Lancers

**Phase:** Complete → Test → Verify → Stabilize
**Date:** 2026-10-01
**Scope:** engineering gates, Supabase runtime QA, browser QA, responsive QA
**NOT in scope:** dedicated security audit, performance, email integration, production domain, UI redesign

> **Status update — two defects have since been FIXED.**
> The browser-QA findings §6.1 (messaging HTTP 500s) and §6.2 (`/api/jobs` 400 on
> unset filters) were fixed in commit `d5f95b5` and re-verified: 30/30 targeted
> browser regression checks pass. §6.1 and §6.2 below are retained as the record
> of what was found, with resolution noted. The Realtime limitation in §7 stands.

---

## 1. Engineering gates

Run sequentially. No test was modified, weakened or skipped to reach these results.

### Current state (post-fix, at `d5f95b5`)

| # | Command | Result | Detail |
|---|---|---|---|
| 1 | `npx tsc --noEmit` | **PASS** | exit 0, 0 errors |
| 2 | `npx eslint . --max-warnings=0` | **PASS** | exit 0, 0 errors, 0 warnings |
| 3 | `npx vitest run` | **PASS** | `Test Files 28 passed (28)` / `Tests 766 passed (766)` |
| 4 | `npm run build` | **PASS** | `✓ Compiled successfully` |

### At the time of browser QA (pre-fix, at `b31eb29`)

| # | Command | Result | Detail |
|---|---|---|---|
| 1 | `npx tsc --noEmit` | **PASS** | exit 0, 0 errors |
| 2 | `npx eslint . --max-warnings=0` | **PASS** | exit 0, 0 errors, 0 warnings |
| 3 | `npx vitest run` | **PASS** | `Tests 752 passed (752)` |
| 4 | `npm run build` | **PASS** | `✓ Compiled successfully in 2.4s` |
| 5 | `git status` | **UNCHANGED** | 8 pre-existing untracked files, none added by QA |

Test count: 675 → 752 (browser QA) → 766 (defect fixes, +14 regression tests).
Handover baseline was 672/675.

---

## 2. Supabase runtime QA (Stage 2)

**44/45 checks passed. QA residue: 0 (verified).**

| Area | Result |
|---|---|
| Authentication | PASS 9/9 |
| Profiles | PASS 4/4 |
| RLS / cross-user writes | PASS 5/5 |
| Jobs | PASS 6/6 |
| Proposals | PASS 7/7 |
| Conversations | PASS 4/4 |
| Messages | PASS 10/10 |
| Unauthenticated access | PASS 6/6 |
| **Realtime** | **FAIL 1/3 — known incomplete; not fixed this phase** |

**Realtime:** channel subscribes (`SUBSCRIBED`) but no INSERT is delivered. No migration adds `messages` to the `supabase_realtime` publication. Fixing it requires a schema migration — out of scope.

**Key finding for the audit:** this app does **not** use PostgREST as its authorization layer. All browser reads/writes go through `/api/*` handlers using the **service-role client** with application-level ownership checks. `jobs`, `proposals`, `client_profiles`, `consultant_profiles` have SELECT policies only — no INSERT or UPDATE policies. RLS is a backstop, so a single missed ownership check in a service layer is a full bypass. Six of my initial "failures" were my own wrong expectations, corrected against the documented policies; no policy was changed.

---

## 3. Browser QA (Chromium via Playwright, installed outside the repo)

### Public pages — PASS (10/10)
`/` · `/jobs` · `/consultants` · `/jobs/[id]` · `/consultants/[id]` · `/login` · `/register` — all 200, non-blank. Private draft job **not** exposed to anonymous visitors. Nonexistent job ID shows an error state, not a crash.

### Authentication — PASS (11/11)
Invalid credentials rejected · client → `/dashboard/client` · consultant → `/dashboard/consultant` · session survives full reload · `/api/auth/me` returns correct identity and role · all five protected routes redirect to `/login` with `?next=` preserved.

### Cross-user authorization — PASS (6/6)
| Action | Result |
|---|---|
| Client A → Client B private job | **HTTP 404** |
| Client A → non-member conversation | **HTTP 401** |
| Client A → non-member messages | **HTTP 401** |
| Consultant → edit client-owned job | **HTTP 403** |
| Consultant → non-member conversation | **HTTP 401** |
| Non-member conversation in browser | content **not rendered** |

### Messaging — **PASS (was FAIL)** — see §6.1
Post-fix re-test (30/30): conversation list loads · open by id · messages load with a **resolved sender** · send 201 · edit 200. Authorization denials (non-member read 401, non-member send 401) remain intact.

### Jobs filtering — **PASS (was FAIL)** — see §6.2
Post-fix re-test: `/api/jobs` with no filters 200 · search applies · combined filters apply · private draft excluded · **no request URL contained `undefined`** · `/jobs` renders and lists the open job.

### Consultant full workflow — still **PARTIAL** (proposal submission not exercised)

---

## 4. Responsive QA — PASS (15/15)

Zero horizontal overflow on every page at all three breakpoints.

| Viewport | Home | Jobs | Consultants | Job detail | Login |
|---|---|---|---|---|---|
| Desktop 1440×900 | PASS | PASS | PASS | PASS | PASS |
| Tablet 768×1024 | PASS | PASS | PASS | PASS | PASS |
| Mobile 390×844 | PASS | PASS | PASS | PASS | PASS |

No UI was modified. Only overflow was measured — visual polish, contrast, focus order and tap targets are not assessable from an automated check.

---

## 5. Authorization — actual observed behaviour
---

## 6. Errors discovered

### 6.1 — CRITICAL (functional): messaging was entirely non-functional — **RESOLVED in `d5f95b5`**

**Severity:** critical functional impact. This is not a security-severity judgement.
**Routes:** `GET /api/messages/conversations`, `GET /api/messages/conversations/[id]`, `POST /api/messages/conversations/[id]/messages`
**Reproduction:** sign in, open `/messages`, open any conversation, send a message.
**Expected:** conversation list renders, messages render, sending succeeds.
**Actual:** every call returns **HTTP 500**. The list is empty, no message text renders, sending fails.

**Evidence** (dev server log):
```
[DB Error - Get User Conversations]: {
  code: 'PGRST100',
  message: '"failed to parse order (conversations.last_message_at.desc)"'
}
[DB Error - Get Conversation]: { PGRST100 ... }
[DB Error - Get Conversation Members]: { PGRST100 ... }
```

**Root cause (as first reported):** `MessagingService.getUserConversations` (`src/services/messaging.service.ts`) called
`.order('conversations.last_message_at', { foreignTable: 'conversations', ascending: false })`, producing the malformed order expression.

**Resolution — probing PostgREST directly revealed THREE distinct faults, not one:**

1. **Ordering.** `foreignTable` already prefixes the embedded table, so the column was qualified twice. Fixed to `.order('last_message_at', { foreignTable: 'conversations', ascending: false })`.
2. **Invalid embed syntax, in three places.** `profiles:first_name` reads as *column `first_name` on table `profiles`*, but `profiles` is a **related** table; PostgREST answered `42703: column users_2.first_name does not exist`. The same broken form was in `getConversationById`, `getMessages` **and the `sendMessage` member query** — the third is why sending failed independently of the list. Fixed to `profiles(first_name, ...)`.
3. **A type consequence of the above.** Because the embed never round-tripped, TypeScript inferred `any` and the declared types hid the real shape: PostgREST returns a to-one embed as a single-element **array**. Added `JoinedProfilesEmbed` and taught `readUserRow` to normalise the nested embed as it already did for `users`, so consumers still read an object.

**Verification after fix (browser, 30/30 checks):** conversations 200 · list includes the conversation · open by id 200 · messages load with a resolved sender · send 201 · edit 200 · non-member read 401 · non-member send 401.

**Fixed** in `d5f95b5` (`src/services/messaging.service.ts`) and covered by 6 new regression tests.

### 6.2 — MEDIUM: job filters sent literal `undefined` — **RESOLVED in `d5f95b5`**

**Route:** `GET /api/jobs`
**Evidence:** `GET /api/jobs?search=undefined&sapProducts=undefined&sourceSystems=undefined&...` → **HTTP 400**
**Expected:** omitted or empty parameters. **Actual:** `undefined` serialised into the query string.
**Cause:** `ClientJobService.getJobs` runs `new URLSearchParams(options)` over an object whose unset filters are `undefined`; origin is `buildJobsQuery()` in `src/app/jobs/page.tsx`.
**Impact:** the endpoint 400s when filters are unset. The homepage degrades to an empty state, so this was not user-visible there, but the same helper backed both dashboards.

**Resolution:** added `buildQueryString()` in `client-api.service.ts`, which omits `undefined`, `null` and empty arrays while preserving every real value — including meaningful falsy ones (`budgetMin=0`, `search=''`). The **same defect was found and fixed in the two proposal wrappers** (`getProposalsForJob`, `getProposalsByConsultant`), which had not been reported by browser QA. API validation was **not** relaxed to accept `"undefined"`.

**Verification after fix (browser):** `/api/jobs` with no filters 200 · search applies · combined filters apply · private draft excluded · **no request contained `undefined`** · `/jobs` renders and lists the open job.

### Non-defects investigated and cleared
- `[JobService.getJobs] Dynamic server usage` on `/` at build — expected fallback to dynamic rendering (uses `cookies`).
- `401 /api/auth/me` on public pages — the expected signed-out probe from the login page.
- `404 /api/jobs/<uuid>` — the intentional nonexistent-ID test.
- Vitest stderr (`fails closed`, `sign-out failed`, payout failure) — deliberate negative-path fixtures, not failures.

---

## 7. Known limitations

1. **Realtime messaging does not deliver — STILL OPEN.** `messages` is not in the `supabase_realtime` publication; the channel subscribes then reports `CHANNEL_ERROR`/`TIMED_OUT`. The UI degrades to HTTP retrieval, which **now works** since §6.1 was fixed — so messaging is usable, but live delivery is still unavailable. Fixing it requires a schema migration, deliberately not attempted in this phase.
2. Browser QA covered Chromium only. No Firefox, WebKit, or real-device testing.
3. Responsive testing measured overflow only — not contrast, focus order, tap targets, or visual regression against Figma.

---

## 8. Fabricated-data audit — PASS

Every rendered public page was scanned for invented ratings, review counts, employers, schools/degrees, availability, verification badges, and placeholder marketplace statistics. **None found** on home, jobs, or the consultant profile.

The seven fabrications previously removed from the consultant profile (`20–30 hours/week`, `Available from Oct 5`, `Identity verified`, three invented employers with fixed 5.0/5.0/4.8 ratings, `4.9`/`128 reviews` fallbacks, `BFA / Parsons / 2015`, and an always-"Available" badge) are confirmed gone in the browser. Empty states render honestly.

---

## 9. QA cleanup

**QA residue: 0 (VERIFIED).** All five temporary QA identities, their profiles, both companies, four role profiles, two jobs, one proposal, two conversations, memberships and messages were deleted. Verification re-queried all ten tables plus auth users: **zero remaining**. No pre-existing record was touched.

---

## 10. NOT TESTED

- **Consultant proposal submission via the UI** — not exercised. (Messaging send/edit *were* verified after the fix.)
- **Client job/proposal creation and editing via the UI** — not completed.
- **Message deletion** — not exercised in the browser (the action exists; only send/edit were verified).
- Payments, contracts, milestones, reviews, notifications, admin surface.
- File uploads, rate limiting, input-validation edge cases beyond login.
- Refresh-token rotation / server-side session revocation.
- Performance, load, accessibility audit, visual regression against Figma.
- Non-Chromium browsers and real mobile devices.

---

## 11. Conclusion

All four engineering gates pass at HEAD `d5f95b5` (766 tests). Supabase runtime QA is 44/45 with verified-zero residue. Authorization behaves correctly in every cross-user case exercised. Responsive layout shows no overflow at any breakpoint, and no fabricated data renders.

**Both browser-QA defects have been fixed and re-verified.** Messaging now works end-to-end over HTTP (§6.1), and job filtering no longer sends literal `undefined` (§6.2). The post-fix browser regression passes **30/30 checks**. Fixing §6.1 required probing PostgREST directly, which surfaced two further faults beyond the reported one — including a broken embed in the *send* path that would have survived a narrower fix.

**One functional gap remains: realtime messaging does not deliver** (§7). It needs a schema migration and is the single most important outstanding item.

**This report makes no claim that the application is secure or production-ready.** It is completion/browser QA only. The architectural finding in §2 — authorization living in application code over a service-role client, with RLS as a passive backstop — is exactly what the dedicated security audit exists to examine, and it has not been examined here.

**Next phase: the dedicated LANCRERS SECURITY AUDIT.** Not started.

Authorization is enforced in **application code** (service-layer ownership checks), not by RLS, because API routes use the service-role client. Observed HTTP results are consistent and correct for every case exercised. Non-members cannot read conversations or messages (401); unauthorized job edits refused (403); private jobs invisible to other users (404).