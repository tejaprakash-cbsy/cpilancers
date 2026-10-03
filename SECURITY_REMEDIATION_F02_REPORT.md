# Security Remediation Report — F-02 Security Headers

**Finding:** F-02 — Missing HTTP security headers (CSP, clickjacking, nosniff, referrer, HSTS, permissions)
**Date:** 2026-03-10
**Stage:** 3
**Baseline commit:** `5788255` (`security: harden session cookies`)
**Status:** **REMEDIATED — CSP enforced in production**
**Commit:** *not created — awaiting approval*

---

## 1. Finding F-02

The application emitted no security headers beyond Next.js defaults. It had no
Content-Security-Policy, no clickjacking protection, no `nosniff`, no
`Referrer-Policy`, no HSTS and no `Permissions-Policy`.

**Location:** `next.config.ts` — the config object was empty
(`/* config options here */`).

## 2. Exact files changed

| File | Status | Change |
|------|--------|--------|
| `next.config.ts` | modified | +91 / −1 — security headers and CSP |

**One file.** No source, test, migration, RLS, Realtime, cookie or dependency
file was touched. `package.json` / `package-lock.json` confirmed untouched.

## 3. Security headers added — exact values

Applied to **all** paths via `source: "/:path*"`, and verified present on HTML
pages, API routes and static assets alike.

| Header | Value |
|--------|-------|
| `X-Content-Type-Options` | `nosniff` |
| `X-Frame-Options` | `DENY` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=(), payment=(), usb=()` |
| `Strict-Transport-Security` | `max-age=31536000` |
| `Content-Security-Policy` | see §4 (**enforced** in production builds) |

### Rationale per header

- **`nosniff`** — stops MIME-type sniffing, so a file such as `globals.css` can
  never be coerced into executing as script.
- **`X-Frame-Options: DENY`** — the app embeds nothing in a frame and is never
  intended to be framed. `DENY` is the strictest correct value and agrees with
  CSP `frame-ancestors 'none'`, so the two never conflict.
- **`strict-origin-when-cross-origin`** — sends only the origin cross-origin,
  keeping path/query leakage away from third parties while preserving same-origin
  referrers.
- **`Permissions-Policy`** — the application calls no camera, microphone,
  geolocation, payment or USB API. Denying them removes that surface even if an
  injection point were ever introduced.
- **`HSTS`** — `max-age=31536000` (1 year).

## 4. CSP

### Policy

```
default-src 'self';
base-uri 'self';
object-src 'none';
frame-ancestors 'none';
form-action 'self';
script-src 'self' 'unsafe-inline';
style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
img-src 'self' data: blob: https://uzjvaijepqfiogwncdjn.supabase.co;
font-src 'self' data: https://fonts.gstatic.com;
connect-src 'self' https://uzjvaijepqfiogwncdjn.supabase.co wss://uzjvaijepqfiogwncdjn.supabase.co;
worker-src 'self' blob:;
manifest-src 'self';
media-src 'self'
```

### Report-Only or enforced?

**Enforced.** The header name is selected at build time:

- `next build` (`NODE_ENV=production`) → **`Content-Security-Policy`** (enforced)
- `next dev` (`NODE_ENV=development`) → `Content-Security-Policy-Report-Only`

A deployed build can therefore never emit an unenforced policy. Development stays
report-only only because React Fast Refresh evaluates strings and needs
`'unsafe-eval'`, which is a dev-toolchain artifact rather than an application
requirement — see §6.

### Why each source is permitted

| Source | Why it is genuinely required |
|--------|------------------------------|
| `'self'` | All routes, `/api/*`, `/landing-assets/*`, `_next/*` assets. Verified. |
| `script-src 'unsafe-inline'` | Next.js App Router emits inline bootstrap/RSC scripts. **Demonstrated by test**, not assumed. |
| `style-src 'unsafe-inline'` | Tailwind plus `next/image` `fill` renders inline `style` attributes. Demonstrated. |
| `https://fonts.googleapis.com` | `src/app/globals.css:1` `@import`s the Inter family from Google Fonts. **Discovered by Report-Only testing.** |
| `https://fonts.gstatic.com` | Serves the Inter `.woff2` files that `@import` pulls in. Discovered by Report-Only testing. |
| `data:` (img, font) | Inline previews and embedded font data. |
| `blob:` (img, worker) | `next/image` blob/object URLs. |
| Supabase origin (`img-src`, `connect-src`) | `NEXT_PUBLIC_SUPABASE_URL` — **derived from env at build time, not hardcoded.** |
| `wss://…supabase.co` | Realtime WebSocket. Derived as the `wss://` form of the same origin. |
| `object-src 'none'` | No `<object>`/`<embed>` anywhere. |
| `frame-ancestors 'none'` | Clickjacking defence, matching `X-Frame-Options: DENY`. |

No wildcard `*` is used anywhere. `'unsafe-eval'` is **absent**.

## 5. CSP violations observed and classification

Report-Only was deployed first and every route exercised, exactly as the plan
requires. **1166 violations** were captured across 11 routes in development mode:

| # | Violation | Classification | Resolution |
|---|-----------|----------------|------------|
| 1 | `stylesheet 'https://fonts.googleapis.com/css2?family=Inter…'` | **Legitimate application dependency** | Added `https://fonts.googleapis.com` to `style-src`. Traced to `globals.css:1`. |
| 2 | Inter `.woff2` from `fonts.gstatic.com` (×N) | **Legitimate application dependency** | Added `https://fonts.gstatic.com` to `font-src`. |
| 3 | `Evaluating a string as JavaScript` (`'unsafe-eval'`) | **Dev-toolchain artifact — not a production requirement** | **Not added.** Verified it does not occur in a production build. |

No violations were suppressed, and no source was added without a demonstrated
dependency. After resolving #1 and #2, the production build reported **0 violations**.

## 6. `unsafe-eval` — tested, not assumed

The dev-mode `unsafe-eval` violation was isolated by running the identical
browser exercise against a **production `next build` / `next start`** server:

```
PRODUCTION CSP VIOLATIONS: 0 total, 0 unique
unsafe-eval in production build? NO — dev-only artifact
```

`'unsafe-eval'` was therefore **not** added. It appeared only under `next dev`,
where React Fast Refresh needs it. Adding it would have weakened every production
deployment to accommodate a local dev server.

## 7. HSTS and local HTTP

- `Strict-Transport-Security: max-age=31536000` is sent unconditionally.
- **`includeSubDomains` and `preload` are deliberately omitted.** There is no
  evidence that every subdomain of the deployment is HTTPS-only; asserting either
  would permanently brick any subdomain that is not.
- **Local development is unaffected.** Browsers ignore an HSTS header received
  over plain HTTP, so it is never stored for `http://localhost`. The full
  regression suite ran over plain HTTP locally with no breakage.
- The F-01 cookie is already `Secure`, so local dev on non-localhost plain-HTTP
  hosts was already constrained before F-02; F-02 adds no new constraint there.

## 8. Test results

| # | Test | Result |
|---|------|--------|
| 1 | `npx tsc --noEmit` | **PASS** (exit 0) |
| 2 | `npx eslint . --max-warnings=0` | **PASS** (exit 0) |
| 3 | `npx vitest run` | **PASS — 784/784** (30 files) |
| 4 | `npm run build` | **PASS** — `next-build (v16.3.8)` |
| 5 | Route sweep | **45/45 PASS, 0 FAIL** (against enforced build) |
| 6 | Header verification | **PASS** — all headers on HTML, API and static paths |
| 7 | CSP Report-Only exercise | **PASS** — 11 routes; violations classified in §5 |
| 7b | CSP under enforcement | **PASS** — 0 violations, 0 page errors |
| 8 | Browser regression | **12 PASS / 4 FAIL** — identical to baseline |
| 9 | Authentication regression | **PASS** — see below |
| 10 | Supabase/Realtime connectivity | **PASS** — both channels `SUBSCRIBED` |
| 11 | Security regression | **38/38** auth-regression; **157/157** cross-user authorization |
| 12 | F-01 cookie verification | **PASS** — see §9 |

### Authentication regression (item 9)

| Flow | Result |
|------|--------|
| Login | 200 → redirected to `/dashboard/client` |
| Registration | `/register` loads and renders |
| `/api/auth/me` | 200 |
| `/api/profile` | 200 |
| `/dashboard/client` | 200 |
| `/proposals` | 200 |
| `/jobs/create` | 200 |
| `/messages` | 200 |
| Logout | PASS (route sweep: `before=200 after=401`) |
| Session persistence across refresh | **PASS** — "Persists after refresh :: counts 1,1,1,1,1" |

## 9. F-01 cookie hardening intact

Re-verified in a real browser against the enforced production build:

```
httpOnly = true   secure = true   sameSite = Lax   path = /
document.cookie exposes token?  NO
```

`src/lib/supabase/cookie-options.ts` was **not modified**. Its 6-test guard still
passes (6/6). Full suite 784/784.

## 10. Realtime — unchanged, F-10 still OPEN

Realtime was not modified. The browser suite reports **12 PASS / 4 FAIL**, and the
four failures are the known F-10 delivery defects:

- Client A → Consultant B delivery (no refresh)
- Consultant B → Client A delivery (no refresh)
- Burst of 3 delivered to B
- No duplicate delivery to B

`DELIVERY_VERDICT=NOT VERIFIED`. Both Realtime channels still reach **`SUBSCRIBED`**,
so CSP did not disrupt the WebSocket connection (`connect-src` permits
`wss://…supabase.co`).

### A false alarm that was investigated and ruled out

An intermediate run showed **10 PASS / 6 FAIL**, with two extra failures
(`client sees edit=9, expected 4`). This was **not** CSP. It was pre-existing QA
**data accumulation**: the browser suite appends 5 messages per run to a shared
conversation while the assertion expects exactly 4. Running the identical suite
against a report-only server with the same database state reproduced the same two
failures, with the counter climbing 9 → 14 (+5 per run) — proving the variable was
data state, not CSP.

After resetting the fixtures to a clean conversation, the controlled A/B comparison:

| Server | CSP mode | Result |
|--------|----------|--------|
| `next dev` | Report-Only | **12 PASS / 4 FAIL** |
| `next build` + `next start` | **Enforced** | **12 PASS / 4 FAIL** |

Identical. **CSP enforcement causes no regression.** F-10 remains **OPEN**.

## 11. Baseline integrity

- Baseline `5788255` (`security: harden session cookies`) is `HEAD`, unmodified.
- F-11 `604f53c` remains in history.
- `package.json` / `package-lock.json`: no diff.
- No migrations, RLS, Realtime, API authorization, cookie, role-guard, CSRF,
  rate-limiting or job-validation changes.

## 12. Final status

**REMEDIATED.** All six headers are present on every response type; CSP is
enforced in production with a policy derived entirely from observed application
behaviour; `unsafe-eval` was proven unnecessary and excluded; local HTTP
development is unaffected.

Nothing has been staged or committed. Awaiting explicit approval before committing.