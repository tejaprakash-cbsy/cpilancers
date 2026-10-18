# Security Remediation Report — F-05 Profile/Company Grants

**Finding:** F-05 — Authenticated grants absent on `client_profiles`, `companies`, `consultant_profiles`
**Date:** 2026-03-10
**Stage:** 6
**Baseline commit:** `1d871e9` (`security: add origin validation`)
**Decision:** **OPTION B — keep the service-role API-read architecture**
**Status:** **REMEDIATED (verification-only; no application change required)**
**Commit:** *not created — awaiting approval*

---

## 1. Finding F-05

Phase 1 recorded that authenticated direct access to `client_profiles`,
`companies` and `consultant_profiles` fails closed. The remediation plan
identifies **two** valid options and requires the choice to be made from
repository evidence rather than by default.

## 2. Original finding evidence

Phase 1 observed denied access. This stage re-confirmed it against the live
database with a **real user access token** (obtained via the auth API, exactly
what a browser Supabase client holds), not a simulated one.

| Table | Authenticated direct REST read | Status |
|-------|-------------------------------|--------|
| `client_profiles` | `select=*` | **403 DENIED** |
| `companies` | `select=*` | **403 DENIED** |
| `consultant_profiles` | `select=*` | **403 DENIED** |
| `users` | `select=*` | 200 — **own row only** (1 row, id == own uid) |
| `profiles` | `select=*` | 200 — public catalogue |
| `jobs` | `select=*` | 200 — RLS-filtered |
| `proposals` | `select=*` | 200 — RLS-filtered |

Anonymously, the three private tables return **401 DENIED**.

## 3. Repository architecture findings

**Migration `supabase/migrations/00005_core_rls_hardening.sql` states the intent
explicitly (lines 25–29):**

```sql
-- These tables contain billing, payout, and private account fields. They must
-- only be read through server endpoints that project a safe response.
REVOKE SELECT ON public.users, public.companies, public.client_profiles,
  public.consultant_profiles FROM anon, authenticated;
GRANT SELECT ON public.users TO authenticated;
```

The file header adds: *"Server services use the service role for controlled
mutations. Browser clients receive read-only access subject to these ownership/
public visibility policies."*

The live behaviour matches this file exactly. The absence of grants is a
**deliberate, documented architectural decision**, not an oversight.

### Code-path evidence

Every `.from('client_profiles' | 'companies' | 'consultant_profiles')` call in
the repository lives in a **server-side** file:

| File | Refs |
|------|------|
| `profile.service.ts` | 19 |
| `payment.service.ts` | 15 |
| `contract.service.ts` | 12 |
| `route.ts` (API routes) | 10 |
| `proposal.service.ts` | 10 |
| `review.service.ts` | 4 |
| `job.service.ts` | 3 |
| `admin.service.ts` | 3 |

**Zero** occur in a client-bundle file. The browser Supabase client
(`src/lib/supabase/client.ts`) is used at exactly one call site —
`client-api.service.ts:173` — and only for `supabase.channel(...).subscribe()`
Realtime. It performs **no `.from()` query at all**.

`/consultants/[id]` loads through `ClientProfileService` → `fetch('/api/profile/
consultants/[id]')` → `ProfileService.getPublicConsultantProfile()`, which uses
`createAdminClient()`.

### Service-role containment

- No `NEXT_PUBLIC_`-prefixed secret or service-role key exists.
- `createAdminClient()` is imported only by API routes, `src/services/*` and tests.
- `messaging.service.ts` imports it, but that module is imported **only** by API
  routes and tests — never a client component.
- **Built-bundle scan:** the `sb_secret_…` key appears in **no** file under
  `.next/static`. Confirmed absent from every client chunk.

## 4. Evidence table

| Table | Direct authenticated read needed? | Current API read? | Sensitive fields | Existing RLS | Option A need? | Option B viable? |
|-------|----------------------------------|-------------------|------------------|--------------|----------------|------------------|
| `client_profiles` | **No** — no client code queries it | `GET/POST/PATCH /api/profile`, `/api/profile/clients/[id]` (service role) | `billing_email`, `department` | RLS enabled; **no SELECT grant** | **None demonstrated** | **Yes** |
| `companies` | **No** — no client code queries it | via `/api/profile` and `/api/profile/clients/[id]` | `tax_identifier` | RLS enabled; **no SELECT grant** | **None demonstrated** | **Yes** |
| `consultant_profiles` | **No** — no client code queries it | `/api/profile/consultants/[id]` (service role) | rate/internal fields | RLS enabled; **no SELECT grant** | **None demonstrated** | **Yes** |
| `users` (control) | Yes — own row | `/api/auth/me` | — | `users_select_self USING (id = auth.uid())` + SELECT grant to `authenticated` | already granted | Yes |

**No row shows a demonstrated need for a direct authenticated read.**

## 5. Option A analysis — add authenticated grants

**Not selected.** What the repository shows:

- **No consumer.** Zero client-bundle `.from()` calls target these tables. A
  grant would grant access that nothing uses.
- **It would widen exposure for no functional gain.** `client_profiles` holds
  `billing_email`; `companies` holds `tax_identifier`. Today even an
  authenticated attacker gets **403 / zero rows**. After an `authenticated
  SELECT` grant, PostgREST would serve whole rows unless every column were
  separately protected — RLS filters *rows*, not *columns*.
- **Public consultant profiles are already served safely.** The public page works
  through an authorised API that projects an explicit column list. Option A would
  duplicate that projection at the database layer and re-implement in SQL what
  the service already does correctly.
- **Least privilege is currently stronger.** Adding a grant can only reduce the
  protection; it can never increase it.

There is no evidence of a planned direct-read feature, no TODO referencing it,
and no client code that would begin working.

## 6. Option B analysis — keep the service-role API-read architecture

**Selected.** Verified properties:

| Requirement | Evidence |
|-------------|----------|
| Direct authenticated access to all three tables denied | **403** on each, with a real token, and **403 again after real rows were created** |
| APIs authenticate callers | `GET /api/profile` → **401** unauthenticated, **200** authenticated |
| APIs authorize callers | `getProfileBundle(user.id)` scopes every query to the caller's own `user_id` / `company_id` |
| Responses contain only intended fields | public projections verified live — see below |
| Cross-user access denied | outsider bundle contains **no** other user's id; consultant bundle contains **no** client id |
| Public consultant data intentionally filtered | explicit column list, `verification_status='verified'` filter on certifications |
| Company information appropriately scoped | `tax_identifier` excluded from the public projection |
| Service-role confined to server | no `NEXT_PUBLIC_` secret; admin client imported only by routes/services/tests; absent from `.next/static` |

## 7. Security comparison

| | Option A | Option B (selected) |
|---|---|---|
| Private tables reachable by a compromised session token | Yes, whole rows | **No — 403** |
| `billing_email` / `tax_identifier` exposure risk | RLS cannot mask columns | **None — never leaves the DB layer** |
| Attack surface | PostgREST endpoint per table | One authenticated API surface, already audited |
| Defence in depth | One more layer | Already 3 layers: proxy auth → API authz → RLS |

## 8. Least-privilege comparison

Option B is strictly tighter. The only authenticated grant on any of these tables
is `users`, and it was verified **own-row only**: selecting other users returns
**0 rows** for both client and consultant, and the reachable columns are
`id, email, role, status, is_email_verified, phone_number, last_login_at,
created_at, updated_at` — no billing data. Writes to all three private tables
return **403** for both INSERT and UPDATE.

Option A would move three tables from "no grant" to "granted", i.e. in the wrong
direction.

## 9. Data-exposure comparison

| Endpoint | Projection | `billing_email` | `tax_identifier` | `department` |
|----------|-----------|----------------|------------------|--------------|
| `GET /api/profile/consultants/[id]` (public) | `profile, consultant, skills, certifications, portfolios` | absent | absent | absent |
| `GET /api/profile/clients/[id]` (public) | `client: {id, company_id, job_title}` + company without `tax_identifier` | **absent** | **absent** | **absent** |
| `GET /api/profile` (own only) | full own bundle | present — **own data to the owner** | present — **own data to the owner** | present — own |

Verified live, not only by reading code: the public client endpoint returned
`{"client":{"id","company_id","job_title"},"company":{…no tax_identifier…}}`
and the leak check returned `billing_email=false tax_identifier=false
department=false`.

### One observation (not a finding, not fixed here)

`getProfileBundle` uses `companies.select('*')` and `client_profiles.select('*')`,
so an owner receives their own `tax_identifier` and `billing_email`. This is
**own data returned to the authenticated owner** through an authenticated,
own-scoped endpoint — not a cross-user exposure — so it does not weaken anything.
It is, however, looser than the explicit projections used by the public
endpoints. It is recorded here for a future consistency pass and was **deliberately
not changed** in this stage, as that is outside F-05's scope and would be an
unrequested functional change.

## 10. Implementation / maintenance comparison

Option A adds a migration plus per-table policies that must stay in sync with the
API projections — two places to update whenever a sensitive column is added. Option
B keeps one enforcement point. Given no feature consumes a direct read, Option A
is strictly more surface for zero benefit.

## 11. Decision

**OPTION B — keep the service-role API-read architecture.**

The repository answers this question directly: migration `00005` documents the
revocation and its reason, the live grants match that file exactly, and no
client-side code reads any of the three tables. The absence of grants is the
intended design and is currently holding.

This was **not** a judgement call between two viable options — Option A has no
demonstrated consumer and would move three tables toward broader exposure.

## 12. Implementation performed

**None — verification only.** No migration, no RLS change, no application code
change, no new file other than this report.

- Tables changed: **none**
- Policies changed: **none**
- APIs modified: **none** (audited only)
- `git diff` against `1d871e9`: **empty**

## 13. Direct authenticated-access results

Measured with a genuine `access_token`, before **and** after creating real rows:

| Table | Before fixtures | After fixtures | INSERT | UPDATE |
|-------|-----------------|----------------|--------|--------|
| `client_profiles` | 403 | **403** | 403 | 403 |
| `companies` | 403 | **403** | 403 | 403 |
| `consultant_profiles` | 403 | **403** | 403 | 403 |

The denial is a **grant** denial (`42501`), not merely an empty result set.

## 14. Cross-user results

| Check | Result |
|-------|--------|
| `users` — own row only | 1 row, id == own uid |
| `users` — client reading other users | **0 rows** |
| `users` — consultant reading other users | **0 rows** |
| outsider `GET /api/profile` bundle contains another user's id | **false** |
| consultant bundle contains the client's user id | **false** |

## 15. Test results

| # | Test | Result |
|---|------|--------|
| 1 | `npx tsc --noEmit` | **PASS** (exit 0) |
| 2 | `npx eslint . --max-warnings=0` | **PASS** (exit 0) |
| 3 | `npx vitest run` | **PASS — 798/798** (31 files) |
| 4 | `npm run build` | **PASS** — `next-build (v16.3.8)` |
| 5 | Route sweep | **45/45 PASS, 0 FAIL** |
| 6 | Direct authenticated/anon table access | **403 / 401 — as designed** |
| 7 | Cross-user isolation | **PASS** |
| 8 | Sensitive-field exposure | **PASS** — none leaked publicly |
| 9 | Service-role not in client bundle | **PASS** — absent from `.next/static` |
| 10 | Profile functionality (view/edit own) | **PASS** |
| 11 | Authorization + security regression | **38/38** + **201/201** |
| 12 | Browser regression | **12 PASS / 4 FAIL** — unchanged |
| 13 | F-01 / F-02 / F-03 / F-04 regression | **PASS** — 21/21 |

> One methodology note: an early draft of the grant test printed "DENIED" for
> every table because of a JavaScript operator-precedence bug in the logging
> expression (`'  ' + denied ? …`), which made the output constant. It was
> re-run correctly before any result was recorded; the table above is the real
> output. An earlier public-endpoint leak check was likewise vacuous (404 from
> placeholder IDs), so real profile rows were provisioned through the
> application API and the check was repeated against real data.

## 16. Prior-stage regressions

| Stage | Result |
|-------|--------|
| **F-01** cookies | `HttpOnly=true Secure=true SameSite=Lax path=/` for both roles — intact |
| **F-02** headers | all six present, CSP enforced — intact |
| **F-03** role guards | client/consultant matrix unchanged; `/proposals/new/[jobId]` still consultant-only |
| **F-04** Origin validation | same-origin mutation **200**, hostile Origin **403** — intact |

## 17. Realtime

Not touched. Browser suite **12 PASS / 4 FAIL**, the same four pre-existing **F-10**
delivery failures. **F-09 and F-10 remain OPEN.**

## 18. Files changed

| File | Status |
|------|--------|
| `SECURITY_REMEDIATION_F05_REPORT.md` | **new** — this report |

**No application, migration, RLS, config or dependency file was modified.**
`git diff` against `1d871e9` is empty.

## 19. Final status

**REMEDIATED — Option B.** The finding is closed on the basis that the existing
architecture is the intended and correct design, verified rather than assumed:
the revocations are documented, the live grants match, no client code needs a
direct read, the public projections exclude every sensitive field, and the
service-role credential is absent from the client bundle.

Nothing staged or committed. Awaiting explicit approval before committing.