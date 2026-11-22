# Current Task

## Assignment

ID: `BATCH-2C-PAYMENTS-NAV-PRIVACY`

Status: `REVIEW_REQUIRED`

Approval: `APPROVED FOR LOCAL IMPLEMENTATION`

Task: Batch 2c: Make payments fail closed, fix nav labels, add privacy sentence, check /contact. Working tree on master. Do NOT touch supabase/, forum files, or git state. Local only: no push, no commit, no secrets printed, no new dependencies. Small diffs.

## Actions Executed

1. **Payment Provider Fail-Closed (`src/lib/payments/razorpay.provider.ts`, `src/lib/errors.ts`):**
   - Added typed `PaymentsUnavailableError` (HTTP 503, code `PAYMENTS_UNAVAILABLE`).
   - Updated `getPaymentProvider()` to fail closed:
     - In production (`VERCEL_ENV === 'production' || NODE_ENV === 'production'`), throws `PaymentsUnavailableError` if `RAZORPAY_KEY_ID` or `RAZORPAY_KEY_SECRET` are missing. Mock provider is disallowed in production even if `USE_MOCK_PAYMENT === 'true'`.
     - In non-production, `MockPaymentProvider` is used ONLY when `USE_MOCK_PAYMENT === 'true'`.
     - If neither credentials nor `USE_MOCK_PAYMENT === 'true'` are present in development, throws `PaymentsUnavailableError` (no silent fallback to mock).
     - Added `resetPaymentProvider()` to allow resetting singleton provider in test environments.

2. **Payment API Routes Fail-Closed:**
   - Updated all payment, payout, connect, refund, release, and webhook routes:
     - `src/app/api/payments/route.ts` (GET and POST)
     - `src/app/api/payments/[id]/route.ts` (GET)
     - `src/app/api/payments/[id]/attach/route.ts` (POST)
     - `src/app/api/payments/[id]/confirm/route.ts` (POST)
     - `src/app/api/payments/[id]/refund/route.ts` (POST)
     - `src/app/api/payments/[id]/release/route.ts` (POST)
     - `src/app/api/payments/connect/route.ts` (GET and POST)
     - `src/app/api/payments/webhook/route.ts` (POST)
     - `src/app/api/payouts/route.ts` (GET)
   - In each route, checks payment provider availability before any database write and catches `PaymentsUnavailableError` to return HTTP 503 with `{ error: { code: 'PAYMENTS_UNAVAILABLE', message: 'Payments are not available yet.' } }`.
   - Webhook route rejects with 503 if `RAZORPAY_WEBHOOK_SECRET` is missing.
   - Verified that no database write occurs before the provider is called in any route.

3. **Header Labels (`src/components/layout/header.tsx`):**
   - Renamed navigation links in desktop and mobile drawer:
     - `"Community Forum"` -> `"Forum"`
     - `"Browse Freelancers"` -> `"Consultants"`
     - `"Browse Jobs"` -> `"Jobs"`

4. **Privacy Page (`src/app/privacy/page.tsx`):**
   - Added exact sentence under "Commitment to Confidentiality":
     `"We use Vercel Web Analytics to count page views. It does not use cookies to identify visitors."`

5. **Unit & Integration Tests (`src/tests/payments-fail-closed.test.ts`):**
   - Added 15 comprehensive unit tests covering:
     - Production without credentials throws `PaymentsUnavailableError`.
     - Development without flag throws `PaymentsUnavailableError`.
     - Development with flag uses `MockPaymentProvider`.
     - All payment routes return 503 with `{ error: { code: 'PAYMENTS_UNAVAILABLE', message: 'Payments are not available yet.' } }` in production without credentials.
     - Webhook route returns 503 when webhook secret is missing.
   - All 980 tests across 46 test files pass.

