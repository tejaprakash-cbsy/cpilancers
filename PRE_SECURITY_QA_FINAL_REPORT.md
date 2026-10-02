# Pre-Security QA — Final Report

Project: `sap-integration-marketplace` (CPI Lancers)
Report date: 2026-10-02
HEAD at time of writing: `78e81e4` (plus this session's uncommitted working-tree changes, listed in §14)

Status vocabulary: `PASS` / `FAIL` / `NOT TESTED` / `NOT APPLICABLE`.
No "everything works" claim appears anywhere in this report.

---

## 1. Completed work in this session

1. Established the true starting state. The previous session's work (forum,
   migrations `00016`/`00017`, four QA reports) existed but was **entirely
   uncommitted** and would not have survived or been reviewed as-is.
2. Repaired the lint/type gates broken by that uncommitted work (1 error,
   3 warnings) without weakening any rule.
3. Removed a **hardcoded Supabase API key** committed in
   `scripts/realtime-e2e-test.mjs`; credentials are now environment-only.
4. Found and fixed a **real messaging defect** (§3).
5. Built a browser end-to-end Realtime harness driving two independent
   authenticated contexts, and proved with evidence that Realtime delivery does
   **not** work.
6. Ran a full route sweep — anonymous, client and consultant across every
   implemented route at three viewports: **45/45 PASS**.
7. Removed all QA data and verified **residue 0**.
8. Re-ran all four engineering gates at the current working tree.

---

## 2. Current commit / HEAD

```text
HEAD = 78e81e4  docs(qa): update QA report to reflect the two fixed defects
```

Tracked files modified this session (§14) were **not** committed by this session;
committing them is left to the owner.

---

## 3. Defect found and fixed this session

### Messaging: participants could only ever read their own messages — **FIXED**

`src/services/messaging.service.ts`, `MessagingService.getMessages()` selected:

```ts
sender:users!inner(id, email, profiles(...))
```

`public.users` is protected by `users_select_self`
(`FOR SELECT USING (id = auth.uid())`), so a reader can only ever see their own
row. `!inner` makes that embed an **INNER JOIN**, which silently **dropped every
message sent by somebody else**.

Observed before the fix (both users are legitimate members of the same
conversation):

```text
CLIENT      sees: RT-A1, RT-M1, RT-M2, RT-M3, RT-EDITED, VIS-A   (own only)
CONSULTANT  sees: RT-B1                                          (own only)
```

`messages_select_member` correctly permits a member to read the whole
conversation; the inner join silently overrode it.

**Fix:** use a LEFT JOIN (`sender:users(...)`). `chat-view.tsx` reads only
`message.sender_id`, never `message.sender`, so nothing downstream regresses.

**Regression test added** to `src/tests/conversation-authorization.test.ts`:
*"embeds the sender as a LEFT JOIN so other members messages are not dropped"*.
It asserts `sender:users(` is present and `sender:users!inner(` absent, so the
join cannot be silently "optimised" back. An explanatory comment was added at the
call site.

**After the fix:** `Persists after refresh` and `HTTP send + reload persistence`
both moved from FAIL to PASS, confirming the read path is corrected.

Low-risk, well understood, and squarely inside messaging QA, so it was fixed
rather than only reported. **RLS was not weakened.**

---

## 4. Engineering gates (final, sequential, current working tree)

```text
npx tsc --noEmit                PASS  exit 0
npx eslint . --max-warnings=0   PASS  exit 0
npx vitest run                  PASS  29 files, 770/770 tests passed
npm run build                   PASS  "Compiled successfully" (next build v16.3.5)
```

Test count moved 769 → 770 because one regression test was **added**. No test was
modified, skipped, xfailed or weakened.

---

## 5. Supabase verification

| Item | Result |
| --- | --- |
| Project ref `uzjvaijepqfiogwncdjn` | PASS (matches `supabase/.temp/project-ref`) |
| Environment | Development/test project, QA target only |
| Data-plane connectivity | PASS |
| Migrations `00001`–`00015` | PASS (pre-existing) |
| Migration `00016_forum.sql` applied remotely | **PASS** — 5/5 tables present, 9 categories seeded, REST probe HTTP 200 |
| Migration `00017_realtime_messages.sql` applied remotely | **NOT VERIFIED** |
| QA fixture testing | PASS |
| RLS / authorization boundary | PASS — non-member read HTTP 401 `UNAUTHORIZED` |
| Teardown / residue | **PASS — residue 0** |
| Secrets exposed | PASS — none printed, logged or committed |

No credential or secret value appears in any file written this session.

---

## 6. Migration verification

**`00016_forum.sql` — applied remotely: PASS.** Verified by querying each table
over PostgREST, not by inspecting the file. Both required corrections are present:
`update_updated_at_column()` is used for the trigger functions, and privileged
policies key off `role = 'admin'`. **No moderator role was added.**

---

## 7. Realtime verification

Requirement: prove `Browser A → application → Supabase → Realtime → Browser B`.

Harness: `scripts/rt-browser-e2e.mjs` drives **two independent authenticated
browser contexts** (plus a third for a non-member), logs in through the real
`/login` form, opens the same conversation, and reads the **actual realtime
websocket frames** each browser opens. A direct Supabase script was explicitly
not treated as sufficient.

| # | Test | Result |
| --- | --- | --- |
| 1 | Client A authenticated (`/api/auth/me`) | PASS (HTTP 200) |
| 2 | Consultant B authenticated (`/api/auth/me`) | PASS (HTTP 200) |
| 3 | Client A channel SUBSCRIBED | PASS (`phx_join` reply `"status":"ok"`) |
| 4 | Consultant B channel SUBSCRIBED | PASS (`phx_join` reply `"status":"ok"`) |
| 5 | A sends → B receives **without refresh** | **FAIL** |
| 6 | B replies → A receives **without refresh** | **FAIL** |
| 7 | Burst of 3 delivered to B | **FAIL** |
| 8 | No duplicate delivery | **FAIL** (0 of 3 arrived) |
| 9 | Persists after refresh | PASS (counts 1,1,1,1,1) |
| 10 | Non-member API read denied | PASS (HTTP 401) |
| 11 | Non-member page shows no content | PASS |
| 12 | HTTP send + reload persistence | PASS |
| 13 | Message edit (own message) | PASS (HTTP 200) |

Final tally: **9 PASS / 4 FAIL**. Verdict: `DELIVERY_VERDICT=NOT VERIFIED`.
Reproduced across three independent runs.

### Why the channel can be SUBSCRIBED and still deliver nothing

```text
SENT  ["6","6","realtime:messages:conversation_id=eq.<id>","phx_join",
       {"config":{...,"postgres_changes":[{"event":"INSERT", ...}]}}]
RECV  ["6","6","...","phx_reply",{"status":"ok","response":{"postgres_changes":[
       {"id":23458295,"event":"INSERT","filter":"conversation_id=eq.<id>","schema":"public"}]}}]
RECV  [null,...,"system",{"message":"Subscribed to PostgreSQL","status":"ok"}]
```

…then **no `postgres_changes` INSERT frame is ever received**, even though sending
returns HTTP 201 and the row is persisted.

**`SUBSCRIBED` is not proof of publication membership.** A differential probe
showed `jobs` and `forum_posts` — tables with no reason to be in the publication —
*also* report `SUBSCRIBED`. Supabase accepts the subscription regardless and only
delivers when the table is genuinely in `supabase_realtime`.

Leading explanation, stated as a **hypothesis and not a verified fact**: migration
`00017` was written but never applied remotely, so `messages` is absent from the
publication. Confirming requires
`SELECT * FROM pg_publication_tables WHERE pubname = 'supabase_realtime'` in the
Supabase SQL editor, which this environment cannot do.

### Distinction, stated explicitly

```text
Realtime database configuration = NOT VERIFIED
End-to-end browser delivery      = NOT VERIFIED  (FAIL — 4 delivery assertions failed)
```

**Required remediation (needs DB access this session does not have):** run
`00017_realtime_messages.sql` in the Supabase SQL editor, confirm
`pg_publication_tables` lists `messages`, then re-run
`node scripts/rt-browser-e2e.mjs`. **No schema change was made this session.**

Two harness artefacts were identified as **not** product defects: a burst message
dropped while the send button was still disabled (fixed by waiting for the
composer to clear), and cold `next dev` compiles exceeding selector timeouts
(fixed by raising timeouts).
**`00017_realtime_messages.sql` — applied remotely: NOT VERIFIED.**
`pg_publication_tables` is a Postgres catalog not exposed via PostgREST; the
project has no SQL-executing RPC (`exec_sql` → HTTP 404), no management access
---

## 8. Browser / route QA

Automated sweep (`scripts/route-sweep.mjs`): **45 PASS / 0 FAIL / 0 NOT TESTED**.

| Area | Routes | Result |
| --- | --- | --- |
| Public | `/`, `/jobs`, `/consultants` | PASS at desktop, mobile, tablet |
| Protected (signed out) | `/dashboard/client`, `/jobs/create`, `/profile`, `/messages`, `/proposals`, `/forum/new` | PASS — all guarded, redirect to `/login` |
| Invalid IDs | `/jobs/<zero-uuid>`, `/consultants/<zero-uuid>`, `/jobs/not-a-uuid`, `/forum/<zero-uuid>` | PASS — no 500 |
| Client | `/dashboard/client`, `/profile`, `/profile/edit`, `/jobs/create`, `/messages`, `/messages/[id]` | PASS |
| Consultant | `/dashboard/consultant`, `/profile`, `/profile/edit`, `/proposals`, `/messages` | PASS |
| Forum | `/forum` (public), `/forum/new` (guarded) | PASS |
| Responsive | `/messages` at mobile + tablet, both roles | PASS |

### Responsive QA
Mobile 390×844, tablet 820×1180, desktop 1440×900. All public and messaging routes
rendered at every viewport with no overflow or error. **PASS.**

### Authentication QA

| Item | Result |
| --- | --- |
| Client login → role redirect | PASS (`/dashboard/client`) |
| Consultant login → role redirect | PASS (`/dashboard/consultant`) |
| `/api/auth/me` for both roles | PASS (HTTP 200) |
| Logout destroys session | PASS (200 → 401) |
| Invalid credentials | NOT TESTED this session (covered by earlier suite) |
| Forgot password | NOT TESTED this session |
| Session persistence across reload | PASS |

### Authorization QA

| Item | Result |
| --- | --- |
| Non-member API read of a conversation | PASS — HTTP 401 `UNAUTHORIZED` |
| Non-member page render | PASS — no conversation content, explicit refusal |
| `/proposals` accessed by a client | PASS — refused ("Only consultants can access this endpoint") |
| Consultant rendering `/jobs/create` | **FAIL** — renders the real create-job form |
| Consultant rendering `/dashboard/client` | **FAIL** — renders the client dashboard shell, labelled "Client account" |

The last two are **UI guard gaps, not proven data breaches**: no cross-role data
leak was observed and the APIs apply their own role checks (`/proposals`
demonstrably refused a client). Recorded as findings for the security audit.

---

## 9. Functional QA by area

| Area | Result |
| --- | --- |
| Messaging | PASS for send/read/persist/edit and non-member isolation; **FAIL** for live delivery |
| Jobs | PASS for list, detail, invalid IDs, create-page render; NOT TESTED for full CRUD |
| Proposals | PASS for route access and role refusal; NOT TESTED for submission flow |
| Profile | PASS for `/profile` and `/profile/edit` for both roles |
| Forum | PASS for `/forum` render and `/forum/new` guard; **NOT TESTED** for discussion/reply creation, categories, permissions, admin functions, reports |
| Payments / reviews / notifications | NOT TESTED this session (unit suites only) |
---

## 10. Remaining issues

1. **Realtime delivery is broken (FAIL).** Four delivery assertions fail
   consistently. Blocked on confirming/applying migration `00017`, which needs DB
   access unavailable here.
2. **Consultant can render client routes (FAIL).** `/jobs/create` and
   `/dashboard/client` have no UI role guard.
3. **`chat-view.tsx` own-message detection is wrong (FAIL).** It compares
   `message.sender_id` to `conversation.conversation_members[0]?.users.id`
   instead of the current user's id. Consequences: alignment is wrong and
   edit/delete controls can appear on another member's messages. **Not fixed** —
   it is a behavioural change with security-relevant implications and belongs in
   the audit, not a blind QA fix.
4. **Forum CRUD untested (NOT TESTED).**

## 11. NOT TESTED items (explicit)

- Realtime edit/delete event propagation
- Client job create/edit/publish lifecycle end-to-end
- Consultant proposal submission end-to-end
- Proposal review, status transitions, messaging from `/jobs/[id]/proposals`
- Forum discussion creation, replies, categories, voting, reporting, admin-only functions
- Payments, escrow, reviews/reputation and notification flows in the browser
- Pagination, filtering, search and sorting interactions in the browser
- Forgot-password and registration flows in the browser this session
- Accessibility and screen-reader behaviour
- Load/performance testing
token, no `psql` and no Supabase CLI. The migration was therefore neither executed
nor assumed. See §7 for the behavioural evidence.
## 12. Cleanup / residue verification

```text
QA users rows        : 0
QA profiles rows     : 0
QA auth users        : 0
QA conversations     : 0
total conversations  : 0
messages in QA convs : 0
RESIDUE users=0 authUsers=0 qaConversations=0
```

**PASS.** Cleanup is scoped: a conversation is deleted only when **every** member
is a QA user, so production data cannot be touched. No production data was
modified at any point.

## 13. Files changed / added this session

Modified by **this session** (tracked, uncommitted):
- `src/services/messaging.service.ts` — LEFT JOIN fix + explanatory comment
- `src/tests/conversation-authorization.test.ts` — regression test added
- `src/types/database.ts` — `ForumDiscussion.author` typed field (removed an `as any`)
- `src/app/forum/page.tsx` — removed `as any` cast
- `src/app/forum/[id]/page.tsx`, `src/app/forum/[id]/ReplyForm.tsx` — unused `err` in `catch`

Modified (credentials only, no logic change):
- `scripts/realtime-e2e-test.mjs` — hardcoded API key removed, environment loading
- `scripts/realtime-qa-setup.mjs` — the **same key was hardcoded a second time**
  here and was also removed

Two tracked files were already modified before this session and are **not** my
edits: `src/app/page.tsx` and `src/components/layout/header.tsx` (from the
previous session's forum/header work).

Added:
- `scripts/rt-setup.mjs`, `scripts/rt-cleanup.mjs`, `scripts/rt-browser-e2e.mjs`, `scripts/route-sweep.mjs`, `scripts/verify-migrations.mjs` — QA tooling
- `PRE_SECURITY_COMPLETION_REPORT.md`, `PRE_SECURITY_QA_FINAL_REPORT.md`

`playwright-core` was installed with `--no-save`: `package.json` and the lockfile
are **unchanged** (verified with `git diff --stat`).

Post-change scan of `scripts/` for JWT-shaped literals: **clean**.

Pre-existing untracked files from earlier sessions remain untracked and untouched
(`FORUM_IMPLEMENTATION.md`, `QA_FINAL_REPORT.md`, `REALTIME_FIX_REPORT.md`,
`SESSION_PERSISTENCE_FINDINGS.md`, `public/icon-*.png`, `src/app/forum/`,
`src/app/api/forum/`, `src/services/forum.service.ts`, `src/tests/forum.test.ts`,
`supabase/migrations/00016_forum.sql`, `00017_realtime_messages.sql`,
`test-*.{ts,mjs}`, `sweep-*.txt|json`, `.env.example`).

---

## 14. Final recommendation

**The project is ready to enter the dedicated security-audit phase**, with three
items handed over explicitly and one caveat.

Ready because: all four engineering gates pass at the current working tree with
770/770 tests; 45/45 route-sweep checks pass; the messaging read-scoping defect
browser QA exposed is fixed and regression-covered; authorization holds at the
API boundary (non-member read denied 401); QA residue is 0 and no secrets are
exposed.

Handed to the audit:
1. **Realtime is nonfunctional** — the largest functional gap. Needs `00017`
   applied remotely (requires DB access) and re-verification.
2. **Consultant can render `/jobs/create` and `/dashboard/client`** — route-level
   authorization is the audit's core concern given the service-role architecture.
3. **`chat-view.tsx` own-message detection is wrong** — drives whether edit/delete
   controls are shown to the wrong user.
4. **The previous session's entire contribution is uncommitted**, including both
   migrations and the forum. It should be committed and reviewed before the audit
   begins, otherwise the audit baseline is ambiguous.

Suggested next step: commit this session's work plus the uncommitted forum and
migration files, then run the audit with the service-role authorization model as
its primary focus.
| Pagination, filters, search, sorting | NOT TESTED this session in the browser |
| Fabricated-data prevention | PASS — none observed on `/consultants` |
| Tracked environment files | PASS — no `.env*` tracked; `.env.example` placeholders only |

---
