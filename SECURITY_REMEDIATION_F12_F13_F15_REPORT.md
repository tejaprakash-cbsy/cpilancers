# Security Remediation Report — F-12 / F-13 / F-15 Rate Limiting

**Findings:** F-12 (in-process limiter) · F-13 (no application rate limiting) · F-15 (400 instead of 429)
**Date:** 2026-03-10
**Stage:** 7
**Baseline commit:** `35ca199` (`security: document F-05 access-control decision`)
**Architecture decision:** **CONFIRMED — Vercel serverless, shared Redis-compatible limiter (Upstash)**
**Status:** **BLOCKED — UPSTASH CONFIGURATION REQUIRED**
**Implementation performed:** **NONE**

> ## Why this stage stopped
>
> The architecture decision is now settled and recorded. Implementation did not
> begin, because **no Upstash credentials exist in this environment** and your
> rule is explicit: do not invent them, do not fake `.env` values, do not
> substitute Postgres, and stop before implementation.
>
> **Credential audit — every location checked:**

| Source | `UPSTASH_REDIS_REST_URL` | `UPSTASH_REDIS_REST_TOKEN` |
|--------|------------------------|---------------------------|
| `.env.local` | absent | absent |
| `.env.development` | absent | absent |
| `.env.production` | absent | absent |
| `.env.staging` | absent | absent |
| `.env.example` | absent | absent |
| process environment | absent | absent |
| user-scoped environment | absent | absent |
| machine-scoped environment | absent | absent |

No Redis-compatible SDK is installed either (`@upstash/*`, `redis`, `ioredis`:
none present). The **npm registry is reachable** — `@upstash/ratelimit@2.2.0` and
`@upstash/redis@1.39.0` are available — so the blocker is **credentials only**,
not network access.

### What implementing anyway would have meant

With no credentials, every limiter call would fail and, under the agreed
**fail-open** policy, **allow every request** — the application would appear to
have rate limiting while enforcing none. The mandatory two-instance distributed
test, the 429/`Retry-After` behaviour, and the messaging 11th-message check would
all be unverifiable. Claiming F-12 remediated on that basis would be false: an
in-memory fallback behind a Redis-shaped interface is exactly the single-instance
limiter F-12 exists to eliminate.

### To unblock

Provide a real Upstash (or Redis-compatible REST) endpoint and token as
environment variables in the deployment — `UPSTASH_REDIS_REST_URL` and
`UPSTASH_REDIS_REST_TOKEN`, server-only, never `NEXT_PUBLIC_`-prefixed. They must
be supplied out of band and must not be committed. Once present, the full
implementation in §12–§14 can proceed as specified.

---

## 1. F-12 finding

The messaging rate limiter is a module-level in-process `Map`. It works within
one process but is not shared across serverless instances, concurrent instances,
cold starts or multiple deployment instances.

## 2. F-13 finding

No application-level rate limiting exists for abuse-sensitive operations:
login, registration, password reset, job creation, proposal submission, forum
discussion creation, conversation creation.

**F-13 remains LOW.** No load/DoS test demonstrated an actual outage, and none was
attempted. It is not upgraded to a demonstrated DoS finding.

## 3. F-15 finding

Rate-limit rejections return HTTP **400** rather than **429 Too Many Requests**.

**Confirmed empirically** (controlled burst, QA fixtures only):

```
msg  1..10 -> HTTP 201
msg 11     -> HTTP 400  VALIDATION_ERROR  Retry-After: (absent)
msg 12..13 -> HTTP 400  VALIDATION_ERROR  Retry-After: (absent)
```

Matches the recorded observation "201x9 then 400".

## 4. Baseline

`35ca199`. Working tree confirmed clean before and after — no implementation begun.

## 5. Deployment architecture — **undeterminable from the repository**

| Artifact | Present? |
|----------|----------|
| `vercel.json` | **absent** |
| `Dockerfile` / `docker-compose.yml` | **absent** |
| `netlify.toml` / `fly.toml` / `render.yaml` / `railway.json` | **absent** |
| `Procfile` / `app.yaml` / `.vercelignore` | **absent** |

No deployment configuration of any kind is committed. The project's own
`build_report.py` records: *"Deployment and observability configuration — The
application has never been deployed; no deployment configuration in repository."*

**Decisively, `SECURITY_REMEDIATION_PLAN.md` (Open Decisions, §2) states:**

> *"**Rate-limiting infrastructure** — the shared-store choice depends on the
> deployment model (Vercel serverless versus container). Candidates: Redis/Upstash,
> a Postgres table, or edge/WAF throttling. **Requires confirmation of the target
> platform.**"*

| Question | Answer from repo |
|----------|------------------|
| Designed for serverless? | **Unknown** — no artifact either way |
| Routes that can run concurrently? | Potentially all, but deployment unknown |
| Existing shared-state mechanism? | **None** for rate limiting |
| External Redis-compatible service present? | **No** |
| Upstash configured/installed? | **No** — absent from deps and env |
| Edge/WAF configuration? | **None** |
| Deployment env vars available? | **None** related to rate limiting |
| Suitable injection point for a limiter? | **Yes** — `src/lib/security/` already holds the F-04 origin helper |

## 6. Existing rate-limit inventory

| Endpoint / category | Current protection | Limiter | Scope | Distributed? | Abuse impact |
|---|---|---|---|---|---|
| `POST /api/messages/conversations/[id]/messages` | **10 messages / 60 s** | module-level `Map` (`messaging.service.ts:40–42`) | per `user.id` | **No** | spam, DB growth, notification cost |
| All other state-changing endpoints | **none** | — | — | No | login brute force, registration/email abuse, job & proposal spam, forum spam |

`RATE_LIMIT_MESSAGES_PER_MINUTE = 10`, `RATE_LIMIT_TIME_WINDOW_MS = 60000`,
`rateLimitStore: Map<string, {count, resetTime}> = new Map()` — module scope, so it
resets on every cold start and is per-instance.

No Redis, Upstash, `@upstash/*`, or `redis` dependency exists. `src/lib/errors.ts`
has **no** rate-limit error class and no 429 status anywhere in the API surface.

## 7. Option A — in-process memory

Current approach.

- **Simplicity:** highest; no dependencies, no migrations, no credentials.
- **Cold starts:** each new serverless instance starts with an **empty** map, so
  the quota resets.
- **Multi-instance bypass:** a caller is limited *per instance*. With N instances
  the effective limit becomes **~10 × N / min**. On Vercel this is the normal case.
- **Memory growth:** bounded by `cleanupRateLimits()`, but that helper is
  exported and **never invoked anywhere** — so entries only expire logically,
  never physically, for the process lifetime.
- **Correctness:** correct on a single long-lived process only.

**Verdict: not viable for the distributed case (F-12), and it is precisely the
finding.** Would only be acceptable if evidence showed single-process deployment —
and no such evidence exists.

## 8. Option B — Postgres-backed limiter

- **Atomicity:** achievable with `INSERT … ON CONFLICT … DO UPDATE … RETURNING`,
  which makes the increment atomic across instances.
- **Concurrency:** correct; each request is one upsert.
- **Cleanup:** needs a TTL/retention policy and either a scheduled job or
  opportunistic deletion.
- **Storage growth:** one small row per identity per window.
- **Transaction contention:** a hot key (one IP hammering `/api/auth/login`)
  serialises on that row. Modest and bounded by Supabase's throughput, but it is
  a write on the **most** abuse-sensitive path.
- **Query volume:** +1 upsert per rate-limited request.
- **Supabase / serverless compatibility:** excellent — already a hard dependency;
  service-role access exists on every request path.
- **Failure behaviour:** a database error must be handled explicitly (fail-open
  vs fail-closed is a policy choice, §13).
- **Cost:** requires a **migration** — a schema commitment.

**Verdict: the only option that is correct under *every* deployment model, and it
needs no new credentials. Its cost is a migration the plan explicitly deferred.**

## 9. Option C — Redis / Upstash

- **Serverless compatibility:** the intended fit for Vercel; atomic counters via
  `INCR` + `EXPIRE`, sub-millisecond.
- **Latency / operational complexity:** best-in-class; lowest DB pressure.
- **Credentials:** **none exist.** No Upstash/Redis account, keys or env vars are
  present in the repository.
- **Cost/dependency impact:** requires installing `@upstash/ratelimit` or
  `@upstash/redis` — a new runtime dependency.
- **Failure behaviour:** needs a documented fail-open/fail-closed decision.

**Verdict: architecturally the best choice *if* the target is Vercel serverless,
but it cannot be implemented today** — it would require creating an external
account and inventing credentials, which is explicitly forbidden
(*"do NOT invent credentials"*).

## 10. Option D — edge / WAF limiting

- **Coverage:** excellent for volumetric IP-based floods and unauthenticated
  credential stuffing at the network edge.
- **Authenticated identity:** generally cannot incorporate the session user id,
  so it cannot express per-user business limits (e.g. 10 messages/min).
- **API-specific limits:** not expressible at a generic WAF.
- **Relationship:** **complements**, never replaces, application-level limiting.
- **Configuration:** **none exists** — no WAF/edge product is configured, and none
  can be configured without a platform.

**Verdict: unavailable today**; worth layering on later for volumetric protection
once a platform exists.

## 11. Selected architecture — **Upstash Redis (CONFIRMED), implementation BLOCKED**

**Deployment decision confirmed:** Vercel / Next.js serverless. This supersedes the
earlier "platform unknown" position.

**Selected:** a shared Redis-compatible limiter via **Upstash**, with
`@upstash/ratelimit` over `@upstash/redis` for atomic counters and TTL windows —
the standard fit for Vercel serverless, where per-instance state is not shared.

**Status: BLOCKED — UPSTASH CONFIGURATION REQUIRED.** No credentials exist (see
header). Per your instruction, Postgres was **not** substituted automatically.

### Why the in-process `Map` was rejected

It is per-instance and per-cold-start, so the effective limit becomes roughly
`limit × instance count`; on Vercel, instance count is high and elastic. It is
also the literal subject of F-12, and `cleanupRateLimits()` is exported but never
called, so entries never physically expire.

### Why Postgres was not selected

It would work under any deployment model and needs no credentials, but your
instruction reserves it unless a concrete technical blocker prevents Redis. No such
blocker exists, and a table would add write contention on the hottest abuse path
(login) plus a migration.

### Why edge/WAF is not the primary mechanism

It cannot express per-user business limits (10 messages/min per user id), cannot
read the authenticated session identity, and is complementary for volumetric
protection later rather than a replacement.

### Dependencies (identified, NOT installed)

| Package | Latest | Purpose |
|---------|--------|---------|
| `@upstash/redis` | 1.39.0 | Redis REST client |
| `@upstash/ratelimit` | 2.2.0 | sliding-window limiter over Redis |

Both are server-only. Credentials must never use a `NEXT_PUBLIC_` prefix.

## 12. Rate-limit policy design (proposed — **not implemented**)

Drafted from observed application behaviour so it can be reviewed alongside the
architecture choice. Numbers are **proposals requiring approval**, not applied
limits. Identity keys use the **server-side session user id** where available and
an IP fallback only where unauthenticated — never a client-supplied header,
query value or cookie.

| Operation | Identity | Window | Max | Rejection | Notes |
|-----------|----------|--------|-----|-----------|-------|
| `POST /api/auth/login` | IP (+ email as secondary key) | 15 min | 10 | 429 | brute-force; must not lock QA fixtures permanently |
| `POST /api/auth/register` | IP | 1 h | 5 | 429 | protects the email provider quota |
| `POST /api/auth/reset-password` | IP + email | 1 h | 5 | 429 | prevents email-bombing |
| `POST /api/messages/.../messages` | user id | 1 min | **10** | 429 | **preserves the existing intended limit** |
| `POST /api/messages/conversations` | user id | 1 h | 20 | 429 | |
| `POST /api/jobs` | user id | 1 h | 20 | 429 | |
| `POST /api/proposals` | user id | 1 h | 20 | 429 | |
| `POST /api/forum/discussions` | user id | 1 h | 20 | 429 | |

GET/HEAD endpoints are deliberately **not** limited.

## 13. Identity strategy and failure mode (proposed)

- **Authenticated:** server-derived `user.id` from the verified session. Never a
  request header, query parameter or client cookie.
- **Unauthenticated:** client IP from the platform-provided request object
  (`x-forwarded-for` is only trustworthy because a reverse proxy sets it; this
  must be confirmed with the platform choice — another reason the decision blocks).
- **Failure mode — recommended FAIL-OPEN with logging.** A limiter outage must
  not become an availability incident for auth or messaging. Authentication,
  Origin validation, role guards, ownership and RLS remain in force regardless,
  so failing open does not create an auth bypass. Fail-closed is defensible for
  login brute-force only, and is an explicit choice to record.

## 14. 429 / Retry-After behaviour (proposed)

A `RateLimitError extends AppError` with `statusCode: 429` and code
`RATE_LIMITED`, returning the standard error envelope plus a `Retry-After:
<seconds>` header. No unrelated 400 responses would change. No limiter internals,
store names or counts are exposed to the client.

`src/lib/errors.ts` currently has **no** 429-capable class, so this is new work.

## 15. Testing performed

| Test | Result |
|------|--------|
| `npx tsc --noEmit` | **PASS** |
| `npx eslint . --max-warnings=0` | **PASS** |
| `npx vitest run` | **PASS — 798/798** (31 files) |
| Route sweep | **45/45 PASS** |
| Controlled limiter burst (QA fixtures, 13 messages) | 201 ×10, then **400** ×3, no `Retry-After` |

**No load/DoS test was performed**, per instruction. Traffic was confined to QA
fixtures; no external users or production data were affected.

Rate-limit unit tests, the two-instance distributed test, and the concurrency test
were **not written**, because there is no implementation to test.

## 16. Regression status (prior stages untouched)

| Stage | Result |
|-------|--------|
| F-01 cookies | intact (`HttpOnly`/`Secure`/`Lax`/`path=/`) — verified in F-05 stage, tree unchanged since |
| F-02 headers | intact, CSP enforced |
| F-03 role guards | intact |
| F-04 Origin validation | intact |
| F-05 grants/RLS | untouched |
| Authorization + security suites | **38/38** + **201/201** (in the 798) |
| Browser regression | **12 PASS / 4 FAIL** baseline, unchanged |
| Realtime | untouched — **F-09/F-10 remain OPEN** |

## 17. Files changed

| File | Status |
|------|--------|
| `SECURITY_REMEDIATION_F12_F13_F15_REPORT.md` | **new** — this report |

**No application code, migration, configuration or dependency file was modified.**
`git diff` against `35ca199` is empty.

- **Dependencies added:** none
- **Environment variables required:** none
- **Migrations created:** none

## 18. Final statuses

| Finding | Status |
|---------|--------|
| **F-12** | **BLOCKED — UPSTASH CONFIGURATION REQUIRED.** The in-process `Map` remains. Architecture is settled (Upstash); implementation cannot start or be verified without real credentials. |
| **F-13** | **BLOCKED — UPSTASH CONFIGURATION REQUIRED.** No application-level limiting added. Remains **LOW**; not upgraded, and no DoS was demonstrated or attempted. |
| **F-15** | **BLOCKED — UPSTASH CONFIGURATION REQUIRED.** Rejections still return 400 with no `Retry-After`, confirmed live. Deliberately not patched in isolation: it must be introduced together with the shared limiter rather than as a throwaway change to the `Map` that F-12 is about to retire. |

### Classification of work state

| Category | Items |
|----------|-------|
| **Implemented and verified** | none — no code was written |
| **Configured but not externally verified** | architecture decision only (Vercel + Upstash) |
| **Blocked by missing infrastructure** | F-12, F-13, F-15 — all require `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` |

Nothing staged or committed. No credential was invented, no `.env` value faked,
and Postgres was not substituted. Awaiting credentials before implementation.