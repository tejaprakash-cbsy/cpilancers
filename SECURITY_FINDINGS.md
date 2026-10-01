# Security findings — recorded, NOT fixed

Scope: these were identified during the pre-audit completion phase. Per the
handover, none of them are fixed here. Each is carried into the dedicated
security audit.

Nothing in this file has been remediated. No code change accompanies any entry.

---

## 1. `formatErrorResponse` maps every `TypeError` to HTTP 400

**Location:** `src/lib/errors.ts` — `formatErrorResponse`

**Issue:** the catch-all branch treats any `TypeError` as a client validation
error and answers 400.

**Impact:** a `TypeError` is what a genuine server-side programming fault looks
like — a null dereference, a bad property access, an unexpected undefined. Those
are 500-class failures, not 400s. Two consequences:

1. Real server faults are reported to the client as "bad request", which sends
   operators and monitoring down the wrong path during an incident.
2. It leaks a signal: a caller can distinguish "your input was bad" from
   "something broke" and enumerate which inputs reach a code path that throws.

**Reproduction:** call any route handler that performs an unchecked property
access on a value the database can return null for. The response is 400 with a
validation-style message rather than 500.

**Audit question:** should the mapping be narrowed to the deliberate validation
errors only (`AppError` and its subclasses), with everything else falling
through to 500 and a generic message?

---

## 2. Illegal proposal state transitions answer 403, not 409

**Location:** `src/app/api/proposals/[id]/route.ts`; state machine in
`src/services/proposal.service.ts` (`transitionStatus`)

**Issue:** a transition the state machine forbids — e.g. `accepted` on an already
`withdrawn` proposal — is reported as 403 Forbidden rather than 409 Conflict.

**Impact:** the status code misdescribes the fault. Nothing is being forbidden;
the caller is authenticated and authorised, the request simply conflicts with
current resource state. Clients cannot distinguish "you may not do this" from
"this is not possible right now", so a correct client cannot retry or explain
appropriately. A 403 also risks being cached or treated as an auth problem by
intermediaries.

**Reproduction:** PATCH `/api/proposals/<id>` with `{status}` naming a transition
the state machine disallows for the proposal's current status.

**Audit question:** confirm this is intended API surface before changing it, and
align with whatever the rest of the API uses for state conflicts.

---

## 3. Milestones are accepted with `amount_cents = 0`

**Location:** contract/milestone validation and
`src/app/api/contracts/[id]/milestones/route.ts`

**Issue:** a milestone may be created with an amount of zero. There is no
non-zero constraint on the milestone amount.

**Impact:** a contract can be created whose milestone amounts do not sum to the
contract value, or whose milestones are all zero. Any payout, escrow or
completion maths derived from milestone amounts will then be wrong, and nothing
in the database rejects the inconsistency at write time.

**Reproduction:** create a contract, then add a milestone with `amount_cents: 0`.

**Audit question:** is a zero-amount milestone a legitimate business case (e.g. a
volunteered or in-kind milestone), or should it be constrained in the database?
This is a business-rule decision, not a security fix.

---

## 4. Landing-page expertise categories are unfiltered

**Location:** `src/app/page.tsx` — the `expertise` array

**Issue:** the expertise categories rendered on the landing page are a
hardcoded list with no filtering against the `skills` table or any taxonomy.

**Impact:** low. Content/ownership concern rather than a vulnerability — the list
can drift from what the platform actually supports, and there is no single source
of truth for the taxonomy.

**Reproduction:** n/a.

**Audit question:** design owner's decision on whether these should be
data-driven. Explicitly out of scope for engineering to change.

---

## 5. Client-supplied IDs are accepted but not used for authorization

**Location:** `src/services/client-api.service.ts` — `ClientProposalService` and
`ClientJobService` wrappers

**Issue:** these wrappers previously took a `userId` argument and ignored it.
The unused parameters have been removed as dead code, but the observation is
recorded: the client cannot and should not be the thing deciding identity.

**Impact:** none now that the parameters are gone. Recorded because the shape of
the code invited the assumption that the caller was being authenticated by them.

**Audit question:** none. Closed by the dead-parameter removal; retained here only
so the audit does not re-raise it as a finding.

---

## Carried into the audit, observed but not yet classified

- **`messages` is not in the `supabase_realtime` publication.** No migration in
  `supabase/migrations/` runs `ALTER PUBLICATION supabase_realtime ADD TABLE
  messages`, so realtime message delivery does not work; the channel subscribes
  and then reports `CHANNEL_ERROR`/`TIMED_OUT`. `chat-view.tsx` is written to
  degrade to HTTP polling, so the app is functional, but the realtime feature is
  not actually delivering. Fixing it is a schema migration and was explicitly
  out of scope. (Could not be runtime-verified — see QA_REPORT.md item 8.)
- **`src/app/api/profile/users/[id]/client` and `/consultant` return
  `{ success: false }` with no `error` object** on a 404, unlike every other
  profile route which returns a structured `{ error: { message, code } }`. The
  client wrapper's `body.error?.message` fallback degrades to the generic
  "Request failed", so it is cosmetic today, but the inconsistency could mask a
  real error later.