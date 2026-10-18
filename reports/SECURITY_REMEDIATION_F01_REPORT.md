# Security Remediation Report — F-01 Session Cookie Hardening

**Finding:** F-01 — Session/auth cookies lack explicit `HttpOnly` and `Secure` attributes
**Date:** 2026-03-10
**Stage:** 2
**Status:** **REMEDIATED**
**Commit:** *not created — awaiting approval*

---

## 1. Finding F-01

Session/auth cookies issued by the application were written with Supabase SSR's
default attributes, which omitted `HttpOnly` and `Secure`. The session token was
therefore readable from JavaScript and transmissible over plain HTTP.

## 2. Root cause and location

Both Supabase SSR cookie writers passed Supabase's `options` object straight
through to the cookie API without normalising it, so the wire attributes were
whatever `@supabase/ssr` chose:

| # | File | Line | Writer |
|---|------|------|--------|
| 1 | `src/lib/supabase/server.ts` | 19 | `cookieStore.set(name, value, options)` — Route Handlers / Server Components |
| 2 | `src/lib/supabase/middleware.ts` | 24 | `supabaseResponse.cookies.set(name, value, options)` — middleware session refresh |

There was no other cookie-write site in the application. Cookie *attributes* were
never set by application code; they were inherited implicitly.

### Client-side cookie reads (HttpOnly risk assessment)

A full-tree search for `document.cookie`, `cookieStore.get(` and `cookies().get(`
returned **zero** application reads. The only browser-side Supabase client
(`src/lib/supabase/client.ts`) is imported solely by `client-api.service.ts` and
`messaging.service.ts`, and is used **exclusively for Realtime channels**. All
other client requests are `fetch()` calls that rely on the browser attaching
cookies automatically. No application functionality depends on JavaScript
reading the session cookie, so `HttpOnly` is safe to enable.

## 3. Exact remediation

A single shared helper was added and applied at both write sites. The existing
Supabase SSR architecture, cookie names, storage mechanism and refresh flow are
unchanged — only the attribute object is normalised.

**New file `src/lib/supabase/cookie-options.ts`** exports
`hardenSessionCookieOptions(options)`, which spreads the incoming options and
then forces:

```ts
{ ...options, path: options?.path ?? '/', httpOnly: true, secure: true, sameSite: 'lax' }
```

A shared helper was used deliberately: with two independent write sites, a
per-site fix would let them drift apart over time.

### Design decisions

- **`secure` is unconditionally `true`, not environment-conditional.** A
  `secure: false` branch is the usual mechanism by which a production deployment
  silently ships an unprotected cookie. No such branch exists.
- **`sameSite` is pinned to `'lax'`**, which both preserves existing behaviour and
  prevents a future downgrade to `None`.
- **`path`, `maxAge`, `expires` are carried through untouched**, so session
  lifetime and refresh behaviour are identical to before.

## 4. Cookie attributes — before / after

Captured from the live `Set-Cookie` on `POST /api/auth/login`:

**Before**
```
sb-uzjvaijepqfiogwncdjn-auth-token
  Path=/ | Expires=Sun, 07 Nov 2027 06:26:18 GMT | Max-Age=34560000 | SameSite=lax
```

**After**
```
sb-uzjvaijepqfiogwncdjn-auth-token
  Path=/ | Expires=Sun, 07 Nov 2027 06:30:13 GMT | Max-Age=34560000 | Secure | HttpOnly | SameSite=lax
```

| Attribute | Before | After | Status |
|-----------|--------|-------|--------|
| `HttpOnly` | absent | **present** | fixed |
| `Secure` | absent | **present** | fixed |
| `SameSite` | `lax` | `lax` | preserved |
| `Path` | `/` | `/` | preserved |
| `Max-Age` | `34560000` | `34560000` | unchanged |
| `Expires` | present | present | unchanged |

Verified in a **real browser** (Chromium) on the authenticated session:

```
name     = sb-uzjvaijepqfiogwncdjn-auth-token
httpOnly = true
secure   = true
sameSite = Lax
path     = /
```

## 5. Tests performed and results

| # | Test | Result |
|---|------|--------|
| 1 | `npx tsc --noEmit` | **PASS** (exit 0) |
| 2 | `npx eslint . --max-warnings=0` | **PASS** (exit 0) |
| 3 | `npx vitest run` | **PASS — 784/784** (29 pre-existing files + 1 new) |
| 4 | `npm run build` | **PASS** — `next-build (v16.3.8)`, exit 0 |
| 5 | Route sweep | **45/45 PASS, 0 FAIL** |
| 6 | Browser/auth regression | **12 PASS / 4 FAIL** — identical to pre-change baseline |
| 7 | Cookie attribute capture | **PASS** — see §4 |
| 8 | Client cookie access | **PASS** — see §6 |
| 9 | Security regression | **PASS** — 38/38 `auth-regression` |
| 9b | Cross-user authorization | **PASS** — 157/157 across conversation / jobs / admin / refund-authorization |
| 10 | Realtime | **Not attempted** — remains OPEN, see §8 |

### Auth flow coverage (item 6)

| Flow | Result |
|------|--------|
| Registration | 201 via API; UI flow covered by the browser suite |
| Login | 200, hardened cookie issued |
| Authenticated `/api/auth/me` | 200 |
| `/api/profile` | 200 |
| `/messages` | 200 |
| `/dashboard/client` | 200 |
| `/proposals` | 200 |
| `/jobs/create` | 200 |
| Logout | 200; session cookie cleared, subsequent `/api/auth/me` → **401** |
| Persistence across navigation/refresh | PASS — repeated navigation stayed 200; browser suite "Persists after refresh" PASS |

The session-clearing cookie emitted on logout also carries `Secure` and `HttpOnly`
(`Max-Age=0`), so the hardening covers the teardown path too.

## 6. Client cookie access test (item 8)

Confirmed in a real browser session after login:

```
document.cookie exposes auth token?  NO — protected by HttpOnly
document.cookie value:               empty
```

Functional confirmation that the application does not need JS to read the cookie:

```
/api/auth/me    -> 200
/api/profile    -> 200
```

Every authenticated page and API call in the browser suite continued to work, and
"Persists after refresh" passed. The browser attaches the `HttpOnly` cookie
automatically; no application code reads it.

## 7. Local HTTP / `Secure` cookie testing limitation

`Secure` cookies are only stored by a browser on a trustworthy origin. In
practice:

- **`http://localhost` — works.** Browsers treat `localhost` as a potentially
  trustworthy origin, so the `Secure` cookie is accepted and persisted. Verified
  empirically: Chromium stored the cookie and "Persists after refresh" passed.
- **Plain-HTTP access via a LAN or non-localhost host (e.g. `http://192.168.x.x`)
  — the session will not persist.** The cookie is rejected by the browser. This is
  expected and correct behaviour, not a defect. Local development on a
  non-localhost host must use HTTPS (or an HTTPS-terminating proxy).
- **Headless HTTP clients** (Node `fetch`, `curl`, the route sweep and the
  security regression harness) do not enforce `Secure`, so they continue to work
  against `http://localhost` unchanged.

This is the deliberate trade-off of an unconditional `secure: true`: local
convenience is not purchased by weakening production posture. It should be called
out in developer documentation.

## 8. Realtime — OPEN and unchanged

Realtime was **not** touched by this change. The browser suite reports
**12 PASS / 4 FAIL**, and the four failures are byte-identical to the pre-change
baseline:

- Client A → Consultant B delivery (no refresh)
- Consultant B → Client A delivery (no refresh)
- Burst of 3 delivered to B
- No duplicate delivery to B

`DELIVERY_VERDICT=NOT VERIFIED`. **This finding remains OPEN.**

Note for follow-up: the browser Supabase client (Realtime-only) can no longer read
the session cookie because of `HttpOnly`. It still subscribed successfully
(`Client A channel SUBSCRIBED :: join ok`) and its behaviour is unchanged from
baseline, so this change did not introduce the delivery failure. The delivery
defect retains its own pre-existing root cause.

## 9. Changed files

| File | Status | Purpose |
|------|--------|---------|
| `src/lib/supabase/cookie-options.ts` | **new** | Shared attribute-hardening helper |
| `src/lib/supabase/server.ts` | modified | +1 import, wrap options at line 19 |
| `src/lib/supabase/middleware.ts` | modified | +1 import, wrap options at line 24 |
| `src/tests/session-cookie-attributes.test.ts` | **new** | 6-test regression guard for F-01 |

Tracked diff: **2 files changed, 4 insertions(+), 2 deletions(-)** — a total of
4 added lines across the two existing files.

### Explicitly not modified

`package.json`, `package-lock.json`, Supabase migrations, RLS policies, Realtime
configuration, API authorization logic, security headers (F-02), role guards
(F-03), CSRF/origin validation (F-04), rate limiting, job validation. No F-02+
remediation was started.

## 10. Baseline integrity

- **F-11 commit `604f53c` is intact.** `HEAD` is still `604f53c`
  (`security: remediate Next.js advisory`), with parent `4cee3f8`. It was not
  amended, reverted or rewritten.
- `package.json` and `package-lock.json` show **no diff** against `HEAD`.
- Next.js remains `16.3.8`; the build confirms `next-build (v16.3.8)`.

## 11. Final status

**REMEDIATED**

All required tests pass. The session cookie is now explicitly `HttpOnly`,
`Secure` and `SameSite=Lax`, with `Path`, `Max-Age` and `Expires` preserved. No
application functionality regressed; cross-user authorization behaviour is
unchanged; Realtime remains OPEN and unmodified.

Nothing has been staged or committed. Awaiting explicit approval before committing.