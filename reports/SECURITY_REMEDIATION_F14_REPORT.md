# Security Remediation Report — F-14 Job PATCH Validation

**Finding:** F-14 — Invalid Job PATCH input returns HTTP 500 instead of a client validation error
**Date:** 2026-03-10
**Stage:** 8
**Baseline commit:** `35ca199` (`security: document F-05 access-control decision`)
**Status:** **REMEDIATED**
**Commit:** *not created — awaiting approval*

---

## 1. Finding summary

Phase 2 recorded that an invalid Job PATCH such as:

```json
{ "budget_fixed_cents": -999999, "title": "" }
```

returned **HTTP 500** with a generic error body instead of a controlled client
error. The suspicion was that `jobEditSchema` was never applied on this path.
**The suspicion was correct.**

## 2. Baseline

`35ca199`. Verified clean before starting.

## 3. Root cause

`src/app/api/jobs/[id]/route.ts` `PATCH` passed the body straight through:

```ts
const job = await JobService.updateJob(getId(request), user.id, await request.json());
```

`JobService.updateJob` had a column **allowlist** and a status-transition state
machine, but **no value validation at all**. Invalid values therefore reached
Postgres, and the resulting failure was consumed by the generic branch:

```ts
if (error) { console.error('[DB Error - Update Job]:', error); throw new AppError('Failed to update job', 500); }
```

The database error was being used as the validation layer. The `jobs` table
(`supabase/migrations/00001_initial_schema.sql`) enforces:

```sql
CONSTRAINT chk_job_budget CHECK (
  (budget_type = 'fixed_price' AND budget_fixed_cents IS NOT NULL AND budget_fixed_cents > 0) OR ... )
```

so `budget_fixed_cents = -999999` violated the CHECK and surfaced as a 500 —
telling the client the *server* had a fault for what was purely bad input.

**A worse case was also found than the one reported.** `title` is
`TEXT NOT NULL` with no length CHECK, so `{"title": ""}` violated nothing and was
**silently persisted with HTTP 200**. The audit's 500 masked the fact that some
invalid input was accepted outright.

## 4. Existing schema used

`jobEditSchema` from `src/lib/validations/job.schemas.ts`
(`jobCreateSchema.partial()`). **Reused as-is** — not duplicated, not weakened,
not redesigned. It already constrains:

| Field | Constraint |
|-------|-----------|
| `title` | string, 5–200 chars |
| `description_markdown` | string, 50–10 000 chars |
| `budget_fixed_cents` | integer, 100 – 10 000 000 |
| `estimated_duration_weeks` | integer, 1–52 |
| `integration_type` | enum `p2p\|a2a\|b2b\|batch\|realtime\|event_driven\|hybrid` |

The schema was **not modified** — the defect was its absence on this path, not
its content.

## 5. Exact implementation change

Two edits, both in `src/services/job.service.ts`.

**1. Validate before the write**, immediately after the ownership check:

```ts
const ownership = await resolveJobOwnership(id);
if (!ownership || ownership.userId !== userId) throw new AppError('You do not own this job', 403);
jobEditSchema.parse(data);          // <— added
```

**2. Let the `ZodError` escape** the generic catch:

```ts
if (error instanceof AppError) throw error;
if (error instanceof z.ZodError) throw error;   // <— added
console.error('[JobService.updateJob]:', error);
throw new AppError('Failed to update job', 500);
```

**The second edit is essential, and was found by testing.** Without it the
`ZodError` thrown by `parse()` was caught by `updateJob`'s own catch and
re-wrapped as `AppError('Failed to update job', 500)` — reproducing the exact
bug the change was meant to fix. Only the two together produce a 400.

### Two deliberate placement decisions

- **After** the ownership check, so an unauthorized caller still receives 403
  regardless of body content. Validation therefore cannot be used to probe, and
  the 403 is not converted into a 400.
- **The original `data` continues below, not the parse result.** `jobEditSchema`
  strips keys it does not model, and two such keys are legitimate:
  `status` (sent by `publishJob`/`closeJob`) and `deliverables_markdown` (a real
  column the schema omits). Passing the parsed output would have silently broken
  publishing, closing and the description edit. Those remain governed by the
  existing allowlist and status-transition rules.

## 6. Validation behaviour — before vs after

Measured live against the production build with a QA fixture job.

| Request | Before | After |
|---|---|---|
| `{budget_fixed_cents:-999999, title:""}` (audit payload) | **500** | **400 VALIDATION_ERROR** |
| `{budget_fixed_cents:-1}` | **500** | **400** |
| `{title:""}` | **200 — silently persisted** | **400** |
| `{budget_fixed_cents:"lots"}` | **500** | **400** |
| `{integration_type:"middleware"}` | **500** | **400** |
| `{title:"…valid…"}` | 200 | **200** |
| `{status:"open"}` (publish) | 200 | **200** |
| malformed JSON | 400 | **400** (existing `INVALID_JSON`) |
| unauthenticated | 403 | **403** |
| consultant | 403 | **403** |

Response body uses the existing convention with field-level detail:

```json
{"success":false,"error":{"message":"Validation failed","code":"VALIDATION_ERROR",
 "details":[{"field":"budget_fixed_cents","code":"too_small","message":"Budget must be at least $1.00"}]}}
```

## 7. Test cases

New `src/tests/job-patch-validation.test.ts` — **13 tests, all passing**. It
drives the real route and the real `JobService`, mocking only the Supabase
clients (the same arrangement `jobs-authorization.test.ts` uses), and its fake
database **enforces the real `chk_job_budget`, NOT NULL and enum constraints** so
the test would fail against the old behaviour.

Covered: valid update · empty title · negative budget · wrong type · invalid enum
· malformed JSON · status transitions still enforced · mass assignment ignored ·
unauthenticated 403 · consultant 403 · cross-user 403 with no state change ·
validation does not mask ownership failure · genuine DB fault still 500.

## 8. State-integrity results

Every rejected request left the row untouched, verified by reading the job back:

| Case | State after rejection |
|---|---|
| `{budget_fixed_cents:-999999, title:""}` | title and budget unchanged |
| `{title:""}` | title unchanged (previously corrupted to `""`) |
| invalid enum / wrong type | unchanged |
| cross-user PATCH | title unchanged, no write attempted |

**Mass assignment** was attempted with `owner_id`, `user_id`, `client_id`,
`created_at` and `role`. All were ignored; `client_id` remained the real owner
profile. The pre-existing allowlist — not this change — is what prevents them.

## 9. Full test results

| Test | Result |
|---|---|
| `npx tsc --noEmit` | **PASS** (exit 0) |
| `npx eslint . --max-warnings=0` | **PASS** (exit 0) |
| `npx vitest run` | **PASS — 811/811** (32 files; 798 + 13 new) |
| `npm run build` | **PASS** — `next-build (v16.3.8)` |
| Route sweep | **45/45 PASS, 0 FAIL** |
| Authorization/security suites | **38/38** + **190/190** |

## 10. Previous remediation regression

| Stage | Result |
|---|---|
| **F-01** cookies | `HttpOnly=true Secure=true SameSite=Lax path=/` for both roles — intact |
| **F-02** headers | all six present, CSP enforced — intact |
| **F-03** role guards | client/consultant matrix unchanged; `/proposals/new/[jobId]` still consultant-only — intact |
| **F-04** Origin validation | no-Origin allowed (200), same-origin allowed (200), hostile Origin rejected (403) — intact |
| **F-05** core-table access | `client_profiles`, `companies`, `consultant_profiles` all still **403** to a direct authenticated REST read — intact |

17/17 browser-side assertions passed across these stages.

## 11. Browser regression

**12 PASS / 4 FAIL** — exact baseline. The four failures are the pre-existing
**F-10** Realtime delivery defects. Realtime was not modified and no evidence
links them to F-14.

## 12. Files changed

| File | Status |
|------|--------|
| `src/services/job.service.ts` | modified — 2 logical additions (+ import) |
| `src/tests/job-patch-validation.test.ts` | **new** — 13 tests |
| `SECURITY_REMEDIATION_F14_REPORT.md` | **new** — this report |

No route handler, schema, migration, RLS, cookie, CSP, dependency or Realtime
file was changed. `jobEditSchema` was reused unchanged.

## 13. Pre-existing defect found — NOT fixed (outside F-14 scope)

While building the fixture I found that **`POST /api/jobs` is currently broken
for every client**.

`JobService.createJob` reads the caller's client profile through the
**RLS-scoped** client:

```ts
const supabase = await createClient();          // cookie-scoped, anon key
const { data: clientProfile } = await supabase.from('client_profiles').select('id, company_id')...
```

Since `client_profiles` deliberately has **no authenticated SELECT grant** (the
F-05 Option B posture), this always returns a permission error and the request
fails with `"Client profile not found"`.

This is **pre-existing and unrelated to F-14** — it is not caused by this change,
and F-05 altered no grants. It is reported here rather than fixed because it is a
separate functional defect with a different correct fix (use the service-role
client or derive ownership in the route, as `updateJob` already does), and
silently changing job-creation behaviour is outside F-14's mandate.

For F-14 testing the fixture job was seeded directly with the service-role
client; no production data was touched.

## 14. Remaining statuses

| Finding | Status |
|---------|--------|
| **F-14** | **REMEDIATED** |
| **F-12 / F-13 / F-15** | **BLOCKED — UPSTASH CONFIGURATION REQUIRED**, unchanged by this stage. No Upstash/Redis dependency installed, no Redis env vars added, no rate-limit migration, messaging limiter untouched, no auth or mutation rate limits added, and no 400 → 429 change made. |
| **F-09 / F-10** | **OPEN** — Realtime publication and delivery, unchanged. |

Nothing staged or committed. Awaiting explicit approval before committing.