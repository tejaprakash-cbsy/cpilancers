# SECURITY_REMEDIATION_RS01_REPORT.md

## 1. Finding

| | |
|---|---|
| **ID** | RS-01 |
| **Severity** | LOW |
| **Class** | Open Redirect (CWE-601) |
| **Status** | **REMEDIATED** |
| **Baseline commit** | `070dca1` |

## 2. Affected route / file

`GET /api/auth/callback` — `src/app/api/auth/callback/route.ts`

## 3. Root cause

The `next` query parameter was passed straight to `NextResponse.redirect` without
validation:

```ts
const next = searchParams.get('next') ?? '/';
...
return NextResponse.redirect(new URL(next, request.url));
```

`new URL(value, base)` honours an **absolute** value and discards the base, so a
crafted `next` became an off-site redirect target.

## 4. Exact remediation

Added an exported `safeCallbackRedirect(next, requestUrl)` helper and resolved `next`
through it before any redirect is issued. The rule is **parse, then compare origin**:

```ts
let resolved: URL;
try { resolved = new URL(next, requestUrl); } catch { return DEFAULT_REDIRECT; }
return resolved.origin === requestOrigin
  ? resolved.pathname + resolved.search + resolved.hash
  : DEFAULT_REDIRECT;
```

Three properties worth calling out:

- **It uses the request's own origin, not `NEXT_PUBLIC_APP_URL`.** The destination
  must remain on the origin the user actually reached. This also means no environment
  branch is needed, so local development is unaffected.
- **It returns path+search+hash, never the raw input**, so the emitted `Location` can
  never be absolute even when the input was.
- **Malformed input returns the fallback rather than throwing**, so a bad value cannot
  escape the callback.

### Why a `startsWith('/')` check was rejected

The obvious guard is genuinely bypassable. WHATWG URL parsing treats a backslash as a
path separator for special schemes, so these inputs **begin with `/`**, do **not**
begin with `//`, and still resolve off-site (verified):

```
"/\\evil.example"  ->  http://evil.example/
"/\\/evil.example"  ->  http://evil.example/
```

The project's existing `isSafeNextPath` (in `src/lib/auth/role-redirects.ts`, used by
the login form) returns `true` for both. That was left **untouched** — its call site
feeds `router.push`, which does not re-parse through `new URL` — but it is precisely
why this route is decided by parsing rather than prefix inspection.

## 5. Why each vector is prevented

| Vector | Why it fails |
|---|---|
| `https://evil.example` | parses to a foreign origin → mismatch → `/` |
| `http://evil.example` | same |
| `//evil.example` | protocol-relative; parses to foreign origin → `/` |
| `/\evil.example`, `/\/evil.example` | backslash normalises to `//evil.example`; **passes any prefix check**, caught by origin comparison |
| `javascript:` / `data:` | `origin` is `null`, never equal to the request origin → `/` |
| `//localhost:8443/x` | different port ⇒ different origin → `/` |
| `http://` (malformed) | `new URL` throws → fallback, no exception escapes |
| CRLF smuggling | WHATWG strips CR/LF/TAB; value stays same-origin and cannot break the header |
| Suffix look-alikes | exact `URL.origin` equality; no substring/`endsWith` logic exists |

## 6. Regression tests added

`src/tests/auth-callback-redirect.test.ts` — **30 tests**, two layers.

**Layer 1 — `safeCallbackRedirect` directly (19):** internal paths, nested paths,
query+fragment preservation, missing/empty `next`, 8 hostile absolute forms, 3
backslash forms (each asserting the parser genuinely goes off-origin, so a future
simplification back to a prefix check fails the test), malformed input, control
characters, different port.

**Layer 2 — real `GET` handler end-to-end (11):** asserts on the actual `Location`
header for all eight required cases (internal path, missing `next`, https external,
http external, protocol-relative, backslash, malformed, plus recovery-redirect
preservation).

### Test seam disclosure

`@/lib/supabase/server` is mocked so `verifyOtp` can be made to succeed
deterministically; a real OTP cannot be minted in a unit test. **The redirect logic
under test is not mocked away** — the real `GET` runs end to end. Four tests pin the
auth semantics explicitly:

- **Test 8** — with `verifyOtp` failing, the request must land on
  `/auth/auth-error` and `getUser` must never be called. If the redirect fix had
  short-circuited the auth flow, this would land on `/dashboard`.
- **Test 9** — `verifyOtp` is asserted to be called with the exact token.
- **Test 10** — the `recovery` redirect to `/auth/reset-password` is preserved.
- **Test 11** — the email-verified update still executes on the success path.

Not exercised: a genuine Supabase-issued `token_hash` (needs infrastructure). The
error branch, the success branch and both redirect decisions are covered.
---

## 7. Verification commands and results

| Gate | Command | Result |
|---|---|---|
| TypeScript | `npx tsc --noEmit` | **PASS** (exit 0) |
| ESLint | `npx eslint . --max-warnings=0` | **PASS** (exit 0) |
| Vitest (full) | `npx vitest run` | **PASS — 841/841** (33 files) |
| Build | `npm run build` | **PASS** (exit 0, `next-build v16.3.8`) |
| Route sweep | `scripts/route-sweep.mjs` | **45/45 PASS, 0 FAIL** |
| Auth regression | `auth-regression.test.ts` | **38/38 PASS** |
| Authorization suites | 5 files (admin/jobs/conversation/payment-refund/review) | **183/183 PASS** |
| F-02 headers | live production build | **intact** — `XFO=DENY`, `XCTO=nosniff`, `HSTS=max-age=31536000`, CSP enforced |
| F-01 cookies | live `POST /api/auth/login` | **intact** — `Path=/`, HttpOnly, Secure, SameSite=Lax |
| F-04 Origin | live hostile-Origin probe | **403** (unchanged) |

**Total: 841 = 811 pre-existing + 30 new.**

## 8. Pre-existing failures — clearly separated from RS-01

Browser suite: **10 PASS / 6 FAIL**. None are caused by RS-01.

**4 failures are the known F-10 Realtime set** (A→B delivery, B→A delivery, burst
of 3, duplicate delivery) — unchanged and unrelated to redirects.

**2 further failures ("author sees controls on exactly their own messages",
"non-author sees no controls") were investigated rather than assumed.** The test
hardcodes `4` and `1` for messages authored *in that run*
(`rt-browser-e2e.mjs:235,250`) but counts **every** message in the shared QA
conversation, which had accumulated to 12 (10 client / 2 consultant).

**Causation proven, not asserted:** the RS-01 change was stashed, the project rebuilt,
and the identical suite re-run against the same fixture state. The same 2 failures
occurred — with counts *growing* 9→14, confirming per-run accumulation. The change was
then restored and the stash confirmed empty.

These are QA-harness data-accumulation failures, pre-existing and independent of
RS-01. No test was weakened and no QA data was deleted to obtain a pass.

## 9. Related redirect-sink search (verification only)

Searched all of `src/` for `new URL(`, `NextResponse.redirect`, `redirect(`,
`searchParams.get('next'|'redirect'|'returnTo'|'redirectTo'|'callback'|'url')`.

| Location | Verdict |
|---|---|
| `auth/callback/route.ts:36,45` | constants — safe |
| `auth/callback/route.ts:40` | **RS-01 — fixed** |
| `proxy.ts:51,53,62,64` | builds `/login` and sets `next` from the **request pathname** — server-derived, safe |
| `(auth)/login/page.tsx:40-42` | guarded by `isSafeNextPath`, feeds `router.push` — see note |

**No additional confirmed open redirect exists.**

### Note (not remediated — out of scope)

`isSafeNextPath` accepts `/\evil.example`. That value is **not** an open redirect at
that call site because `router.push` performs a client-side navigation rather than
re-parsing through `new URL`, and the audit's live testing did not reproduce an escape
there. It is nonetheless a weaker guard than it appears, and tightening it would be a
separate, deliberate change — deliberately **not** made here, per the instruction not
to expand scope.

## 10. Exact files changed

| File | Status | Change |
|---|---|---|
| `src/app/api/auth/callback/route.ts` | modified | +65 / −1 — added `DEFAULT_REDIRECT` + `safeCallbackRedirect`; routed `next` through it |
| `src/tests/auth-callback-redirect.test.ts` | new | 225 lines, 30 tests |

`1 file changed, 65 insertions(+), 1 deletion(-)` tracked, plus one new test file.

## 11. Scope confirmation

**No production data was modified.** No database writes, no migrations, no RLS
changes, no schema changes.

**No unrelated security control was touched.** Unchanged and verified intact:
F-01 cookie implementation, F-02 CSP/headers, F-03 role guards, F-04 Origin
validation semantics, F-05 grants/RLS, F-09/F-10 Realtime, F-12/F-13/F-15 rate
limiting, Supabase configuration, `emailRedirectTo`, OTP verification semantics, and
the pre-existing `POST /api/jobs` defect.

Only the RS-01 callback redirect logic changed.

## 12. Final status

**RS-01 — REMEDIATED.** All mandatory gates pass; the two non-RS-01 browser failures
were proven pre-existing by A/B testing against baseline code.