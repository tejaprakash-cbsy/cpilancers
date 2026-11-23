# Current Task

## Assignment

ID: `BATCH-3C-AUTH-REFINED-ARCHITECTURE`

Status: `REVIEW_REQUIRED`

Approval: `APPROVED FOR LOCAL IMPLEMENTATION`

Task: Implement three additional authentication methods in CPI Lancers using `@supabase/ssr` with idempotent `AuthService.ensureUserRecords`, dedicated `/api/auth/otp/request` and `/api/auth/otp/verify` server endpoints, strict role allowlist enforcement, Google OAuth PKCE flow, and feature-flagged Phone OTP. Local only: no git push, no live DB migrations, do not touch migration 00018 or the forum-security branch.

## Actions Executed

1. **Idempotent User Provisioning (`AuthService.ensureUserRecords`):**
   - Implemented `AuthService.ensureUserRecords(authUser, requestedRole?)` with `createAdminClient()`.
   - Strict role security: Only permits `'client'` or `'consultant'` (defaults to `'client'`). Rejects `'admin'` unconditionally from query params, request bodies, or OAuth user metadata.
   - Idempotently creates records in `public.users` and `public.profiles` if missing, sets `status: 'active'`, marks `is_email_verified: true` for Google / verified Email OTP, and derives user names from metadata or fallback.
   - Implemented `AuthService.updateLastLogin(userId)` to keep login timestamps updated.

2. **Google OAuth Flow:**
   - Added "Continue with Google" button with Google SVG icon and `#365cf5` design tokens to both `login/page.tsx` and `register/page.tsx`.
   - On `/register`, preserves the selected role (`client` or `consultant`) in the OAuth redirect URL: `${getAppUrl()}/api/auth/callback?role=...&next=...`.
   - In `/api/auth/callback` (and `/auth/callback`), after `exchangeCodeForSession(code)` succeeds, it calls `AuthService.ensureUserRecords`, updates `last_login_at`, and safely redirects to `resolvePostLoginPath(role, next)` preventing open redirects.

3. **Dedicated Server OTP API Endpoints:**
   - Created `POST /api/auth/otp/request`:
     - Validates `{ channel: 'email', email, role? }` or `{ channel: 'phone', phone, role? }`.
     - Strictly enforces feature flag: blocks phone OTP requests with `403 Forbidden` if `NEXT_PUBLIC_ENABLE_PHONE_OTP !== 'true'`.
     - Calls `supabase.auth.signInWithOtp` and maps rate-limit errors to `RateLimitError` (HTTP 429).
   - Created `POST /api/auth/otp/verify`:
     - Validates `{ channel, identifier, token (6 digits), role? }`.
     - Calls `supabase.auth.verifyOtp`, runs `AuthService.ensureUserRecords`, updates `last_login_at`, and returns `{ success: true, data: { user: { id, email, role } } }`.
     - Sets session cookies server-side with hardened attributes via `@supabase/ssr`.
   - In `login/page.tsx`:
     - Added mode switcher: **Password** | **Email Code** (and **Phone Code** when enabled).
     - Connected 2-step OTP flows directly to the server endpoints with 60s cooldown timers.

4. **Verification & Diagnostics:**
   - `npx tsc --noEmit`: 0 errors.
   - `npm run lint`: 0 errors, 0 warnings.
   - `npx vitest run`: 48 test files passed, 1,008 tests passed (+22 unit tests in `src/tests/auth-enhancements.test.ts`).
   - Turbopack vs Webpack:
     - `npm run build` (Turbopack): Windows sandbox child process spawn issue on PostCSS worker IPC (`node process exited before we could connect to it`).
     - `npx next build --webpack`: Successfully compiled all 63 static and dynamic routes with zero errors.
