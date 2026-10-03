# Security Remediation Report — F-03 Route-Level Role Guards

**Finding:** F-03 — Route-level role guards absent
**Date:** 2026-03-10
**Stage:** 4
**Baseline commit:** `93b6498` (`security: add security headers and CSP`)
**Status:** **REMEDIATED**
**Commit:** *not created — awaiting approval*

---

## 1. Finding F-03

Role was enforced only in API routes and services. The pages themselves had no
role check, so a consultant could render `/dashboard/client`, `/jobs/create` and
`/proposals/new/[jobId]`, and a client could render `/dashboard/consultant` and
`/proposals`. The APIs already refused the underlying operations, so this was a
defense-in-depth gap rather than a data breach.

## 2. Root cause

`src/proxy.ts` authenticates (redirecting unauthenticated users to `/login`) but
deliberately does **not** enforce role, and no page or layout performed a role
check before rendering. Every guarded page is a `'use client'` component whose
first act is a `fetch`, so the role decision always happened after the page
shell had already been sent.

## 3. Canonical role source

**`public.users.role`, read through `AuthService.getCurrentUser()`** — which
derives the user id from the verified session cookie and then reads the role from
the database.

Deliberately **not** used: user metadata, query parameters, request headers,
localStorage, or anything in the cookie. Supabase `user_metadata` is writable by
the client, and a role read from any client-controlled source is forgeable. No
role field was added to any client-controlled state.

## 4. Exact implementation

One shared server helper plus four thin layouts. `src/proxy.ts` was **not
modified**, and no API, service, RLS policy or migration was touched.

**New `src/lib/auth/require-role.ts`** exports `requireRole(allowed)`, plus the
`CLIENT_ROLES` / `CONSULTANT_ROLES` constants. On failure it redirects to
`roleHomePath(role)` — the caller's *own* home, never the page they were denied.

**New layouts** (server components, run before the guarded page renders):
- `src/app/(client)/layout.tsx` → `CLIENT_ROLES`
- `src/app/(consultant)/layout.tsx` → `CONSULTANT_ROLES`
- `src/app/dashboard/client/layout.tsx` → `CLIENT_ROLES`
- `src/app/dashboard/consultant/layout.tsx` → `CONSULTANT_ROLES`

### Why a layout and not `proxy.ts`

`DESIGN_NOTES.md` §7 records a deliberate, test-pinned decision that role is
enforced in the service layer and not in the proxy, because "enforcing role in
the proxy would trust a value the proxy itself does not verify." A server layout
reads the role from the same verified, database-backed source as the services, so
it does not have that defect. The proxy was left exactly as it was, and the
test that pins §7 still passes.

## 5. Routes protected

| Route | Rule | Basis in existing API authorization |
|-------|------|--------------------------------------|
| `/jobs/create` | client (+admin) | `POST /api/jobs` — "Only clients can create jobs." |
| `/jobs/[id]/edit` | client (+admin) | job edit is an owning-client action |
| `/jobs/[id]/proposals` | client (+admin) | `GET /api/jobs/[id]/proposals` — clients view proposals on their own jobs |
| `/dashboard/client` | client (+admin) | — |
| `/dashboard/consultant` | consultant | — |
| `/proposals` | consultant | `GET /api/proposals` — "Only consultants can access this endpoint. Clients use /api/jobs/[id]/proposals instead." |
| `/proposals/new/[jobId]` | consultant | `POST /api/proposals` — "Only consultants can submit proposals." |

## 6. Correction to the finding text (important)

The F-03 description listed **`/proposals/new/[jobId]` as a client-only** route.
That is **incorrect**, and implementing it literally would have broken proposal
submission. The evidence:

- The page lives in the **`(consultant)`** route group, not `(client)`.
- It renders `ProposalForm` — the consultant's proposal submission form.
- `POST /api/proposals` returns **403 "Only consultants can submit proposals."**
- `GET /api/proposals` tells clients: *"Clients use /api/jobs/[id]/proposals instead."*

The guard was implemented to match the **API**, which is the authority: that route
is consultant-only. A client reaching it is redirected; a consultant is allowed.

## 7. Role matrix (production build, real browser)

| Actor | Route | Expected | Actual |
|-------|-------|----------|--------|
| client | `/dashboard/client` | allow | stayed — PASS |
| client | `/jobs/create` | allow | stayed — PASS |
| client | `/dashboard/consultant` | deny | → `/dashboard/client` — PASS |
| client | `/proposals` | deny | → `/dashboard/client` — PASS |
| client | `/proposals/new/[jobId]` | deny | → `/dashboard/client` — PASS |
| consultant | `/dashboard/consultant` | allow | stayed — PASS |
| consultant | `/proposals` | allow | stayed — PASS |
| consultant | `/dashboard/client` | deny | → `/dashboard/consultant` — PASS |
| consultant | `/jobs/create` | deny | → `/dashboard/consultant` — PASS |
| consultant | `/proposals/new/[jobId]` | allow | stayed — PASS |
| unauthenticated | all five | `/login` | `307 /login?next=…` — PASS |

**21/21** assertions passed across the role matrix, session regression, redirect
loop checks, open-redirect checks and cookie verification.

### Denied content is never rendered

Verified directly in the response body: a client requesting
`/dashboard/consultant` receives **no consultant dashboard content**
(`Saved jobs` / `Earnings` absent). The guard fires before the page renders.

## 8. Admin behaviour

`admin` was **not** invented into the model. `ROLE_HOME_PATH` already documents:

```ts
client: '/dashboard/client',  consultant: '/dashboard/consultant',  admin: '/dashboard/client'
```

with the note that admins fall back to the client dashboard because no admin page
exists. `CLIENT_ROLES` therefore includes `admin`.

This is required for correctness, not convenience: excluding admin from
`/dashboard/client` would redirect an admin to a page they are not allowed to
see — an **infinite redirect loop**. Existing documented admin behaviour is
preserved exactly.

## 9. Unauthenticated behaviour

Unchanged. `src/proxy.ts` still redirects unauthenticated visitors to
`/login?next=…` before any page renders. The layout guard is a second,
independent layer that does not depend on a regex someone may later edit.

## 10. API authorization preserved (route guard is *not* the only layer)

| Check | Result |
|-------|--------|
| consultant `POST /api/jobs` | **403 "Only clients can create jobs."** |
| client `GET /api/proposals` | **403 "Only consultants can access this endpoint."** |
| client `POST /api/proposals` | **403** |
| consultant `GET /api/proposals` | passes the role gate (404 — no proposals yet) |
| client `POST /api/jobs` | passes the role gate (400 — QA `client_profile` row absent, pre-existing data gap) |

Ownership and cross-user checks are untouched: `auth-regression` **38/38**,
cross-user authorization suites **183/183** (conversation, jobs, admin, refund,
role-redirect, session-cookie). No service, RLS policy or migration was edited,
so authorization could not have been weakened by this change.

## 11. Security considerations — explicit testing

| Attack | Test | Result |
|--------|------|--------|
| Redirect loop | 6-hop follow on all four cross-role paths | all terminate at 200 in 1 hop — PASS |
| Open redirect | `?next=` = `//evil.com`, `https://evil.com/x`, `javascript:alert(1)`, `/\evil.com` | all rejected — PASS |
| Role spoofing via header | `x-user-role: admin` on `/dashboard/consultant` as client | ignored, no consultant content — PASS |
| Role spoofing via cookie | injected `sb-role=admin` | ignored — PASS |
| Role spoofing via query | `?role=admin` | ignored — PASS |
| Direct URL access | consultant → `/dashboard/client`, `/jobs/create` | redirected — PASS |
| Access after refresh | guard re-applied after hard reload | enforced — PASS |
| Session restoration | client and consultant survive refresh on their own pages | PASS |
| JS reading the cookie | role resolved server-side; no client cookie access needed | PASS |

## 12. A false alarm that was investigated

The first role-matrix run reported cross-role access returning **200** and looked
like a total failure of the guard. It was not. Next.js signals a `redirect()`
thrown from a server layout as:

```
data-dgst="NEXT_REDIRECT;replace;/login;307;"
data-msg="Switched to client rendering because the server rendering errored: NEXT_REDIRECT"
```

i.e. an HTTP **200** carrying a client-followed redirect, not a bare 307. The
matrix was asserting the wrong signal. It was confirmed by temporarily replacing
the guard with an unconditional `redirect('/login')` — still HTTP 200 — and by
inspecting the body, which showed the denied page's content was **absent**
(`has consultant dashboard content: false`). The guard was working; the test was
wrong. It was rewritten to assert the security property (final URL plus absence of
denied content) rather than the status code.

## 13. Test results

| # | Test | Result |
|---|------|--------|
| 1 | `npx tsc --noEmit` | **PASS** (exit 0) |
| 2 | `npx eslint . --max-warnings=0` | **PASS** (exit 0) |
| 3 | `npx vitest run` | **PASS — 784/784** (30 files) |
| 4 | `npm run build` | **PASS** — `next-build (v16.3.8)` |
| 5 | Route sweep | **45/45 PASS, 0 FAIL** |
| 6 | Role matrix + session + spoofing + cookies | **21/21 PASS** |
| 7 | API authorization regression | **PASS** — see §10 |
| 8 | Security regression | **38/38** + **183/183** |
| 9 | Browser regression | **12 PASS / 4 FAIL** — unchanged baseline |
| 10 | F-01 cookie regression | **PASS** — see §14 |
| 11 | F-02 header/CSP regression | **PASS** — see §15 |

> ESLint initially failed with 5 warnings. All 5 came from temporary `_f03-*.mjs`
> QA scripts I had created under `scripts/`, not from application source. Those
> scripts were deleted and ESLint returned to clean. No application file was
> changed to achieve this.

## 14. F-01 regression — intact

Verified in a real browser for both roles:

```
httpOnly = true   secure = true   sameSite = Lax   path = /
```

`src/lib/supabase/cookie-options.ts` was **not modified**; its 6-test guard still
passes. Role resolution works with the `HttpOnly` cookie because it happens
entirely server-side.

## 15. F-02 regression — intact

`next.config.ts` was **not modified**. All six headers verified present on HTML
pages, API routes and static assets, with CSP **enforced**:

```
x-content-type-options · x-frame-options · referrer-policy
permissions-policy · strict-transport-security · content-security-policy [ENFORCED]
```

30/30 header assertions passed.

## 16. Realtime — unchanged, F-10 still OPEN

Realtime was not touched. The browser suite reports **12 PASS / 4 FAIL**, matching
the baseline exactly, with the same four pre-existing F-10 delivery failures:

- Client A → Consultant B delivery (no refresh)
- Consultant B → Client A delivery (no refresh)
- Burst of 3 delivered to B
- No duplicate delivery to B

`DELIVERY_VERDICT=NOT VERIFIED`. Both channels still reach **`SUBSCRIBED`**.

An intermediate run showed 10/6. That was the same **QA data accumulation** seen
in Stage 3 — the suite appends 5 messages per run to a shared conversation while
asserting exactly 4. After resetting the fixtures, the result returned to the
12/4 baseline. Not attributable to F-03.

## 17. Changed files

| File | Status |
|------|--------|
| `src/lib/auth/require-role.ts` | **new** |
| `src/app/(client)/layout.tsx` | **new** |
| `src/app/(consultant)/layout.tsx` | **new** |
| `src/app/dashboard/client/layout.tsx` | **new** |
| `src/app/dashboard/consultant/layout.tsx` | **new** |

**Zero tracked files modified.** No migration, RLS, Realtime, API, service,
`package.json`, `package-lock.json`, cookie helper, CSP or header change.

## 18. Final status

**REMEDIATED.** Route-level role guards are in place as additive defense in
depth; API authorization, ownership checks and RLS remain the enforcement layer
and are demonstrably intact.

Nothing has been staged or committed. Awaiting explicit approval before committing.