# Remaining Application Surface — Security Audit

> **AUDIT ONLY.** No source, migration, RLS, cookie, CSP, authentication, Realtime,
> dependency or environment file was modified. No finding was fixed. Nothing staged,
> nothing committed. The only new file is this report.

---

## 1. Scope

Broad read-only audit of the application attack surface **excluding** the deferred
findings (F-09, F-10, F-12, F-13, F-15). Targets issues provable from repository code
or reproducible with existing QA infrastructure, without new credentials.

## 2. Baseline

| | |
|---|---|
| HEAD | `070dca117ddb54906363622b1b1bb1adfb810723` (`070dca1`) |
| Working tree | Clean of tracked modifications; nothing staged |

Closed: F-11, F-01, F-02, F-03, F-04, F-05, F-14.

## 3. Methodology

Static enumeration of all 69 API route files (97 handlers); per-handler auth /
role / validation matrix; targeted review of authorization, validation, mass
assignment, data exposure, error handling, storage, XSS sinks, redirects, SSR
boundaries, business logic, secrets and RLS. Live verification against a production
build (`next start` on :3111) using existing QA fixtures — three authenticated roles,
benign probes only, no destructive payloads.

**A note on false positives.** Automated pattern-matching produced 11 initial flags.
Every one was individually traced to its source and **rejected** on evidence
(§5.4). Reporting them as findings would have been wrong.

---

## 4. API inventory summary

**69 routes / 97 handlers** (52 GET, 27 POST, 13 PATCH, 5 DELETE).

| Area | Routes | Auth model |
|---|---|---|
| `/api/admin/*` | 16 | `requireAdminUser` → session identity; role re-read in DB by `AdminService.requireAdmin` |
| `/api/auth/*` | 5 | login/register/reset unauthenticated by design; callback OTP-verified |
| `/api/profile/*` | 16 | own-profile mutations; public projections read-only |
| Payments | 12 | webhook signature-verified (HMAC-SHA256, raw body) |
| Jobs / proposals / contracts / milestones / reviews | 12 | role + ownership |
| Messaging / notifications | 9 | conversation membership |
| Forum | 2 | authenticated |
| Reputation | 1 | intentionally public |

---

## 5. Findings

### 5.1 CONFIRMED — 1 finding

#### RS-01 · Open redirect in the auth callback (LOW)

| | |
|---|---|
| **Severity** | **LOW** |
| **Route** | `GET /api/auth/callback` |
| **File** | `src/app/api/auth/callback/route.ts:13,40` |
| **Status** | CONFIRMED (code-level); **not** reproduced with a valid OTP |

**Root cause.** The `next` query parameter is used unvalidated as a redirect target:

```ts
const next = searchParams.get('next') ?? '/';
...
return NextResponse.redirect(new URL(next, request.url));   // line 40
```

`new URL(next, base)` honours an absolute URL in `next`, so the base is discarded.
Verified URL semantics:

```
"https://evil.example"   -> https://evil.example/
"//evil.example"         -> http://evil.example/
```

**Reproduction.** Live probe with `next=https://evil.example` and an invalid
`token_hash` → `307 → /auth/auth-error?...`. The external redirect is **not** reached
because `verifyOtp` fails first. The sink is confirmed by code and URL semantics;
exploitation requires a valid `token_hash`.

**Impact.** Post-authentication redirect abuse. A victim completing email
verification could be forwarded to an attacker-controlled site, enabling phishing.
**No token, session or authorization state is disclosed** — the redirect occurs after
a successful OTP exchange on the application's own origin.

**Why severity is LOW.** `emailRedirectTo` is a fixed server value
(`auth.service.ts:58,299`), and Supabase's redirect allow-list governs which
`redirect_to` values it will honour, so an attacker cannot trivially place an
arbitrary `next` on a *received* email link. Exploitation additionally requires a
valid one-time token hash. Real but narrow.

**Minimal remediation direction.** Constrain `next` to a same-origin relative path —
reject any value that parses to a different origin (reuse the parsed-`URL.origin`
comparison pattern already used by the F-04 origin guard for consistency). Do not
introduce a redirect allow-list framework.

**Regression tests required.** `next` = absolute external URL, protocol-relative
`//host`, and path traversal must all resolve same-origin; relative `/dashboard`
must still work.
### 5.2 UNCONFIRMED — 2 items

**RS-02 · `GET /api/jobs` and `GET /api/reputation/[userId]` are unauthenticated.**
Both return 200 anonymously. **Both are explicitly documented as intentional**
(`jobs/route.ts:33` "Listing is public"; `reputation/[userId]/route.ts:36` "a
prospective client … needs this before creating an account"). No private data
exposed; reputation returns aggregate display data only. **Not a finding** — recorded
because it will look like one to a future reviewer.

**RS-03 · Two subscription paths exist for messages**
(`client-api.service.ts:164` and `messaging.service.ts:1124`). The service-layer one
creates a client per call and unsubscribes from a channel it never retained — a
latent resource leak. Not security-impacting and pre-existing.

### 5.3 INFORMATIONAL

- **Rate limiting absent** on all mutation endpoints — this is F-13, deferred.
- **No CSP nonce architecture** — deliberate F-02 decision; `script-src` retains
  `'unsafe-inline'`.
- `scripts/` is untracked QA tooling and would need excluding before any deploy.

### 5.4 FALSE POSITIVES — rejected on evidence

| Flagged | Why it is not a finding |
|---|---|
| 4 × `admin/*` "no auth" | `requireAdminUser` used; my regex missed it. Gate verified: 401 unauth, session-derived identity, role re-read in DB |
| `forum/discussions` "no validation" | Explicit allowlist (`categoryId/title/body/authorId`), `authorId` from **session**; length checked |
| `forum/.../replies` "no validation" | Same allowlist pattern |
| `messages/*` "no validation" | Per-action type checks; action set allowlisted; ownership enforced in service |
| `jobs` + `jobs/[id]` "no validation" | F-14 `jobEditSchema.parse` at `job.service.ts:476` |
| `payments/webhook` "no auth" | Intentionally unauthenticated; HMAC-SHA256 signature over raw body is authoritative (F-04 exempt) |
| `profile` PATCH mass assignment | Every field explicitly mapped; no body spread into a DB write |
| `uploadAttachment` path traversal | Filename replaced with `crypto.randomUUID()`; extension stripped to `[a-z0-9]`; userId from session |

---

## 6. Authorization findings

**No confirmed authorization defects.** Live cross-user matrix (all three QA roles,
real sessions):

| Actor | `POST /api/proposals` | `POST /api/contracts` | `POST /api/messages/conversations` | `PATCH /api/notifications/<other-uuid>` |
|---|---|---|---|---|
| client | **403** | 400 | 400 | **404** |
| consultant | 400 | **403** | 400 | **404** |
| outsider | **403** | 400 | 400 | **404** |

Unauthenticated sweep across 19 sensitive endpoints: **401/403/404 everywhere except
the two documented-public routes**. Role boundaries hold, ownership scoping holds
(`notifications` returns 404 rather than 403 for another user's id — correctly
non-enumerable).

Mass assignment: verified **no** route passes a raw request body into `.insert()` /
`.update()` / `.upsert()`. F-14 already pinned this for job PATCH.

## 7. Input-validation findings

Validation is present on all mutation endpoints. F-14's DB-constraint-as-validation
pattern was searched for elsewhere and **not found**. `proposal.service.ts:524-525`
enforces a transition allow-list. `reputation`, `notifications` and `jobs` id
extraction uses `z.string().uuid()` guards with documented `.pop()` vs `.at(-2)`
reasoning — a previously-fixed bug class that is explicitly commented against
recurrence.

## 8. Data-exposure findings

**No confirmed cross-user exposure.** `.select('*')` appears in services, but every
reachable response is either self-scoped or an intentional public projection. Per
F-05, `client_profiles` / `companies` / `consultant_profiles` remain ungranted and
unreachable from the browser.

## 9. Error-handling findings

Errors are formatted centrally via `formatErrorResponse`; no stack traces, SQL text,
internal paths or secrets surfaced. `adminRoute` wraps handlers so an unexpected
## 11. XSS findings

**None.** Zero `dangerouslySetInnerHTML`, `innerHTML`, `outerHTML`, `eval`,
`new Function`, `insertAdjacentHTML` or `document.write` in `src/`. No markdown/HTML
renderer. User content renders as React children (auto-escaped). Independently
consistent with the Phase 2 finding.

## 12. Open-redirect findings

See **RS-01**. A codebase-wide sweep found no other attacker-controlled redirect
target; every other `redirect()` uses a constant or a server-derived path.

## 13. SSR / server-action findings

**No server actions exist** (zero `'use server'`). Service-role material is confined
to `src/lib/supabase/admin.ts` and `context.ts`, reached only from server code; F-05
previously confirmed `sb_secret_…` appears in no client bundle. No sensitive
`NEXT_PUBLIC_*` variable exists — the only `NEXT_PUBLIC_` secrets-shaped key is the
Supabase anon/publishable key, which is public by design.

## 14. Security-header regression

F-02 **intact** at HEAD, verified on the production build:

```
content-security-policy      : default-src 'self'; ... connect-src 'self' https://…supabase.co wss://…supabase.co
x-frame-options              : DENY
x-content-type-options       : nosniff
referrer-policy              : strict-origin-when-cross-origin
permissions-policy           : camera=(), microphone=(), geolocation=(), payment=(), usb=()
strict-transport-security    : max-age=31536000
```

CSP enforced (not report-only) in production; no new external resources introduced.

## 15. Auth / session findings

F-01 intact (`HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/`). Password-reset response
is generic — *"If an account exists with this email…"* — so no account enumeration.
Admin gate distinguishes 401 (no session) from 403 (non-admin) deliberately.

## 16. Business-logic findings

**No bypass found.** Proposal transitions are allow-list gated
(`PROPOSAL_TRANSITIONS`); payment webhook signature is verified before parsing;
message edit/delete enforce `sender_id === user.id` server-side; notification
read-state cannot be written cross-user.

## 17. Dependency findings

```
npm audit --omit=dev → {"info":0,"low":0,"moderate":0,"high":0,"critical":0,"total":0}
```

**Zero production dependency vulnerabilities.** F-11 remains closed. No upgrade
performed.

## 18. Secret-scan findings

**No real secrets in tracked files.** Tracked-env check: only `.env.example` is
tracked; `.gitignore` has `.env*` with `!.env.example`.

| Match | Classification |
|---|---|
| `src/lib/supabase/admin.ts`, `config/env.ts`, `types/env.d.ts` | env-var **references** — false positive |
| `README.md` JWT prefixes (`eyJhbGci…`) | documentation **example**, truncated — false positive |
| `supabase/migrations/*` `service_role` | SQL role name in policy logic — false positive |
| `.agents/skills/supabase-server/SKILL.md` | docs mentioning key names — false positive |
| `package-lock.json` `sha512-…` | integrity hashes — false positive |

No value-matching credential pattern in any tracked file.
---

## 21–25. Summary tables

### Confirmed findings
| ID | Severity | Area | One-line |
|---|---|---|---|
| RS-01 | **LOW** | Open redirect | Unvalidated `next` in `/api/auth/callback` |

**Total confirmed: 1 · Highest severity: LOW**

### Unconfirmed
RS-02 (documented-public GETs), RS-03 (duplicate subscription path).

### False positives (8 patterns)
Admin auth, forum validation ×2, messaging validation, jobs validation ×2, webhook
"no auth", profile mass assignment, storage path traversal.

### Informational
Rate limiting absent (F-13), CSP `unsafe-inline` retained (F-02), `scripts/` untracked.

### Pre-existing / out of scope
`POST /api/jobs` client-profile read failure (F-05 Option B consequence — **not
fixed**, as instructed); F-09, F-10, F-12, F-13, F-15 deferred.

---

## 26. Recommended remediation order

1. **RS-01 — open redirect.** Smallest, self-contained, no credentials needed. Fix the
   `next` guard; add the four regression cases. Nothing else in this audit warrants
   action.
2. **Re-verify RS-02/03 as closed** in the next audit so they are not re-flagged.
3. **F-12/F-13/F-15** — blocked on Upstash credentials.
4. **F-09** — blocked on database/MANAGEMENT API access.
5. **F-10** — needs Cause A remediation (design decision) *and* F-09 resolution.

No CRITICAL or HIGH findings were identified. **The remaining attack surface is in
good shape**: authorization, validation, mass assignment, storage, XSS and secrets all
held up under live cross-user testing, with zero production dependency
vulnerabilities.

## 19. Database / RLS findings

Repository evidence only (live catalog unavailable — see F-09). Migrations `00011`,
`00012`, `00015` explicitly revoke function EXECUTE from `anon`/`authenticated` and
re-grant narrowly to `service_role`; the "grant-all-on-all-functions" class was found
and closed previously. `messages_select_member` verified correct by live test
(member 6 rows / outsider 0). Recursion in `conversation_members` was addressed by
`00007`. No broad `anon`/`authenticated` table grants beyond the deliberate F-05
posture. **No new database findings.**

## 20. Frontend authorization findings

**No UI-only authorization relied upon as a boundary.** F-03 role guards are
defense-in-depth; every guarded surface's API independently enforces the restriction —
demonstrated by the client→`/api/proposals` **403** and consultant→
`/api/contracts` **403** results above. Role is read from the DB, never from client
state.
throw yields JSON, not an HTML trace. Admin audit context truncates
`x-forwarded-for` to 64 chars and `user-agent` to 256 before persistence.

## 10. Storage findings

**No confirmed issues.** `message-attachments` upload: MIME allowlist, size cap,
UUID filename, extension sanitised to `[a-z0-9]`, `upsert: false`, user-scoped path
from the session, and `user.id` (not a parameter) passed by the only caller.