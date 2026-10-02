# Pre-Security Completion Report

Scope: everything completed **before** the dedicated security audit. This
documents prior work as it actually stands, including work that was present but
**uncommitted** when this session began.

Status vocabulary: `PASS` / `FAIL` / `NOT TESTED` / `NOT APPLICABLE`.

---

## 1. Project baseline

| Item | Value |
| --- | --- |
| Framework | Next.js 16.3.5, App Router, React 19 |
| Language | TypeScript (strict) |
| Styling | Tailwind CSS 4 |
| Backend | Supabase (Postgres + PostgREST + Auth + Storage), Supabase SSR |
| Build | Confirmed by `npm run build` (`next build` v16.3.5) |

Architecture: route handlers under `src/app/api/**` are the backend; domain logic
in `src/services/**`; validation in `src/lib/validations/**`; route protection in
`src/proxy.ts`.

**Authorization model (most important fact carried into the audit):** browser
reads and writes go through `/api/*` handlers that largely use the
**service-role** client with application-level ownership checks. RLS is a
backstop, not the primary authorization layer, so one missed ownership check in
a service layer is a full bypass.

Implemented areas: jobs (CRUD, drafts, filtering, pagination, sorting), profiles,
proposals, messaging (conversations, messages, edit/delete/report), client and
consultant dashboards, payments, notifications, reviews/reputation, admin, and a
forum (migration `00016`).

No redesign, rewrite or new architecture was introduced.

---

## 2. Engineering sweep (previously completed)

| Area | Change | Commit |
| --- | --- | --- |
| Auth | Login route fixes | `4d15a87`, `aeb0bc2` |
| Auth | Forgot-password reported false success; fixed | `aeb0bc2` |
| Auth | Role-based post-login redirects | `aeb0bc2` |
| Auth | Logout, protected routes, redirect-safety coverage | `4d15a87` |
| Messaging | Conversation list crashed on every non-empty list | `edb26c7` |
| Messaging | Stale-response guards on loaders | `aeb0bc2` |
| Messaging | PostgREST ordering + invalid profile embeds | `d5f95b5` |
| Jobs | `undefined` serialization in jobs/proposal query params | `d5f95b5` |
| Jobs | Sort-field validation, filters, pagination limits | earlier stages |
| Profiles | Fabricated data removed from public consultant profile | `c6bb907` |
| Repo | `.env.example` tracked, `.env*` ignored | `b31eb29` |
| Docs | Security findings and design decisions recorded | `b173bec` |
| Docs | QA report corrected | `78e81e4` |

Authorization work (conversation ownership, job ownership, private/draft job
protection, proposal validation) is covered by `conversation-authorization.test.ts`,
`jobs-authorization.test.ts` and `proposal-regression.test.ts`.

No additional fixes were invented or attributed to this phase. The only code
change made **in this session** is the messaging read-scoping fix in
`PRE_SECURITY_QA_FINAL_REPORT.md`.

---

## 3. Engineering gates

Measured at the current working tree in this session:

```text
npx tsc --noEmit                -> PASS  (exit 0)
npx eslint . --max-warnings=0   -> PASS  (exit 0)
npx vitest run                  -> PASS  (29 files, 770/770 tests passed)
npm run build                   -> PASS  ("Compiled successfully")
```

No test was modified, skipped or weakened to reach these results. One test was
**added** (the messaging read-scoping regression).

---

## 4. Supabase verification

| Item | Result |
| --- | --- |
| Project ref | `uzjvaijepqfiogwncdjn` — **VERIFIED** (matches `supabase/.temp/project-ref`) |
| Environment | Supabase **development/test** project used as a QA target only |
| Env configuration | `.env.local` holds Supabase, Stripe and SendGrid keys; `.env*` git-ignored, `.env.example` tracked with placeholders |
| Secret handling | No secret value printed, logged or committed in this session |
| Data-plane connectivity | **VERIFIED** — REST reads/writes succeeded throughout |
| Migration state | `00001`–`00015` pre-existing; `00016`, `00017` present |
| QA fixture testing | **VERIFIED** |
| RLS / authorization | **VERIFIED** — non-member API read returned HTTP 401 `UNAUTHORIZED`; non-member page rendered no conversation content |
| Teardown / residue | **PASS — residue 0** |

**Constraint:** the project has hit Supabase's **email rate limit** (HTTP 429 on
`/auth/v1/signup`), so QA users could not be created via
`POST /api/auth/register`. They were created via the Auth Admin API and then given
exactly the rows `auth.service.ts registerUser()` writes (`public.users` and
`public.profiles`). This is an infrastructure limit, not an application behaviour,
and weakened no assertion.
---

## 5. Forum migration `00016_forum.sql`

**Applied remotely: VERIFIED.** All five tables present and reachable:

```text
forum_categories   PRESENT   (9 seeded categories)
forum_discussions  PRESENT
forum_posts        PRESENT
forum_votes        PRESENT
forum_reports      PRESENT
REST probe /rest/v1/forum_discussions -> HTTP 200
```

Both required corrections are present:

1. **Trigger function corrected** — triggers call `update_updated_at_column()`;
   the non-existent `trigger_set_timestamp()` is not referenced anywhere.
2. **Unsupported `moderator` checks removed** — privileged policies key off the
   existing `admin` role only:
   `USING (auth.uid() IN (SELECT id FROM public.users WHERE role = 'admin'))`.
   **No `moderator` role was introduced**; `user_role` has no such value and none
   was added.

The word "moderator" still appears in two **comments** in
`00012_reviews_reputation_remediation.sql`; those are prose about review
moderation, not role checks.

---

## 6. Realtime migration `00017_realtime_messages.sql`

The file performs `ALTER PUBLICATION supabase_realtime ADD TABLE messages;`,
guarded by a `pg_publication_tables` check so it is idempotent.

These statements are reported separately because they are not equivalent:

| Statement | Result |
| --- | --- |
| File `00017_realtime_messages.sql` present in repo | **VERIFIED** |
| `00017` applied remotely | **PASS (reported)** — applied by the successful manual CLI push |
| `messages` in the `supabase_realtime` publication | **PASS (reported)** — previously verified; not re-queried this session |
| End-to-end browser delivery | **FAIL — NOT WORKING** |

*Superseded finding.* This section originally read "NOT VERIFIED" for the
publication, based on the early `REALTIME_FIX_REPORT.md` snapshot of the first
failed `db push`. Later, after `00016` was corrected twice, the Supabase CLI was
run manually against `uzjvaijepqfiogwncdjn` and both migrations were reported
pushed successfully, with `pg_publication_tables` reported showing `messages`.

_Current status: **previously verified remotely after successful CLI push; not
independently re-queried in this session.**_ No CLI, no DB password and no
`schema_migrations` access via PostgREST (HTTP 404) in this environment. Full
chronology: `PRE_SECURITY_BASELINE_REPORT.md` §1.

**Why `SUBSCRIBED` alone is not proof of delivery:** both browsers reached
`SUBSCRIBED` and the server replied
`{"message":"Subscribed to PostgreSQL","status":"ok"}` — but a differential probe
showed `jobs` and `forum_posts` **also** report `SUBSCRIBED`. Only a received
event proves delivery, and no `postgres_changes` INSERT frame was ever observed.

**Consequence:** because the publication is reported applied, the browser delivery
failure is **unexplained** and is carried into the audit as an open item.

---

## 7. Browser QA history (previously completed)

Public pages, authentication (register/login/logout/invalid credentials/forgot
password), role-based routing, session persistence, protected routes, cross-user
authorization, responsive layouts, messaging regression (30/30 targeted
Chromium), jobs regression, fabricated-data audit, and QA cleanup with residue 0
were all completed earlier and are retained.

**Discovered then fixed:** messaging PostgREST ordering and invalid profile
embeds plus `undefined` query-param serialization (`d5f95b5`); conversation-list
crash (`edb26c7`); forgot-password false success (`aeb0bc2`); fabricated public
profile data (`c6bb907`).

**Supabase Stage 2 previously reported 44/45 with the only failure being
Realtime.** This session's browser work confirms that Realtime failure is real
and persists.

---

## 8. Session persistence investigation (earlier false positive)

This was **not** an unresolved session bug:

- QA users created **directly through the Auth Admin API without a matching
  `public.users` row** could not resolve a session, which looked like broken
  authentication.
- Proper registration creates that mapping — `auth.service.ts` inserts into
  `public.users` and `public.profiles` immediately after `auth.signUp`.
- With the mapping present, QA users passed `/api/auth/me`, protected routes,
  `/messages`, `/proposals` and `/jobs/create`. Confirmed again this session:
  `/api/auth/me` returned HTTP 200 for both roles and all protected routes
  rendered.
- The header authentication display was separately corrected.

This session reproduced the effect: fixtures were given the identical
`public.users` row and authenticated immediately.

---

## 9. Budget / PGRST204 investigation

The application **does not use a `budget` column**; it uses `budget_type` and
`budget_fixed_cents`. The `PGRST204` error came from the QA/test payload
referencing a non-existent `budget` key on `jobs`. **No database migration for a
`budget` column is required**, and none was added.

---

## 10. Remaining known work (re-verified this session)

| Item | Status |
| --- | --- |
| Realtime end-to-end delivery | **FAIL** — subscribes but never delivers; cause open |
| Migration `00017` applied remotely | **PASS (reported)** — successful CLI push; not re-queried this session |
| Cross-role UI guard | **FAIL (new finding)** — a consultant can render `/jobs/create` and `/dashboard/client` |
| `chat-view.tsx` own-message detection | **FIXED** — now compares `sender_id` to the authenticated caller |
| Forum end-to-end browser QA | **NOT TESTED** in depth (page loads verified, CRUD not exercised) |
| Client job/proposal CRUD, proposal submission | **NOT TESTED** end-to-end |
| Dedicated security audit | **NOT STARTED** — out of scope |
