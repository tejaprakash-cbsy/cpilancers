# CPI Lancers — Security Audit, Phase 1: Discovery & Verification

Baseline commit: `4cee3f8` (`docs: reconcile realtime migration chronology`)
Date: 2026-10-03
Methodology: **DISCOVER → VERIFY → DOCUMENT → CLASSIFY → REPORT.** No fixes applied.

Status vocabulary: `CONFIRMED` / `REPRODUCED` / `UNCONFIRMED` / `INFORMATIONAL` / `FALSE POSITIVE` / `OPEN`.

---

## 1. Executive Summary

The application shows a **deliberately security-conscious design** and its core
authorization boundaries hold under direct API testing. Of a 32-case cross-user
authorization matrix, **every genuine cross-user access attempt was blocked**.
RLS functions as a genuine backstop: a non-member received **0 rows** from
`messages` and `conversation_members` while a member received the full set.
Privilege escalation via mass assignment was attempted and **failed**.

The most significant weaknesses are **defense-in-depth gaps rather than
exploitable bypasses**:

- The session cookie is issued **without `HttpOnly` and without `Secure`**.
- **No security headers at all** (no CSP, `X-Frame-Options`, `X-Content-Type-Options`,
  `Referrer-Policy`, HSTS, `Permissions-Policy`).
- Route-level **role guards are absent**, so a consultant renders client pages and
  a client renders consultant pages. API-level authorization still blocks the
  underlying data.

There is **no confirmed CRITICAL or HIGH authorization bypass.** The highest
individual severity is **MEDIUM**, because every confirmed issue requires a
secondary condition or yields only shell/UI exposure.

Two items remain **OPEN**: Realtime delivery, and Realtime publication membership.

---

## 2. Audit Coverage

**Audited with evidence:** authentication/session issuance, authentication
bypass on protected APIs, API-level role separation, resource ownership (jobs,
proposals, messages, conversations, profiles), IDOR across five identities, RLS
effectiveness, mass-assignment / privilege escalation, pagination limits,
sort/filter injection, admin access control, forum role model, cookie attributes,
CSRF posture, security headers, and secret exposure.

| Area | Reason not audited |
| --- | --- |
| Storage / uploads | All probed buckets returned HTTP 400; inventory not enumerable without the management API. `NOT AUDITABLE` |
| XSS (stored/reflected) | **NOT TESTED** — no injection payloads submitted; needs its own pass |
| Rate limiting / abuse | **NOT TESTED** — would be destructive; absence of a library is **not** proof of absence |
| Payments webhook signatures | Not exercised |
| Contracts / milestones / reviews deep flows | Routes exist; not exercised cross-user |
| Dependency CVEs | No advisory database available offline — `UNCONFIRMED` |
| Realtime publication catalog | Requires DB access — `UNCONFIRMED` |

---

## 3. Findings Table

| ID | Severity | Area | Finding | Evidence | Exploitability | Impact | Status |
|---|---|---|---|---|---|---|---|
| F-01 | **MEDIUM** | Authentication | Session cookie issued without `HttpOnly` and without `Secure` | Login `Set-Cookie` attrs = `Path=/, Expires, Max-Age, SameSite=lax` only | Requires XSS; `Secure` absence requires network position | Session-token theft; cookie travels over plaintext HTTP | CONFIRMED |
| F-02 | **MEDIUM** | Transport/Browser | No security headers emitted anywhere | CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, HSTS, Permissions-Policy all **MISSING** on `/login` | Requires luring victim to attacker page | Clickjacking; no defence-in-depth against injection | CONFIRMED |
| F-03 | **MEDIUM** | Authorization | Route-level role guards absent (known gap) | consultant `/jobs/create` **200**, `/dashboard/client` **200**, `/proposals/new/<id>` **200**; client `/dashboard/consultant` **200**, `/proposals` **200** | Direct navigation | UI shell exposure only; APIs still enforced | CONFIRMED |
| F-04 | **LOW** | CSRF | No CSRF token, no `Origin`/`Referer` validation | POST messages with `Origin: https://evil.example` → **201** | Mitigated in real browsers by `SameSite=lax`; confirmed only by manually attaching the cookie | Single point of failure on one browser control | CONFIRMED |
| F-05 | **LOW** | Availability | `client_profiles`/`companies`/`consultant_profiles` not granted to `authenticated` | User token → **403 / 42501** on all three | n/a | `POST /api/jobs` fails for every client. Fails **closed** — not a vulnerability | CONFIRMED |
| F-06 | **INFORMATIONAL** | Authorization | `/api/payments` has no role check | Client → **200**, `{"success":true,"data":[]}` | n/a | Caller-scoped and empty; no cross-user data | INFORMATIONAL |
| F-07 | **INFORMATIONAL** | Input handling | Unknown `sort` silently ignored | `?sort=DROP TABLE` → 200, default order, no error | n/a | No injection | FALSE POSITIVE |
| F-08 | **INFORMATIONAL** | Forum | No `moderator` role, by design | Privileged policies use `role = 'admin'` only | n/a | Matches actual role model | FALSE POSITIVE |
| F-09 | **OPEN** | Realtime | Publication membership not re-queried | No CLI/DB password; `schema_migrations` → 404 | n/a | Unverified | UNCONFIRMED |

---

## 4. Detailed Findings

### F-01 — Session cookie missing `HttpOnly` and `Secure` (MEDIUM)

**Location** Supabase SSR session cookie from `POST /api/auth/login`.
**Evidence**
```text
Set-Cookie: sb-uzjvaijepqfiogwncdjn-auth-token;
            Path=/; Expires=Sun, 07 Nov 2027 ...; Max-Age=34560000; SameSite=lax
```
No `HttpOnly`. No `Secure`.

**Attack scenario** Any reachable XSS can read `document.cookie` and exfiltrate the
live session token. F-02 means CSP does not constrain injected script.
**Expected** `HttpOnly; Secure; SameSite=Lax`.
**Impact** Session hijack becomes one successful XSS away; `Secure` absence permits
plaintext transmission.
**Severity** MEDIUM — depends on an XSS, none confirmed.
**Remediation (not applied)** Configure cookie options in `src/lib/supabase/*`;
set `Secure` at the edge.
**Regression test required** Yes — assert `Set-Cookie` flags.

### F-02 — No security headers (MEDIUM)

**Location** All routes; no header config in `next.config.ts` or `proxy.ts`.
**Evidence** On `GET /login`: CSP, `X-Frame-Options`, `X-Content-Type-Options`,
`Referrer-Policy`, `Strict-Transport-Security`, `Permissions-Policy` — all **MISSING**.
**Attack scenario** No `frame-ancestors`/`X-Frame-Options` → dashboards can be
embedded for clickjacking. No CSP → removes the primary XSS mitigation, compounding F-01.
**Severity** MEDIUM — defence-in-depth gap; no data exposure proven.
**Remediation (not applied)** Add headers in `next.config.ts`.
**Regression test required** Yes.

### F-03 — Route-level role guards absent (MEDIUM)

**Location** `src/proxy.ts` and the page tree.
**Evidence** (status / rendered bytes)
```text
consultant  GET /jobs/create           200  37,746 chars
consultant  GET /dashboard/client      200  33,508 chars
consultant  GET /proposals/new/<jobId> 200  37,813 chars
client      GET /dashboard/consultant  200  33,454 chars
client      GET /proposals             200  30,655 chars
```
`proxy.ts` tests sign-in status only (`protectedPath`, `adminPath`); there is **no
role check**.

**Exploitability** UI exposed, data not:
```text
consultant POST /api/jobs      -> 403
client    GET  /api/proposals  -> 403
client    GET  /api/admin/users-> 403
```
**Impact** Information disclosure of another role's interface; client-side confusion.
**Severity** MEDIUM — the class of gap that hides an API mistake later.
**Remediation (not applied)** Role guards in `proxy.ts`, keeping API checks as the boundary.
**Regression test required** Yes.

### F-04 — No CSRF token or origin validation (LOW)

**Location** All state-changing API routes.
**Evidence**
```text
POST /api/messages/conversations/<id>/messages  Origin: https://evil.example -> 201
POST /api/messages/conversations/<id>/messages  Origin: null                 -> 201

---

## 5. Verified Secure Areas

Actively tested, not assumed.

| Area | Result | Evidence |
| --- | --- | --- |
| Authentication required on APIs | PASS | Anonymous → messages **401**, `/api/admin/users` **401**, PATCH job **403** |
| Job ownership (IDOR) | PASS | ClientB → ClientA draft job: GET **404**, PATCH **403**, DELETE **404** |
| Draft job privacy | PASS | Draft invisible to non-owner (**404**) |
| Consultant cannot mutate client jobs | PASS | PATCH **403**, DELETE **403** |
| Proposal cross-user access | PASS | ConsultantB → ConsultantA proposal: GET **403**, PATCH **403** |
| Proposal visibility | PASS | ClientB → `/api/jobs/<id>/proposals` **403** |
| Non-member message read | PASS | **401** |
| Non-member conversation read | PASS | **401** |
| Non-member message send | PASS | **401** |
| Message edit/delete ownership | PASS | Non-author → **404** (fail-closed; no existence oracle) |
| RLS backstop | PASS | Non-member `messages` **0 rows**, `conversation_members` **0**; member **3 / 2** |
| Role separation | PASS | client→`/api/proposals` **403**; consultant→`POST /api/jobs` **403** |
| Admin access control | PASS | client & consultant → admin endpoints **403**; admin **200** |
| Privilege escalation / mass assignment | PASS | `PATCH /api/profile {"role":"admin","user_id":<other>}` → 200 but **no change** (roles/names verified unchanged in DB) |
| Pagination cap | PASS | `limit=100000 / 0 / -5` normalised; response reported `limit: 10` |
| Sort/filter injection | PASS | `sort=DROP TABLE` ignored; quote injection in `status` → empty set |
| Secrets in tracked source | PASS | No key literals; only `.env.example` (placeholders) tracked |
| Engineering gates | PASS | tsc 0, eslint 0, vitest **778/778**, build OK — unchanged by audit |

---

## 6. Known Open Issues

**O-1 — REALTIME DELIVERY FAILURE — OPEN.** Subscription reaches `SUBSCRIBED`, the
server replies `"Subscribed to PostgreSQL"`, but no `postgres_changes` INSERT is
delivered. Reproduced repeatedly. **Realtime messaging does not work.**

**O-2 — Realtime publication membership — UNCONFIRMED.** `00017` reported applied
and previously verified; no CLI or DB credential exists here to re-query
`pg_publication_tables`. Recorded as *previously verified remotely after
successful CLI push; not independently re-queried*.

**Realtime security (separate from delivery): PASS.** Realtime filters
`postgres_changes` through the table's `SELECT` policies; `messages` is covered by
`messages_select_member`. Demonstrated against those same policies: non-member
**0 rows**, member **3 rows**. An unauthorized subscriber receives nothing.

**O-3 — Route-level role-guard gap — CONFIRMED (F-03).** Scope: consultant reaches
`/jobs/create`, `/dashboard/client`, `/proposals/new/[jobId]`; client reaches
`/dashboard/consultant`, `/proposals`.

---

## 7. False Positives / Previously Fixed Issues

1. **`chat-view.tsx` message ownership** (fixed in `2ec7606`) — now compares against
   the authenticated caller; server and RLS independently enforce ownership. **FIXED.**
2. **`getMessages` `users!inner`** (fixed) — participants now read each other's messages.
3. **"Messages visible only to sender"** — not a leak; `messages_select_member` is conversation-scoped.
4. **`budget` / PGRST204** — no such column; app uses `budget_type`/`budget_fixed_cents`.
5. **Sort-parameter injection** — ignored, no injection (F-07).
6. **Forum `moderator` role** — never introduced; elevated policies use `admin` only (F-08).
7. **Hardcoded Supabase keys in `scripts/`** — removed earlier; scan clean.
8. **Session-persistence "failure"** — historical false positive (auth user without a `public.users` row).
9. **Role from request body** — `{"role":"admin"}` had no effect.

---

## 8. Recommended Security Fix Order

Not implemented.

1. **F-01** cookie `HttpOnly` + `Secure` — highest token-theft reduction per unit change.
2. **F-02** security headers (CSP, `frame-ancestors`, `nosniff`, Referrer-Policy, HSTS,
   Permissions-Policy) — **before** any XSS work so CSP can constrain it.
3. **F-04** CSRF origin validation — cheap; removes reliance on a single control.
4. **F-03** role guards in `proxy.ts` — UI hardening, after 1–3.
5. **F-05** restore grants or route the read through the service client — needs product decision.
6. **O-1/O-2** Realtime diagnosis — separate track; confirm publication membership before any change.
7. **Unaudited surface** — XSS, rate limiting, storage, dependency CVEs. Treat as
   remaining audit scope, not as clean.

---

## 9. Final Gates

| Check | Result |
| --- | --- |
| Application files modified | **NONE** — `git diff` empty |
| Schema / migration files modified | **NONE** |
| RLS policies modified | **NONE** |
| Supabase configuration modified | **NONE** |
| Tests weakened / skipped | **NONE** — 778/778 pass |
| Secrets exposed | **NONE** — no credential values printed or written |
| Production data modified | **NONE** — only `secaudit-*` / `SECAUDIT %` rows touched, all removed |
| QA residue | **0** — users, jobs, companies, proposals, messages, conversations all 0 |

```text
git status --short
?? scripts/
```

HEAD unchanged at `4cee3f8`. The only untracked path is the pre-existing,
previously-reviewed `scripts/` harness directory; audit scratch scripts were
written to the OS temp directory and removed. **No commit was made.**
```
**Exploitability, stated carefully.** The request was issued by a script that
**manually attached the cookie**. A real browser cross-site request would **not**
carry a `SameSite=lax` cookie, so this is **not directly exploitable** in current
browsers. The finding is that the server performs **no origin check**, making
`SameSite` the sole control.
**Remediation (not applied)** Validate `Origin`/`Referer`; retain `SameSite`.

### F-05 — Role tables not granted to `authenticated` (LOW, availability)

**Evidence** User token against PostgREST: `client_profiles`, `companies`,
`consultant_profiles` → **403 / 42501** "Grant the required privileges to the
current role". `job.service` reads `client_profiles` with the **user** client, so
`POST /api/jobs` fails for every client with `"Client profile not found"`.
This is **over-restriction, not exposure** — it fails closed. It blocked
end-to-end job-creation testing, so job fixtures were created with the service role.
| F-10 | **OPEN** | Realtime | End-to-end delivery fails | `SUBSCRIBED` reached; no `postgres_changes` INSERT received | n/a | Feature non-functional | OPEN |
