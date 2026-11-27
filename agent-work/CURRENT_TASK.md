# Current Task

## Assignment

ID: `BATCH-12-PROFILE-EDIT-AND-SETTINGS`

Status: `REVIEW_REQUIRED`

Approval: `APPROVED FOR LOCAL IMPLEMENTATION`

Task: Implement `/profile/edit`, `/settings`, INR/India defaults in `src/lib/validations/profile.schemas.ts`, authenticated `POST /api/auth/change-password`, and working `DashboardShell` `Settings` / `Notifications` / `Account menu` + `AppChrome` double-header suppression.

## Actions Executed

1. **INR / India Validation Defaults (`src/lib/validations/profile.schemas.ts`):**
   - Updated `countryCode` default to `'IN'`, `timezone` default to `'Asia/Kolkata'`, and `hourlyRateCents` (paise) bounds to `50000` (₹500/hr) – `5000000` (₹50,000/hr).
2. **Edit Profile (`src/app/profile/edit/page.tsx`):**
   - Implemented full personal details (`public.profiles`), consultant profile (`consultant_profiles` with ₹/hr ↔ paise conversion, IST timezone, Indian hub city chips, and SAP skills management via `/api/profile/skills` + `/api/profile/consultants/[id]/skills`), and client/company profile (`client_profiles` + `companies`) inside `<DashboardShell>`, supporting both initial `POST /api/profile` creation and `PATCH /api/profile` updates.
3. **Account Settings (`src/app/settings/page.tsx` + `src/app/api/auth/change-password/route.ts`):**
   - Built `/settings` inside `<DashboardShell>` with Account Information, Password & Security (wired to rate-limited authenticated `POST /api/auth/change-password`), Notification Preferences (`GET`/`PATCH /api/notification-preferences`), and Account Support.
4. **DashboardShell & AppChrome Wiring:**
   - Updated `Settings` footer link to `/settings`, Notifications bell to `/settings#notifications`, top-right `{initials}` button to an accessible dropdown menu (`View Profile`, `Edit Profile`, `Settings`, `Log out`), and added `'/settings'` and `'/profile/edit'` to `CHROME_FREE_PREFIXES` in `src/components/layout/app-chrome.tsx`.
5. **Verification:**
   - Updated `src/tests/foundation.test.ts` and added `src/tests/profile-settings.test.ts` (4 tests).
   - Verified `npx tsc --noEmit`, `npm run lint`, `npx vitest run` (54 files, 1,048 tests passed), and `npx next build --webpack` (exit code 0).
