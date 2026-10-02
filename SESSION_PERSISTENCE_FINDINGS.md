# Session Persistence Investigation Findings

## 1. Root Cause
The reported "session persistence" and "Server Component authentication loss" issues are **not caused by a bug in Next.js, Turbopack, or the `@supabase/ssr` cookies implementation.**

The root cause is a **Data Inconsistency in Test Seeding**:
- The `sap-integration-marketplace` database schema does not use a PostgreSQL trigger to automatically copy new users from `auth.users` to `public.users`.
- Instead, it relies exclusively on the application code (`AuthService.register()`) to insert the user into `public.users` via the admin client upon registration.
- The automated QA pass (performed by the previous agent) seeded temporary test users (Client A, Consultant A, etc.) using a setup script or the Supabase Dashboard that created users *only* in `auth.users`, bypassing the application's registration logic.
- When the QA browser logged in as these seeded users, the login succeeded and the session cookies were perfectly valid and transmitted correctly.
- However, when Server Components or API routes (like `/api/profile` or `/api/auth/me`) called `AuthService.getCurrentUser()`, the service successfully parsed the JWT but failed to find the user in the `public.users` table (returning 0 rows / `PGRST116`).
- This caused the API routes to return `401 Unauthorized` or `404 Not Found`, which the client UI interpreted as the session being dropped, rendering "Authentication required" or "User record not found."

**Additionally, the Global Header Issue is separate:**
- The global navigation bar universally showing "Log in / Sign up" is not due to session loss.
- The `Header` component (`src/components/layout/header.tsx`) is currently hardcoded and contains no authentication logic to display the user's logged-in state.

## 2. Evidence
1. **Successful Manual Registration test:** We created a test script (`test-register.mjs`) that hits `/api/auth/register`. It successfully inserted the user into both `auth.users` and `public.users`, proving the application's registration code works.
2. **Successful API Session test:** We created a test script (`test-session.mjs`) that logged in and passed the resulting cookie to Next.js API routes. When the user existed in `public.users`, the API routes correctly identified the session and returned the user data.
3. **Exact Reproduction of the QA Error:** We modified the test script to intentionally insert a user *only* into `auth.users` (mimicking the QA seeding). When we fetched `/api/profile` with the valid session cookie, it returned `401 Unauthorized`, and the Next.js dev server logged `[DB Error - Get User]: { code: 'PGRST116', details: 'The result contains 0 rows' }` — perfectly matching the QA logs.
5. **PGRST204 / `budget` Column Error:** The QA run reported `PGRST204` when trying to insert jobs directly. Inspection of the database schema (`supabase/migrations/00001_initial_schema.sql`) confirms that the `jobs` table has `budget_type`, `budget_fixed_cents`, `budget_min_cents`, and `budget_max_cents` columns, but *no* `budget` column. The QA script attempting to bypass the UI incorrectly sent a `budget` payload field, triggering a PostgREST cache/schema error. This is a defect in the QA script, not the application.

## 3. Proposed Fix
Since the application's session management is actually working perfectly for users created via the UI, no complex cookie or middleware overhaul is required.

**Recommendations:**
1. **Acknowledge the false positive:** The "session loss" defect reported by the QA pass is a false positive caused by improper test data seeding.
2. **Fix QA Automation Scripts:** Update any QA seeding scripts to ensure users are registered via the UI or `/api/auth/register` (so they are inserted into `public.users`), and ensure direct job insertions use the correct budget columns (`budget_type`, `budget_fixed_cents`, etc.) instead of `budget`.
3. **Implement an `auth.users` Trigger (Optional but Recommended):** To prevent this data inconsistency from happening if users are created via the Supabase dashboard in the future, we should add a database migration that creates a PostgreSQL trigger on `auth.users` to automatically populate `public.users`.
4. **Update the Global Header:** Modify `src/components/layout/header.tsx` to read the authenticated session and display the user's avatar/dashboard links instead of "Log in / Sign up".

## 4. Risk
- **Trigger Migration Risk:** Very Low. Adding an `AFTER INSERT` trigger on `auth.users` is a standard Supabase pattern and will act as a safety net.
- **Header Update Risk:** Very Low. It involves standard React conditional rendering based on the existing `AuthService`.
- **Application Risk:** None. The core Next.js + Supabase SSR auth architecture is fundamentally sound.
