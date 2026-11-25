# Current Task

## Assignment

ID: `BATCH-3D-GOOGLE-OAUTH-PKCE-FIX`

Status: `COMPLETED`

Approval: `APPROVED FOR LOCAL IMPLEMENTATION`

Task: Fix Google OAuth PKCE `code challenge does not match previously saved code verifier` error by implementing server-side OAuth initiation (`GET /api/auth/oauth/google`), updating client buttons, and sanitizing PKCE errors in callback. Local only: no git push, no live DB migrations, do not touch migration 00018 or the forum-security branch.

## Actions Executed

1. **Server-Side OAuth Initiation (`GET /api/auth/oauth/google`):**
   - Created `src/app/api/auth/oauth/google/route.ts`:
     - Reads and strictly allowlists `role` (`'client'` | `'consultant'`, defaulting to `'client'`; `'admin'` rejected).
     - Validates `next` with `safeCallbackRedirect`.
     - Calls `supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: `${getAppUrl()}/api/auth/callback?...`, skipBrowserRedirect: true } })` using `createServerClient()`.
     - Sets the PKCE `code-verifier` cookie via `createServerClient` with `hardenSessionCookieOptions` (`HttpOnly`, `Secure`, `SameSite=Lax`) and explicitly attaches `Set-Cookie` headers to `NextResponse.redirect(data.url)`.
     - Because both initiation and callback now use `createServerClient()`, `HttpOnly` cookies overwrite cleanly every time, resolving the browser `document.cookie` permission restriction.

2. **UI Navigation:**
   - In `src/app/(auth)/login/page.tsx` and `src/app/(auth)/register/page.tsx`:
     - Updated the "Continue with Google" button handlers to navigate to `/api/auth/oauth/google?...`.
     - Handlers immediately set loading state (`isGoogleLoading = true`), disabling the button to prevent double-clicks during navigation.

3. **Callback Error Sanitization:**
   - In `src/lib/auth/callback-handler.ts`:
     - Created `sanitizeCallbackErrorMessage(rawMessage)` to sanitize raw PKCE error messages (`code challenge does not match previously saved code verifier`, `pkce verification failed`, etc.) into a friendly user message: *"Your sign-in session expired or was interrupted. Please try signing in again."*.
     - Ensured internal error logging captures technical error details while `/auth-error` receives the sanitized message.

4. **Verification & Tests:**
   - Created `src/tests/auth-oauth-google.test.ts` (9 unit tests):
     - Verified role allowlist enforcement (`client`, `consultant`, rejection of `admin`).
     - Verified safe `next` validation and stripping of external open-redirect targets.
     - Verified PKCE code-verifier cookie attachment with `HttpOnly`, `Secure`, `SameSite=Lax`.
     - Verified redirection to OAuth provider URL and error fallback to `/auth-error`.
   - Updated `src/tests/auth-enhancements.test.ts` (26 unit tests):
     - Added tests for `sanitizeCallbackErrorMessage` and PKCE code challenge mismatch redirection.
   - `npx tsc --noEmit`: 0 errors.
   - `npm run lint`: 0 errors, 0 warnings.
   - `npx vitest run`: 49 test files passed, 1,021 tests passed (0 failures).
   - `npx next build --webpack`: successfully compiled all 64 static and dynamic routes with exit code 0.
