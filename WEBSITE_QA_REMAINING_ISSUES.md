# CPI Lancers - QA Remaining Issues

This document tracks identified bugs, limitations, and missing features discovered during the end-to-end functional QA testing.

## Unresolved Issues (Action Required)
*None. All Phase 1-8 development and UI implementation has been verified in local.*

## Known Limitations (By Design / Excluded from QA scope)

### 1. Registration Rate Limiting (Supabase limitation)
During testing, creating multiple accounts rapidly triggers Supabase's local email rate limit (HTTP 429). This is a limitation of the local test environment's configuration, not an application defect. Test users should be provisioned via the Admin API.

### 2. Consultants List Not Exposed
The `/consultants` page does not display a list of consultants. This is an intentional privacy and security decision by the architecture team; consultant lists are restricted to privileged admin endpoints. This is not a defect.

### 3. F-10 Realtime Issue (Supabase Realtime Configuration)
Realtime messaging delivery fails because the `messages` table is omitted from the `supabase_realtime` publication. Subscriptions return `CHANNEL_ERROR` or `TIMED_OUT`. The application falls back to manual and periodic polling. Adding the publication requires a schema migration and is out-of-scope for the pre-audit hardening phase.

### 4. Payment Provider Credentials
The system currently relies on a `MockPaymentProvider` for all payment workflows because valid sandbox Razorpay credentials (`RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`) were not provided in the environment. All business rules, schema validations, and state transitions are active and correctly verified by the backend. When live keys are provided, they should be tested in an isolated staging environment before modifying production data.
