# CPI Lancers — Security Audit, Phase 2: Remaining Attack Surface & Deep Flows

Baseline: `4cee3f8` (unchanged) · Date: 2026-10-03 · **AUDIT ONLY — no remediation applied**

Phase 1 findings (F-01…F-10) are **preserved unchanged**. This report only adds F-11 onward.

---

## 1. Executive Summary

Phase 2 closed the areas Phase 1 left open. The dominant result is **negative**:
across XSS, dependency, storage, webhook, contracts, reviews, notifications,
admin, input-validation and error-disclosure testing, **no new exploitable
vulnerability was confirmed**.

Two material items emerged:

1. **`next@16.3.5` sits inside a CRITICAL advisory range** (GHSA-vcvr-r3jv-pc5j,
   RCE in `next/og` `ImageResponse`). I verified `next/og` / `ImageResponse` is
   **not imported anywhere**, so the vulnerable path is not reachable today. It is
   still a directly-declared dependency one patch behind a published fix, and is
   classified **MEDIUM**, not CRITICAL, precisely because reachability was disproved.
2. **Rate limiting is in-memory and per-process.** It genuinely works (10
   messages/minute enforced), but on serverless it is per-lambda-instance and
   resets on cold start.

XSS was tested with executable payloads and **no injection sink exists** — zero
`dangerouslySetInnerHTML`, `eval`, `new Function`, `innerHTML` or markdown-to-HTML
rendering in `src/`.

---

## 2. Phase 2 Coverage

| Area | Result |
| --- | --- |
| Stored XSS (profiles, jobs, messages, forum) | **PASS** — payload stored, no execution path |
| Reflected XSS (query params) | **PASS** — parameters not reflected |
| DOM XSS / sink inventory | **PASS** — no sinks in `src/` |
| Rate limiting — messaging | **FINDING** (F-12) — works but in-memory |
| Rate limiting — other endpoints | **FINDING** (F-13) — absent |
| Storage / uploads | **PASS** — private bucket; upload path unreachable |
| Dependency security (`npm audit`) | **FINDING** (F-11) |
| Payment webhooks | **OPEN / PARTIAL** — §6 |
| Contracts / milestones | **PASS** — cross-user access denied |
| Reviews | **PASS** — edit and delete ownership enforced |
| Notifications | **PASS** — recipient-scoped |
| Admin surface (deep) | **PASS** — all non-admin roles denied |
| Deep API authorization (29 cases) | **PASS** |
| Input validation | **FINDING** (F-14) — 500 on invalid PATCH body |
| Realtime security | **PASS** — RLS governs; delivery remains OPEN |
| Error / information disclosure | **PASS** — generic messages, no stack traces |
| CORS / origin | **PASS** — no CORS headers, same-origin |
| Deployment configuration | **PASS** — §5 |
| Database security | **PARTIAL** — catalog reads blocked |

---

## 3. New Findings Table

---

## 4. Detailed Findings

### F-11 — `next` inside a critical advisory range (MEDIUM)

**Location** `package.json` / `package-lock.json` → `node_modules/next@16.3.5`.
**Evidence**
```text
name: next   severity: critical   isDirect: true
via:  GHSA-vcvr-r3jv-pc5j  "Next.js: Remote Code Execution in next/og ImageResponse"
range: 16.2.0 - 16.3.5     fixAvailable: 16.3.8 (isSemVerMajor: false)
```
**Reachability verified**
```text
grep 'next/og|ImageResponse|opengraph' across src/  ->  no matches
```
**Expected** Dependency outside known-vulnerable ranges.
**Actual** Installed `16.3.5` is inside `>=16.2.0 <16.3.6`.
**Severity** MEDIUM. The advisory is CRITICAL, but the vulnerable API is unused, so
the advisory's severity is **not** carried into this application's risk.
**Status** CONFIRMED (version) / UNCONFIRMED (exploitability).
**Remediation (not applied)** `next` → `16.3.8`. Non-major, one line.
**Required regression test** None; assert via `npm audit` in CI.

### F-12 — In-memory rate limiting (LOW)

**Location** `src/services/messaging.service.ts`, module scope.
**Evidence**
```ts
const RATE_LIMIT_MESSAGES_PER_MINUTE = 10;
const rateLimitStore: Map<string, { count: number; resetTime: number }> = new Map();
```
Keyed by `user.id`. Verified live — 13 rapid sends:
`201,201,201,201,201,201,201,201,201,400,400,400,400`.
**Expected** A shared store so the limit holds across instances.
**Actual** Process-local `Map`; cold start resets; serverless isolates per instance.
**Impact** The control works but is weaker than the constant implies.
**Status** CONFIRMED. **Remediation (not applied)** Shared store or edge throttling.
**Required regression test** Yes — limit semantics and status code.

### F-13 — No rate limit on sensitive endpoints (LOW)

**Location** `/api/auth/login`, `/api/auth/register`, `/api/auth/reset-password`,
`POST /api/jobs`, `POST /api/proposals`, `POST /api/forum/discussions`.
**Evidence** No throttling code exists outside `messaging.service.ts`.
**Assessed impact** Login/registration are additionally constrained by Supabase Auth's
own limits. Creation endpoints are bounded by authentication and ownership but not
by volume.
**Status** CONFIRMED as **missing protection**. Deliberately **not** classified as a
demonstrated denial-of-service — no load test was run.
**Remediation (not applied)** Edge/WAF throttling or a shared-store limiter.

### F-14 — 500 instead of 400 on invalid job PATCH (LOW)

**Location** `PATCH /api/jobs/[id]`.
**Evidence** Authenticated owner sends
`{"budget_fixed_cents":-999999,"title":""}` → **500** `{"message":"Failed to update job"}`.
**Analysis** `POST /api/jobs` validates through `jobCreateSchema`; the PATCH path
appears to forward the body to the database and surface the constraint failure as a
generic 500. The message is generic and discloses nothing sensitive.
**Impact** Error-handling quality; possible log noise. No data exposure.
**Status** CONFIRMED. **Remediation (not applied)** Apply `jobEditSchema` before write.
**Required regression test** Yes.

### F-15 — Rate-limit returns 400 (INFORMATIONAL)
Throttling surfaces as `ValidationError` → HTTP 400 rather than 429.

---

## 5. Verified Secure Areas (Phase 2)

| Area | Evidence |
| --- | --- |
| Stored XSS | Payload `<script>alert(1)</script><img src=x onerror=alert(2)>` written to profile name, job title and message content; checked on `/consultants/[id]`, `/jobs/[id]`, `/messages/[id]`, `/forum` — **rawScript=false, rawOnerror=false** on all four |
| XSS sink inventory | Zero matches for `dangerouslySetInnerHTML`, `eval(`, `new Function(`, `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `document.write` across `src/` |
| Reflected XSS | `?q=` / `?search=` carrying script payloads — **not echoed** (raw or escaped) |
| Attachment upload via API | `attachments:["x"]` → **400** `File type undefined is not allowed`; JSON cannot carry a `File`, so `uploadAttachment` is unreachable and fails closed |
| Storage | Exactly one bucket, `message-attachments` (**private**); anonymous public GET denied; no public buckets |
| Contracts | ClientB / ConsultantB `GET`+`PATCH` → **403** `You do not have access`; anonymous → **401**; parties → **200** |
| Reviews | Non-author `PATCH` → **403**; non-author `DELETE` **with a valid body** → **403**; row confirmed unchanged (`deleted_at=null`) |
| Notifications | ClientB `PATCH` clientA's notification → **404**; ClientB list empty; ClientA sees only its own; anonymous → **401** |
| Admin surface | Client and Consultant → **403** `Administrator access is required`; anonymous → **401**; admin → **200** |
| Mass assignment | `PATCH /api/profile {"client_id":<other>,"role":"admin","is_admin":true}` → 200, **no change** (verified in DB) |
| Error disclosure | Generic messages only — `Job was not found`, `Proposal was not found`, `Message content is required`. **No stack traces, SQL or internal paths** |
| CORS | No `Access-Control-*` headers on any response; no permissive origin |
| Deep API authorization | 29-case matrix — every cross-user attempt denied |

| ID | Severity | Area | Finding | Evidence | Exploitability | Impact | Status |
|---|---|---|---|---|---|---|---|
| F-11 | **MEDIUM** | Dependencies | `next@16.3.5` inside a critical RCE advisory range | `npm audit`: critical, `GHSA-vcvr-r3jv-pc5j`, range `>=16.2.0 <16.3.6`, fix `16.3.8`; installed `16.3.5` | **Not reachable** — `next/og`/`ImageResponse` imported nowhere | Latent risk if adopted; trivial patch | CONFIRMED |
| F-12 | **LOW** | Rate limiting | Messaging rate limit held in a module-level in-process `Map` | `const rateLimitStore: Map<...> = new Map()` | Works in-process (9×201 then blocked); resets on cold start; per-instance on serverless | Effective limit scales with instance count | CONFIRMED |
| F-13 | **LOW** | Rate limiting | No application rate limit on login, register, reset-password, job/proposal/forum creation | No throttling code outside `messaging.service.ts` | Relies on Supabase Auth limits and upstream edge | Enumeration bounded only by the provider | CONFIRMED |
| F-14 | **LOW** | Input validation | Job `PATCH` returns 500 on an invalid body instead of 400 | Owner `PATCH {"budget_fixed_cents":-999999,"title":""}` → **500** `Failed to update job` | Requires an authenticated owner | Error handling; log noise; no data exposure | CONFIRMED |
| F-15 | **INFORMATIONAL** | Rate limiting | Rate-limit rejections return 400, not 429 | `201×9` then `400,400,400,400` | n/a | Clients cannot distinguish throttling | CONFIRMED |

---

## 6. Remaining Open / Unaudited Areas

- **Payment webhooks — PARTIAL.** `/api/payments/webhook` exists with no app-level
  auth guard. Signature-verification code exists and a unit suite covers it
  (`payment-webhook-signature.test.ts`), but **no live signed/unsigned request was
  sent** — no real credentials were used and no transaction was made. Treat as
  **UNCONFIRMED**, not PASS.
- **Realtime delivery — OPEN.** Unchanged from Phase 1; delivery still fails.
- **Realtime publication membership — UNCONFIRMED.** No DB credential to query the catalog.
- **Database internals — PARTIAL.** `SECURITY DEFINER` functions, grants and
  `REVOKE`s were **read** in migrations but not **enumerated** from the live catalog
  (PostgREST cannot expose `pg_proc`). RLS effectiveness was instead proven
  behaviourally with authenticated identities.
- **Dependency CVEs beyond `npm audit`** — advisory database reachable only via npm.
- **Contracts/milestones mutation lifecycle** — read access and cross-user denial
  verified; the full status-transition state machine was not driven end-to-end.
- **Load/DoS characteristics** — deliberately not tested.

---

## 7. Phase 1 Findings Status

| Finding | Current status | New evidence |
| --- | --- | --- |
| F-01 cookie flags | **OPEN** (unchanged) | Re-observed: still `Path`, `Expires`, `Max-Age`, `SameSite=lax` only |
| F-02 security headers | **OPEN** (unchanged) | Re-observed: all six still MISSING |
| F-03 route role guards | **OPEN** (unchanged) | Re-confirmed; APIs still deny |
| F-04 CSRF | **OPEN** (unchanged) | No origin validation found anywhere; no token mechanism exists |
| F-05 missing grants | **OPEN** (unchanged) | Still 403/42501 on the three tables |
| F-06 payments role check | **INFORMATIONAL** (unchanged) | Still caller-scoped empty data |
| F-07 sort injection | **FALSE POSITIVE** (unchanged) | Re-confirmed ignored |
| F-08 forum roles | **FALSE POSITIVE** (unchanged) | Still `admin` only, no `moderator` |
| F-09 publication membership | **UNCONFIRMED** (unchanged) | Still no DB credential |
| F-10 Realtime delivery | **OPEN** (unchanged) | Not retested this phase; remains broken per prior evidence |

**No Phase 1 finding was closed.**

---

## 8. Consolidated Security Fix Queue

Ordered by severity and dependency. **Nothing implemented.**

| # | Item | Source | Severity |
|---|---|---|---|
| 1 | Patch `next` → `16.3.8` | F-11 | MEDIUM |
| 2 | Add security headers (CSP, `frame-ancestors`, `nosniff`, Referrer-Policy, HSTS, Permissions-Policy) | F-02 | MEDIUM |
| 3 | Set `HttpOnly` + `Secure` on the session cookie | F-01 | MEDIUM |
| 4 | Route-level role guards in `proxy.ts` | F-03 | MEDIUM |
| 5 | `Origin`/`Referer` validation on state-changing routes | F-04 | LOW |
| 6 | Shared-store rate limiting + return 429 | F-12, F-15 | LOW |
| 7 | Rate limits on auth and creation endpoints | F-13 | LOW |
| 8 | Apply `jobEditSchema` on job PATCH | F-14 | LOW |
| 9 | Restore authenticated grants (product decision) | F-05 | LOW |
| 10 | Diagnose Realtime delivery; confirm publication membership | F-09, F-10 | OPEN |
| 11 | Live webhook signature testing with sandbox credentials | §6 | UNCONFIRMED |

---

## 9. Final Safety Gates

| Check | Result |
| --- | --- |
| Application source modified | **NONE** — `git diff` empty |
| Migrations / RLS / Supabase config modified | **NONE** |
| `package.json` / lockfile modified | **NONE** |
| Tests modified or skipped | **NONE** — 778/778 pass, `tsc` exit 0 |
| Secrets printed | **NONE** |
| Production data modified | **NONE** |
| Audit records deleted | **YES** — teardown run; second pass found 0 |
| QA residue | **0** across users, jobs, messages, conversations, contracts, reviews, notifications, profiles, companies |
| Commit created | **NONE** |

```text
git status --short
?? SECURITY_AUDIT_PHASE1.md
?? SECURITY_AUDIT_PHASE2.md
?? scripts/
```

HEAD unchanged at `4cee3f8`. Only the two audit reports and the pre-existing
`scripts/` directory are untracked. Audit scratch scripts were written to the OS
temp directory and removed.
| F-16 | **INFORMATIONAL** | Dependencies | 5 build-only dev advisories (`eslint-config-next`, `braces`, `fast-glob`, `micromatch`) | `npm audit`, all `isDirect:false` | Build-time only, not shipped | None at runtime | FALSE POSITIVE |
