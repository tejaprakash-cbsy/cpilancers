# Security Remediation Report — F-04 CSRF / Origin Defense

**Finding:** F-04 — No CSRF token or Origin/Referer validation on state-changing requests
**Date:** 2026-03-10
**Stage:** 5
**Baseline commit:** `7e184d0` (`security: add route-level role guards`)
**Status:** **REMEDIATED**
**Commit:** *not created — awaiting approval**

---

## 1. Finding F-04

No state-changing API validated the request `Origin`. Phase 1 established that a
manually constructed cookie-attached cross-origin request was accepted, while
real-browser `SameSite=Lax` behaviour already prevents the cookie being attached
in the tested cross-site case. This is therefore **low-severity defense in
depth**, not a confirmed browser exploit.

## 2. Root cause

`src/proxy.ts` authenticated every request but never inspected `Origin`, and no
API route or service checked it. All 69 route files under `src/app/api` were
unguarded at the request level.

## 3. Exact implementation

Two files. The guard is **centred in `src/proxy.ts`**, which every API route
already passes through, so the rule is applied once rather than duplicated across
69 files.

**New `src/lib/security/origin.ts`** exports `isUnsafeMethod`, `trustedOrigin`
and the pure `evaluateOrigin(method, pathname, origin)` decision function.

**Modified `src/proxy.ts`** — 27 added lines. The check runs **first**, before
`updateSession`, so it precedes authentication, every route handler, every
service call and every database write. A rejected mutation therefore cannot
partially execute.

Rejected requests return **403** with the application's existing generic error
shape (`{ success:false, error:{ message, code, statusCode } }`) and a message
that does **not** disclose the expected origin, so responses cannot be used to
probe the deployment.

## 4. Trusted-origin source

**`NEXT_PUBLIC_APP_URL`** — server configuration, already validated as a URL by
`src/config/env.ts` (`z.string().url()`) and already used by the codebase for the
auth callback link. Currently `http://localhost:3000` in local development; it
must be set to the real deployment origin in production.

Deliberately **not** used: `Host`, `X-Forwarded-Host`, `X-Forwarded-Proto`, the
request URL, query parameters, the body, or cookies. These are client-supplied,
and an attacker controlling them could declare themselves trusted. This was
tested directly — see §8.

If `NEXT_PUBLIC_APP_URL` is missing or unparseable the guard **fails closed**:
a request carrying an `Origin` is refused rather than waved through. A
missing-configuration state can only ever cause refusal, never acceptance.

## 5. Methods protected

`POST`, `PUT`, `PATCH`, `DELETE` — across **all** API routes, including admin and
non-browser-facing ones.

`GET`, `HEAD`, `OPTIONS` are never blocked by this guard, so preflight behaviour
is untouched.

## 6. Origin decision table

| Condition | Result |
|-----------|--------|
| Safe method (`GET`/`HEAD`/`OPTIONS`) | **allow** |
| Webhook path `/api/payments/webhook` | **allow** (exempt) |
| Unsafe method, **no `Origin`** header | **allow** |
| Unsafe method, `Origin` == trusted origin | **allow** |
| Unsafe method, `Origin` malformed / `"null"` | **reject 403** |
| Unsafe method, `Origin` != trusted origin | **reject 403** |
| Unsafe method, `Origin` present, trusted origin unconfigured | **reject 403** (fail closed) |

### Absent-Origin behaviour

Allowed, by design. Server-to-server callers, native clients and some proxies send
no `Origin`, and requiring it would break legitimate traffic. This preserves the
required behaviour that the Razorpay webhook — which never sends `Origin` —
continues to work.

### Comparison method

Comparison is on the parsed, normalized `URL.origin`, so scheme and host are
lower-cased and default ports collapse. This is immune to substring and
suffix tricks, and requires an exact scheme + host + port match. No wildcard and
no prefix matching is used anywhere.

## 7. Origin matrix — measured results

| Test | Result |
|------|--------|
| No `Origin`: POST / PATCH / DELETE | allowed, reach handler (400 / 200 / 405) |
| Exact trusted origin | allowed (400 VALIDATION_ERROR — reached handler) |
| `https://evil.example` | **403** |
| `https://cpilancers.com.evil.example` | **403** |
| `https://evil-cpilancers.com` | **403** |
| `null` | **403** |
| `http://evil.example` | **403** |
| `https://localhost:3000.evil.com` | **403** |
| `https://LOCALHOST:3001` (case + port) | **403** |
| `http://localhost:3001` (wrong port) | **403** |
| `https://localhost:3000` (scheme mismatch) | **403** |
| `http://localhost` (default port) | **403** |
| `HTTP://LOCALHOST:3000` (case only) | **allowed** — correctly normalized |
| GET / HEAD / OPTIONS with hostile Origin | not blocked (200 / 200 / 204) |
| POST / PUT / PATCH / DELETE with hostile Origin | **403** |

Plus **14 unit tests** pinning the same table (`src/tests/origin-validation.test.ts`).

## 8. Trusted-origin spoofing resistance

| Attempt | Result |
|---------|--------|
| hostile `Origin` + trusted-looking `X-Forwarded-Host` | **403** |
| hostile `Origin` + `Host: localhost:3000` | **403** |
| hostile `Origin` + `X-Forwarded-Proto: https` | **403** |
| hostile `Origin` + trusted `Referer` | **403** |
| `Origin: null` + trusted `Host` | **403** |
| suffix `Origin` + trusted `X-Forwarded-Host` | **403** |
| `?origin=` query param + body `origin` field override | **403** |
| genuine same-origin with all proxy headers present | allowed (200) |

`Referer` is never consulted when a valid `Origin` is present, as required.

## 9. Mutation safety

Not merely a status-code check:

- Cross-origin `PATCH /api/profile` → **403**, and the profile was read back
  afterwards: `first_name` unchanged (`"QA"` → `"QA"`).
- Cross-origin `POST /api/messages/conversations` → **403**, no conversation created.
- **Browser-originated** test: a real authenticated browser request whose `Origin`
  was rewritten to `https://cpilancers.com.evil.example` was rejected **403**, and
  `first_name` remained `"QA"` — **no mutation occurred**.

## 10. Payment webhook treatment

`src/app/api/payments/webhook/route.ts` was **not modified** — verified by diff.
Its HMAC signature verification remains authoritative and is unchanged.

The path is exempt from Origin validation, and separately a request with no
`Origin` would be allowed anyway. Verified live:

| Case | Result |
|------|--------|
| Webhook POST, no Origin, no cookie | **not blocked** (400 — signature check still governs) |
| Webhook POST with a foreign Origin | **not blocked** (exempt) |
| Webhook GET | not blocked (405) |

The prefix exemption is exact-boundary matched: `/api/payments/webhook-evil` is
**not** exempt.

## 11. Test results

| # | Test | Result |
|---|------|--------|
| 1 | `npx tsc --noEmit` | **PASS** (exit 0) |
| 2 | `npx eslint . --max-warnings=0` | **PASS** (exit 0) |
| 3 | `npx vitest run` | **PASS — 798/798** (31 files; 784 + 14 new) |
| 4 | `npm run build` | **PASS** — `next-build (v16.3.8)` |
| 5 | Route sweep | **45/45 PASS, 0 FAIL** |
| 6 | Origin matrix | **PASS** — all cases in §7 |
| 7 | Method matrix | **PASS** — §7 |
| 8 | Mutation safety | **PASS** — §9 |
| 9 | Authorization regression | **38/38** + **208/208** |
| 10 | F-01 regression | **PASS** |
| 11 | F-02 regression | **PASS** — all 6 headers, CSP enforced |
| 12 | F-03 regression | **PASS** — role guards intact |
| 13 | Browser regression | **12 PASS / 4 FAIL** — unchanged |
| 14 | Cross-origin browser test | **PASS** — 3/3 |
| 15 | Realtime | not touched — see §15 |
| 16 | Webhook | **PASS** — unmodified |

The 208-test authorization group includes the payment-webhook-signature suite
(`payment-webhook-signature.test.ts`), confirming webhook verification is intact.

## 12. F-01 regression — intact

```
httpOnly = true   secure = true   sameSite = Lax   path = /
```

Verified for both client and consultant in a real browser. The cookie helper was
**not modified**.

## 13. F-02 regression — intact

All six headers present with CSP **enforced**; `next.config.ts` **not modified**.

## 14. F-03 regression — intact

| Check | Result |
|-------|--------|
| client → `/dashboard/client`, `/jobs/create` | allowed |
| client → `/dashboard/consultant`, `/proposals`, `/proposals/new/[jobId]` | denied |
| consultant → `/proposals` | allowed |
| consultant → `/dashboard/client` | denied |

`/proposals/new/[jobId]` remains **consultant-only**. Admin behaviour unchanged.

## 15. Browser regression — 12 PASS / 4 FAIL

Unchanged baseline. Same-origin workflows all functioned in a real browser
(`/profile`, `/jobs`, `/messages`, `/forum`, `/dashboard/client`), and real
same-origin mutations returned 200 / 400-from-handler rather than 403, confirming
the guard does not block legitimate traffic.

An intermediate run showed 10/6 — the recurring **QA data accumulation** (the
suite appends 5 messages per run while asserting 4). After resetting fixtures it
returned to 12/4.

The four remaining failures are the pre-existing **F-10** delivery defects (A→B,
B→A, burst of 3, duplicate delivery). `DELIVERY_VERDICT=NOT VERIFIED`. Both
channels still reach `SUBSCRIBED`. **F-09 and F-10 remain OPEN.** Realtime was
not touched.

## 16. Changed files

| File | Status |
|------|--------|
| `src/lib/security/origin.ts` | **new** |
| `src/tests/origin-validation.test.ts` | **new** |
| `src/proxy.ts` | modified (+27 / −1) |

No changes to migrations, RLS, Realtime, `package.json`, `package-lock.json`,
`next.config.ts`, cookie handling, API authorization, ownership checks, F-03 role
guards, or the payment webhook.

## 17. Final status

**REMEDIATED.** Cross-origin state-changing requests are rejected before any
mutation; absent-`Origin` and same-origin traffic, safe methods and the
signature-authenticated webhook all continue to work unchanged.

Nothing has been staged or committed. Awaiting explicit approval before committing.