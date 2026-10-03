# CPI Lancers — Security Findings Consolidation & Remediation Plan

**Phase:** Consolidation, dependency-ordering and planning.
**Status:** PLAN ONLY — **no fix implemented, no commit created.**

**Baseline:** `4cee3f8` · **Source of truth:** `SECURITY_AUDIT_PHASE1.md`,
`SECURITY_AUDIT_PHASE2.md` (both unmodified) · **Date:** 2026-10-03

This plan does not re-audit the application. Reported locations were only
re-checked for continued existence; results in section 2.

---

## 1. Executive Summary

Sixteen numbered findings plus one unconfirmed webhook area and seven open areas
were carried forward. After consolidation:

- **4 confirmed security findings** need code change (F-01, F-02, F-03, F-11)
- **3 defense-in-depth findings** (F-04, F-12, F-13)
- **2 availability/quality findings** (F-05, F-14)
- **3 informational** (F-06, F-15, F-09)
- **3 false positives — no work** (F-07, F-08, F-16)
- **2 open functional/infrastructure issues** (F-10 delivery, F-09 publication)

**No CRITICAL or HIGH finding exists.** The highest confirmed severity is MEDIUM.
Nothing justifies replacing Supabase, rewriting authentication, replacing the
service-role architecture, or redesigning the UI.

The highest-value, lowest-risk change is **F-11 (patch `next` to 16.3.8)** — a
non-major bump clearing a critical advisory range.

Two items (**F-05**, rate-limiting infrastructure) require a **product/architecture
decision** and must not be decided autonomously.

---

## 2. Baseline

```text
HEAD             : 4cee3f8
Tracked changes  : none (git diff empty)
Untracked        : SECURITY_AUDIT_PHASE1.md, SECURITY_AUDIT_PHASE2.md, scripts/
Package/lockfile : unchanged
next installed   : 16.3.5
Gates            : tsc PASS / eslint PASS / vitest 778/778 / build PASS
```

**Location re-verification (read-only consolidation pass)**

| Finding | Reported location | Still present? |
| --- | --- | --- |
| F-01 | Cookies written by `createServerClient` in `src/lib/supabase/server.ts` and `middleware.ts` | **Yes** — no explicit `cookieOptions` on either client |
| F-02 | `next.config.ts` | **Yes** — exists, contains **no** `headers()` config |
| F-03 | `src/proxy.ts` | **Yes** — sign-in tests only, **no role check** |
| F-04 | All state-changing API routes | **Yes** — no origin validation located |
| F-05 | `job.service` reads `client_profiles` via the user client | **Yes** |
| F-11 | `package.json` -> `next@16.3.5` | **Yes** |
| F-12 | `messaging.service.ts` L42 `rateLimitStore` | **Yes** |
| F-14 | `api/jobs/[id]/route.ts` PATCH | **Yes** — no `jobEditSchema` in the PATCH path |

No discrepancy was found between the reports and the code.

---

## 3. Consolidated Findings

| ID | Area | Severity | Status | Evidence | Fix? | Verification |
| --- | --- | --- | --- | --- | --- | --- |
| F-01 | Session cookie | MEDIUM | **OPEN** | `Set-Cookie` = `Path`, `Expires`, `Max-Age`, `SameSite=lax`; no `HttpOnly`/`Secure` | **Yes** | Cookie-flag assertions; auth regression |
| F-02 | Security headers | MEDIUM | **OPEN** | Six headers MISSING on `/login` | **Yes** | Per-header assertions; CSP compatibility run |
| F-03 | Route role guards | MEDIUM | **OPEN** | Consultant renders `/jobs/create`, `/dashboard/client`; client renders `/dashboard/consultant` | **Yes** (additive only) | Role-guard tests **plus** unchanged API-denial tests |
| F-04 | CSRF / origin | LOW | **OPEN** | No token, no `Origin`/`Referer` check | **Yes** (defense-in-depth) | Same-origin positive + cross-origin negative |
| F-05 | Missing grants | LOW / AVAILABILITY | **OPEN** | 403/42501 on three tables; `POST /api/jobs` fails closed | **Decision** | Job-creation E2E after decision |
| F-06 | `/api/payments` role check | INFORMATIONAL | **INFORMATIONAL** | Client -> 200, empty caller-scoped data | **No** (pending contract) | Confirm product contract |
| F-07 | Sort injection | — | **FALSE POSITIVE** | `?sort=DROP TABLE` ignored | **No** | — |
| F-08 | Forum moderator role | — | **FALSE POSITIVE** | Policies use `role='admin'` only | **No** | — |
| F-09 | Realtime publication | INFORMATIONAL | **UNCONFIRMED** | `00017` reported applied; catalog unreadable | **Verify first** | Catalog query in SQL editor |
| F-10 | Realtime delivery | — | **OPEN** | `SUBSCRIBED` reached; no INSERT received | **Diagnose** | Two-context browser delivery test |
| F-11 | `next` dependency | MEDIUM | **CONFIRMED version / UNCONFIRMED exploit** | `GHSA-vcvr-r3jv-pc5j`; `16.3.5` in `>=16.2.0 <16.3.6`; `next/og` unused | **Yes** (land early) | `npm audit` + full gates + browser regression |
| F-12 | Rate limiter scope | LOW | **CONFIRMED** | Module-level `Map`; 10/min in-process | **Yes** (design first) | Multi-instance + status-code tests |
| F-13 | Rate limiting absent | LOW | **CONFIRMED (missing protection)** | No throttling outside messaging | **Yes** | Per-endpoint throttle tests |
| F-14 | Job PATCH validation | LOW | **CONFIRMED** | Invalid body -> 500 `Failed to update job` | **Yes** | Invalid PATCH returns 4xx |
| F-15 | 429 status | INFORMATIONAL | **CONFIRMED** | 201x9 then 400 | **Bundle with F-12** | Assert 429 |
| F-16 | Build-only advisories | — | **FALSE POSITIVE** | Transitive, dev-only, not shipped | **No** | — |
| WEBHOOK | Payment signature | — | **UNCONFIRMED** | Code + unit tests exist; **no live request sent** | **Verify first** | Signed/unsigned/tampered tests |
| — | DB internals catalog | — | **PARTIAL** | Migrations read; live catalog not enumerable | **Verify** | `pg_proc` query |
| — | Contracts/milestones lifecycle | — | **PARTIAL** | Read + cross-user denial only | **Verify** | Full transition test |
| — | Dependency CVEs beyond npm | — | **OPEN** | Limited to `npm audit` data | **Verify** | Re-run audit post-upgrade |
| — | Load / DoS characteristics | — | **OPEN** | Deliberately not tested | **No** (staging only) | Staged load test

---

## 4. Finding Classes

- **Confirmed security findings** — F-01, F-02, F-03, F-11.
- **Defense-in-depth** — F-04, F-12, F-13.
- **Availability / quality** — F-05 (blocks job creation), F-14 (500 instead of 4xx).
- **Informational** — F-06, F-15, F-09.
- **False positives / accepted risk** — F-07, F-08, F-16. **No remediation work.**
- **Open / unconfirmed** — F-09, F-10, webhook, DB catalog, lifecycle, broader CVEs, load.

---

## 5. Dependency Analysis

| Ordering rule | Reason |
| --- | --- |
| **F-11 first** | `next` 16.3.8 must be the version all later verification runs against, otherwise gates are re-run twice. Also the highest-severity item and a one-line change. |
| **F-02 before final security sign-off** | CSP contains any future XSS; verifying posture before CSP exists is incomplete. |
| **F-01 before final auth verification** | Cookie flags change session behaviour; auth regression must run against the final configuration. |
| **F-03 must not replace API authz** | Guards are additive. The Phase 1/2 matrices proved API denial works; re-run them **unchanged** to prove nothing weakened. |
| **F-04 after F-01** | Both touch request handling; doing cookies first avoids validating origin logic twice. |
| **F-12/F-13 need a decision first** | Shared-store choice depends on the deployment model. |
| **F-14 before final API regression** | It changes a response status; API regression must assert final behaviour. |
| **F-09 before F-10** | If `messages` is not in the publication, the delivery fix *is* the migration; diagnosing application code would be wasted effort. |
| **F-10 is a separate track** | Functional/infrastructure, not a security fix. Phase 1 proved Realtime *authorization* is sound; only delivery is broken. |
| **Webhook verification needs credentials** | Cannot start without a sandbox; independent of all other stages. |

---

## 6. Remediation Stages

**Stage A — Dependency and foundational security: F-11, F-01, F-02.**
F-11 changes the runtime under test, so later verification should run on the final
dependency set. F-01 and F-02 are transport/browser foundations; together they mean
every later stage is verified with hardened cookie and header behaviour in place.

**Stage B — Authorization hardening: F-03, F-04.**
Additive guards plus origin validation, after Stage A so they are tested on the final
stack. F-03 must preserve the API boundary, proven by re-running the existing denial
matrix unchanged.

**Stage C — API validation and abuse controls: F-14, then F-12/F-13/F-15.**
F-14 is self-contained and can start immediately. Rate limiting depends on the
infrastructure decision in section 13, so it is sequenced last here.

**Stage D — Realtime (separate track): F-09 verification, then F-10 diagnosis.**
Verification first: if publication membership is missing, that alone explains the
delivery failure. Security posture is already sound and is not redesigned.

**Stage E — Payment verification (independent): webhook sandbox verification.**
Blocked on credentials; no dependency on Stages A-D.

---

## 7. Detailed Fix Specifications

**F-11 — Upgrade `next` to 16.3.8 (MEDIUM).** Files: `package.json`, lockfile only.
No DB or Supabase impact. Removes a critical advisory; no behaviour change expected
since `next/og` is unused. Functional impact low. Regression: `npm audit`, `tsc`,
`eslint`, `vitest`, `build`, 45-check route sweep, browser regression.
Rollback: revert the two package files and reinstall.

**F-01 — Cookie `HttpOnly` and `Secure` (MEDIUM).** Files:
`src/lib/supabase/server.ts`, `src/lib/supabase/middleware.ts` (cookie options),
optionally `next.config.ts` for `Secure`. Security impact: blocks JS access to the
session token; enforces HTTPS-only transport. **Functional risk:** the client Supabase
client must still refresh tokens; if any client code reads the cookie directly,
`HttpOnly` breaks session refresh. Test this explicitly. Regression: assert
`Set-Cookie` flags on login plus full auth regression. Rollback: remove the option.

**F-02 — Security headers (MEDIUM).** File: `next.config.ts`. **Highest-risk change in
the plan:** a wrong CSP breaks the app, because Realtime uses `wss://`, images load
from `/landing-assets`, and Next.js emits inline styles and scripts.
**Validation method:** deploy **Report-Only** first, exercise every route, capture
violations, and only then enforce. Allow `style-src 'unsafe-inline'`; use nonces or
hashes for scripts; ensure `connect-src` permits `wss://*.supabase.co`.
Regression: per-header assertions plus the full browser suite in both modes.
Rollback: remove the `headers()` block.

**F-03 — Route-level role guards (MEDIUM).** File: `src/proxy.ts` (possibly
route-group layout guards). Defence-in-depth only — **API authorization remains the
boundary**. Functional risk is over-blocking: map legitimate shared routes and the
role-redirect login flow first. Regression: new role-guard tests **plus re-running the
Phase 1/2 denial matrix unchanged**. Rollback: remove the guard block.

**F-04 — Origin validation (LOW).** File: `src/proxy.ts` (single choke point) or a
shared route helper. Reject state-changing requests whose `Origin` is present and not
same-origin. **Must allow** same-origin requests **and requests with no `Origin`**
(non-browser and server-to-server clients). Rollback: remove the check.

**F-14 — Job PATCH validation (LOW).** File: `src/app/api/jobs/[id]/route.ts`. Apply
`jobEditSchema` before the write and return 400 with field detail. A strict schema may
reject payloads that currently succeed, so compare against the existing PATCH surface
first. Rollback: revert the route file.

**F-12 / F-13 / F-15 — Rate limiting (LOW / INFORMATIONAL).** Files:
`src/services/messaging.service.ts`, a new shared limiter, and API routes for F-13.
The datastore depends on the section 13 decision. Security impact is meaningful only
if the store is shared — an in-process limiter on serverless is close to cosmetic.
Regression: per-user limit, **cross-instance** limit, window reset, and a 429
assertion. Rollback: feature-flag or revert.

---

## 8. Regression Test Plan

**Authentication** — login, logout, session persistence across navigation and reload;
**assert `HttpOnly`, `Secure`, `SameSite=Lax`** on the login `Set-Cookie`; verify
token refresh still works with `HttpOnly` set; invalid and expired sessions.

**Authorization** — client, consultant and admin separation; cross-user access to jobs,
proposals, contracts, messages, notifications and reviews; **re-run the Phase 1 and
Phase 2 denial matrices unchanged** after F-03; direct API access bypassing the UI for
every endpoint in section 3.

**Jobs** — create, edit, delete and publish with ownership enforced; **invalid PATCH
returns 4xx, not 500** (F-14); draft-job privacy from a non-owner.

**Proposals, Messages, Forum** — proposal create/read/edit and cross-user denial; member
message access, non-member denial, sender ownership on edit and delete; rate limiting and
Realtime delivery; forum access, posting, ownership and admin privileges.

**Security headers** — assert each individually on `/login` and an authenticated page:
CSP (including `frame-ancestors`), `X-Frame-Options`, `X-Content-Type-Options`,
`Referrer-Policy`, `Strict-Transport-Security`, `Permissions-Policy`.

**Cookies** — assert all three attributes coexist.

**Rate limiting** — per-user behaviour, **cross-instance** behaviour, status **429**,
window reset, correct key derivation.

**Dependency upgrade (F-11)** — `npm audit` (advisory absent), `tsc`, `eslint`,
`vitest`, `build`, 45-check route sweep, browser regression.

**XSS regression (after CSP enforcing)** — re-run the Phase 2 stored and reflected
payload checks with CSP active; confirm no violations on legitimate routes.

---

## 9. Browser Verification Plan

1. Existing 45-check route sweep (anonymous, client, consultant; three viewports).
2. Messaging two-context browser test — required for the ownership regression and the
   Stage D Realtime verdict.
3. Explicit auth pass: login, dashboard, reload, logout, inspecting cookie flags.
4. CSP pass over every route in Report-Only, then enforcing.
5. Role-guard pass: each role attempting the other role's routes.
6. Verify QA residue is 0 after every run.

---

## 10. Supabase / Database Considerations

- **No schema change is required by any Stage A-C fix.** F-11, F-01, F-02, F-03, F-04
  and F-14 are application-layer only.
- F-05 is the only item that would touch grants or policies, and it is decision-gated.
- F-12/F-13 may introduce a datastore, depending on the section 13 decision.
- F-09 requires **read-only** catalog access; **no migration may be created or altered**
  until membership is confirmed.
- RLS is currently a sound backstop (Phase 1 proved a non-member receives 0 rows).
  **No RLS change is planned.**

---

## 11. Deployment Considerations

- **F-11** — rebuild with the new dependency; no config change expected.
- **F-02** — deploy to a preview first and read Report-Only violations before enforcing
  on production.
- **F-01** — `Secure` cookies mean **plain-HTTP local testing will no longer
  authenticate**. Development must run over HTTPS, or the proxy must strip `Secure` in
  development only. This is a real operational consequence.
- **F-03 / F-04** — independently deployable; verify proxy and edge behaviour.
- **F-12 / F-13** — depends on the deployment-model decision.

---

## 12. Rollback Considerations

Every Stage A-C fix is revertible by file-level revert; **none mutate stored data**.
F-01 and F-02 have environment-level consequences (HTTPS requirement, CSP breakage) and
should be individually revertible without touching the others.

---

## 13. Product / Architecture Decisions Required

**Not to be decided autonomously.**

1. **F-05 — profile/company read path.** *Option A:* grant `authenticated` SELECT with
   appropriate RLS on `client_profiles`, `companies`, `consultant_profiles`. Users
   could query these tables directly and every future column becomes directly readable.
   *Option B:* route these reads through service-role APIs with explicit authorization.
   This keeps the direct surface closed and preserves fail-closed behaviour, but adds
   application code that must itself be audited. Option B is more conservative and matches
   the existing architecture; Option A is simpler and reduces service-role usage. This is
   an architecture trade-off, not a security determination.

2. **Rate-limiting infrastructure** — the shared-store choice depends on the deployment
   model (Vercel serverless versus container). Candidates: Redis/Upstash, a Postgres
   table, or edge/WAF throttling. Requires confirmation of the target platform.

3. **Payment webhook verification** — which provider sandbox and which test credentials
   authorize a live signed or unsigned test.

4. **Realtime priority** — whether delivery is fixed before production launch or accepted
   as a known limitation, given messaging already works over HTTP.

---

## 14. Final Recommended Execution Order

```text
 1. F-11  next 16.3.5 -> 16.3.8        [isolated; full gates + route sweep + browser]
 2. F-01  cookie HttpOnly + Secure     [auth regression; confirm token refresh]
 3. F-02  security headers             [Report-Only first, then enforcing]
 4. F-03  route role guards            [additive; re-run denial matrix unchanged]
 5. F-04  origin validation            [after F-01; allow no-Origin clients]
 6. F-14  job PATCH schema             [before final API regression]
 7. F-12/F-13/F-15 rate limiting       [BLOCKED on decision 2]
 8. F-09 then F-10 Realtime            [verify publication, then diagnose delivery]
 9. F-05  grants decision              [BLOCKED on decision 1]
10. Webhook verification               [BLOCKED on decision 3]
11. Final full-gate + browser + residue verification
```

Stages A, B and C are sequential and independently revertible. Stage D (Realtime) and
Stage E (webhooks) are **independent tracks** that can run in parallel once unblocked.

---

## 15. Stop Condition

This plan is complete and **no fix has been implemented**. Next steps require explicit
approval:

```text
SECURITY REMEDIATION — IMPLEMENT FIXES STAGE-BY-STAGE WITH REGRESSION TESTS
```
