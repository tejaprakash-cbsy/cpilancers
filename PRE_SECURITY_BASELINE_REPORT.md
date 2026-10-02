# Pre-Security Baseline Report

Project: `sap-integration-marketplace` (CPI Lancers)
Report date: 2026-10-03
**Final commit:** `2ec7606b8aa53b50dc4fc2f231bca3d38ff4d604` (`2ec7606`)
Parent: `78e81e4`

Status vocabulary: `PASS` / `FAIL` / `NOT TESTED` / `NOT APPLICABLE`.

> **The dedicated security audit has NOT started.** This commit is the
> starting point for it.

---

## 1. Correction to the stated premise

The task brief listed `00017_realtime_messages.sql` as **applied**. That is not
supported by the evidence and is corrected here:

- The repository's own `REALTIME_FIX_REPORT.md` states the migration **could not
  be applied** ("Pushing the migration via `npx supabase db push` failed due to
  missing `postgres` role password").
- `pg_publication_tables` cannot be queried over PostgREST; the project has no
  SQL-executing RPC, no management token, no `psql` and no Supabase CLI, so
  membership cannot be confirmed from here.
- End-to-end browser delivery **fails**, the behaviour expected if the table is
  still absent from the publication.

Recorded status: **`00017` applied remotely = NOT VERIFIED.**

---

## 2. Messaging ownership finding and resolution

### Finding (genuine — fixed)

`src/components/messaging/chat-view.tsx` decided message ownership with:

```ts
const isOwnMessage = message.sender_id === conversation.conversation_members[0]?.users.id;
```

`conversation_members[0]` is a **roster position**, not the signed-in user. Two
distinct faults follow:

1. every message from the first-listed member rendered as the caller's own —
   including when that member was the *other* participant;
2. none of the caller's own messages rendered as their own whenever the caller
   was not first in the roster.

Because that flag gates the **edit, delete and report** controls, the controls
were offered on another participant's messages. The identical roster-position
guess also drove the conversation header's "other participants" filter.

### How the current user is identified

`loadConversation()` already called `ClientAuthService.getCurrentUser()`
(`GET /api/auth/me` → `User`, whose `id` is `auth.uid()`) but discarded the
result. The fix retains it in `currentUserId`. No new endpoint, no new fetch, no
contract change.

### Authorization trace — UI → API/service → database/RLS

| Layer | Finding |
| --- | --- |
| UI (`chat-view.tsx`) | **Defective** — wrong identity, controls appeared on another user's message |
| API route (`api/messages/messages/[messageId]/route.ts`) | Correct — requires an authenticated caller, dispatches `read`/`edit`/`delete`/`report`, validates payload |
| Service (`MessagingService.editMessage`/`deleteMessage`) | **Correct** — `if (message.sender_id !== user.id) throw UnauthorizedError`, user from `supabase.auth.getUser()` |
| RLS (`messages_update_own`, `messages_delete_own`) | **Correct backstop** — `sender_id = auth.uid() AND public.is_conversation_member(conversation_id)` |

**Classification: UI-only.** Not an API authorization problem and not a
database/RLS problem. No policy was weakened; no RLS was changed.

### Browser proof (two independent contexts)

```text
[PASS] Author sees controls on exactly their own messages
       client sees edit=4 delete=4  (authored 4) -> exactly its own
[PASS] Non-author sees no controls on the other side's messages
       consultant sees delete=1       (authored 1) -> only its own
[PASS] Server refuses cross-user edit (UI bypassed)
       POST edit on another user's message -> HTTP 401
```

### Regression tests added (+8)

`src/tests/conversation-authorization.test.ts` — server-side ownership:

| Test | Covers |
| --- | --- |
| refuses to edit a message sent by another participant | requirement 2 |
| refuses to delete a message sent by another participant | requirement 3 |
| refuses edit/delete by an outsider who is not a member | requirement 4 |
| still permits the author to edit and delete their own message | requirement 5 |

`src/tests/stale-response-regression.test.ts` — UI ownership:

| Test | Covers |
| --- | --- |
| never infers ownership from the conversation member roster order | requirement 1 |
| compares the sender against the authenticated caller id | requirement 1 |
| excludes the signed-in user, not roster[0], from header participants | requirement 1 |
| shows no per-message actions while the caller identity is unresolved | requirement 1 |

No existing test was modified, skipped, deleted or weakened. Membership
restrictions remain covered by the pre-existing IDOR suite, which still passes.

---

## 3. Engineering gates at `2ec7606`

```text
npx tsc --noEmit                PASS  exit 0
npx eslint . --max-warnings=0   PASS  exit 0
npx vitest run                  PASS  29 files, 778/778 tests passed
---

## 4. Files included in the commit (27)

**Intentional application changes**
- `src/components/messaging/chat-view.tsx` — ownership fix (this phase)
- `src/services/messaging.service.ts` — LEFT JOIN fix (previous phase)
- `src/components/layout/header.tsx` — header auth display (previous phase)
- `src/app/page.tsx` — cosmetic homepage restyle (previous phase, see §13)
- `src/types/database.ts` — typed `ForumDiscussion.author`, replacing an `as any`

**Forum feature (previously uncommitted)**
- `src/app/forum/` (4 files), `src/app/api/forum/` (2 routes),
  `src/services/forum.service.ts`

**Database migrations**
- `supabase/migrations/00016_forum.sql`
- `supabase/migrations/00017_realtime_messages.sql`

**Tests**
- `src/tests/forum.test.ts`
- `src/tests/conversation-authorization.test.ts` (+5 ownership, +1 join)
- `src/tests/stale-response-regression.test.ts` (+4 ownership)

**Assets / config**
- `public/icon-192.png`, `public/icon-512.png` — referenced by `manifest.ts`
- `.env.example` — placeholders only; `.gitignore` already opt-ins it via
  `!.env.example` and commit `b31eb29` intended to track it, but it had never
  actually been added

**Documentation**
- `PRE_SECURITY_BASELINE_REPORT.md`, `PRE_SECURITY_COMPLETION_REPORT.md`,
  `PRE_SECURITY_QA_FINAL_REPORT.md`, `FORUM_IMPLEMENTATION.md`,
  `QA_FINAL_REPORT.md`, `REALTIME_FIX_REPORT.md`,
  `SESSION_PERSISTENCE_FINDINGS.md`

## 5. Files intentionally excluded

| Excluded | Reason |
| --- | --- |
| `scripts/` (7 files) | Temporary QA/debug tooling; also reads `.env.local` |
| `test-admin.ts`, `test-e2e.mjs`, `test-register.mjs`, `test-session.mjs` | Temporary debug scripts. `test-admin.ts` **prints `SUPABASE_SECRET_KEY` and `SUPABASE_SERVICE_ROLE_KEY` to stdout** and must never be committed |
| `sweep-build.txt`, `sweep-lint.json`, `sweep-lint.txt`, `sweep-test.txt`, `sweep-tsc.txt` | Generated build/lint/test output artifacts |
| `.env.local` | Never tracked; git-ignored |

No pre-existing untracked file was **deleted**. The excluded files were left on
disk untouched, except `dev.log`, which this session created and removed.

## 6. Pre-existing untracked files remaining

```text
?? scripts/  ?? sweep-build.txt  ?? sweep-lint.json  ?? sweep-lint.txt
?? sweep-test.txt  ?? sweep-tsc.txt  ?? test-admin.ts  ?? test-e2e.mjs
?? test-register.mjs  ?? test-session.mjs
```

No tracked modifications remain. `git status` shows only these untracked files.

---

## 7. Supabase migration status

| Migration | Status | Evidence |
| --- | --- | --- |
| `00001`–`00015` | PASS | Pre-existing |
| `00016_forum.sql` | **PASS — applied remotely** | 5/5 tables present (`forum_categories` 9 seeded, `forum_discussions`, `forum_posts`, `forum_votes`, `forum_reports`); REST probe HTTP 200 |
| `00017_realtime_messages.sql` | **NOT VERIFIED** | Catalog not queryable; repo's own report says it could not be applied; delivery fails |

`00016` uses `update_updated_at_column()` (not `trigger_set_timestamp()`) and keys
privileged policies off the existing `role = 'admin'`. **No `moderator` role was
introduced.**

## 8. Realtime status

```text
Realtime database configuration = NOT VERIFIED
End-to-end browser delivery      = NOT VERIFIED (FAIL)
```

Browser harness (`scripts/rt-browser-e2e.mjs`, two independent authenticated
contexts): **12 PASS / 4 FAIL.** Both browsers reach `SUBSCRIBED` and the server
returns `"Subscribed to PostgreSQL"`, but **no `postgres_changes` INSERT frame is
ever received**. Persists-after-refresh, HTTP send/reload, non-member denial
(401) and message edit all PASS; only live delivery fails.

`SUBSCRIBED` is not evidence of publication membership — `jobs` and `forum_posts`
also report `SUBSCRIBED`.

**No schema or configuration change was made this phase.** `00017` was not
modified and `ALTER PUBLICATION` was not executed.

## 9. QA residue

```text
RESIDUE users=0 authUsers=0 qaConversations=0
```

An earlier full census also reported `QA profiles rows: 0`, `QA conversations: 0`,
`messages in QA convs: 0`. **PASS.**

## 10. Secrets

- JWT-shaped literal scan across all staged content: **CLEAN**.
- `scripts/` contains **no** key literals — two hardcoded Supabase keys
  (duplicated across `realtime-e2e-test.mjs` and `realtime-qa-setup.mjs`) were
  removed in the previous phase and replaced with environment loading.
- Only `.env.example` is tracked; every value is a placeholder.
- `.env.local` is git-ignored and untracked.
- `test-admin.ts` prints secrets and remains deliberately uncommitted.

## 11. Known remaining limitations

1. **Realtime delivery is broken (FAIL).** Blocked on DB access to apply `00017`.
2. **Consultant can render `/jobs/create` and `/dashboard/client` (FAIL).** UI
   guard gap only; no cross-role data leak observed, and `/proposals` correctly
   refuses a client ("Only consultants can access this endpoint").
3. **`00017` publication membership unconfirmed (NOT VERIFIED).**
4. **Forum CRUD untested (NOT TESTED).**

## 12. Exact NOT TESTED items

- Realtime edit/delete event propagation
- Client job create/edit/publish lifecycle end-to-end
- Consultant proposal submission end-to-end
- Proposal review, status transitions, messaging from `/jobs/[id]/proposals`
- Forum discussion creation, replies, categories, voting, reporting,
  admin-only functions
- Forum RLS under cross-user access (policies read but not exercised)
- Payments, escrow, reviews/reputation and notification flows in the browser
- Pagination, filtering, search and sorting interactions in the browser
- Forgot-password and registration flows in the browser this phase
- Accessibility and screen-reader behaviour
- Load/performance testing

## 13. Disclosures

- `src/app/page.tsx` carries a **cosmetic homepage restyle from the previous
  session** (hover animations, restyled "How it works" cards). It is unrelated
  to pre-security QA and was not separately reviewed. It was included so the
  tracked tree would be clean and the prior work preserved; it is called out in
  the commit message so it can be reviewed on its own.
- Trailing whitespace and end-of-file newlines were normalised across 18 staged
  text files. Non-semantic, done so `git diff --cached --check` exits 0.
- `playwright-core` was installed with `--no-save`; `package.json` and the
  lockfile are unchanged.

## 14. Recommendation

The baseline is clean, reproducible and evidence-based. Four gates pass, the
route sweep is 45/45, QA residue is 0, and no secrets are tracked.

Suggested audit priorities, in order:

1. **Realtime** — confirm `pg_publication_tables`, apply `00017`, re-run the
   browser harness.
2. **Service-role authorization model** — the audit's core concern; route-level
   role guards (finding §11.2) are the known weak point.
3. **Forum RLS** — new tables and policies, never exercised under cross-user
   access.
