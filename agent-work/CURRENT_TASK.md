# Current Task

## Assignment

ID: `ADMIN-AUDIT-CONTRACT-001`

Status: `REVIEW_REQUIRED`

Approval: `APPROVED`

APPROVED FOR LOCAL IMPLEMENTATION

Implement and complete the approved local CPI Lancers admin scope using this
contract as the API and security source of truth. Production access, production
database changes, administrator provisioning, deployment, and Git operations
remain outside scope.

## Scope

The authorized local implementation may address:

1. Dispute collection/detail routes and their route-level authorization and
   validation tests.
2. Failed-transaction pagination, filtering, and response-shape behavior.
3. UUID validation for dynamic admin route IDs.
4. Public serialization of known and unexpected errors without exposing raw
   database/provider details.
5. A responsive `/admin` dashboard using the existing admin APIs and design
   conventions.
6. Narrowing remaining broad admin detail projections based on actual
   consumers/schema fields.
7. Safe handling/removal of unused `ADMIN_EMAILS` without weakening database-
   backed authorization or exposing privileged values to browser code.
8. Local unit, service, route, security, and browser tests supported by the
   repository.

Do not modify migrations, production data, production environment values,
deployment settings, DNS, or production permissions. Do not invent a first
administrator or audit actor; document that bootstrap as blocked if it cannot
be safely implemented locally.

## Repository-grounded contract

### 1. Dispute routes

The intended routes are established in the module comment at
`src/app/api/admin/disputes/route.ts:4-7`:

- `GET /api/admin/disputes` — collection/queue.
- `GET /api/admin/disputes/[id]` — one dispute detail.
- `PATCH /api/admin/disputes/[id]` — status mutation.

The repository currently has only `src/app/api/admin/disputes/route.ts`; no
`src/app/api/admin/disputes/[id]/route.ts` exists. The current collection PATCH
uses the final pathname segment as the ID at lines 20-23, so the collection URL
resolves the literal segment `disputes`, not a dispute UUID. The implementation
task must create the dynamic route or otherwise correct the route structure
without changing the documented URL.

Authorization must preserve the existing convention: call
`requireAdminUser` before work, as the current route does at lines 25-27 and
43-45, then rely on `AdminService`'s database-backed active-admin check at
`src/services/admin.service.ts:163-187`.

The PATCH body must remain the strict
`adminDisputeUpdateSchema` at
`src/lib/validations/admin.schemas.ts:315-322`: `status` is a permitted dispute
status and `resolutionSummary` is optional in the schema but required by the
service for terminal statuses at `src/services/admin.service.ts:1047-1055`.

Success should follow the existing route convention: HTTP 200 and
`{ success: true, data }`, as currently returned at
`src/app/api/admin/disputes/route.ts:47-50`.

Required route-level regression tests:

- unauthenticated collection/detail GET and detail PATCH return 401;
- authenticated client/consultant access returns 403;
- active admin can GET collection and detail and PATCH a valid target;
- malformed JSON/body/schema returns 400 with the public validation contract;
- malformed dynamic ID returns the agreed 400 response;
- valid but nonexistent UUID returns 404;
- terminal transition requires `resolutionSummary`;
- the collection PATCH cannot accidentally use `disputes` as a target ID.

### 2. Failed-transaction pagination

The current endpoint is `GET /api/admin/payments`, with `failed=1` selecting
the triage branch at `src/app/api/admin/payments/route.ts:18-40`.
`adminPaymentFilterSchema` accepts `status`, `contractId`, `page`, and `limit`
at `src/lib/validations/admin.schemas.ts:238-268`; page is an integer >= 1 and
limit is 1-100.

The ordinary payment listing establishes the response convention:
`Paginated<Record<string, unknown>>` with `rows`, `total`, `page`, and `limit`
at `src/services/admin.service.ts:817-840`. It applies offset/range and
`contractId` filtering at lines 823-836.

The failed branch does not currently meet that convention. At
`src/services/admin.service.ts:895-922`, it:

- always filters each table to `status = 'failed'`;
- uses `limit` but ignores `page`;
- ignores `contractId`;
- returns separate `payments` and `payouts` arrays without totals or page
  metadata.

The selected response contract is separate pagination within one successful
response:

```ts
{
  success: true,
  data: {
    payments: { rows, total, page, limit },
    payouts: { rows, total, page, limit }
  }
}
```

The contract requires:

- preserve the existing meaning of failed status: payment and payout rows must
  come from their respective tables with `status = 'failed'`;
- enforce page >= 1 and limit 1-100 using the existing schema bounds;
- paginate `payments` and `payouts` independently, each with deterministic
  ordering and accurate resource-specific totals;
- return `rows`, `total`, `page`, and `limit` in each resource object;
- preserve distinct payment and payout resource types and columns; do not merge
  incompatible rows into one list.

The selected response shape does not decide how one shared `page` and `limit`
query pair should be applied to both independent resources beyond requiring the
same validated values for each resource. The implementation must document and
test that interpretation; it must not silently use a different page or limit
for one resource.

The schema confirms the relationship required for `contractId` filtering:

- `payments.id` is a UUID primary key at
  `supabase/migrations/00001_initial_schema.sql:367-369`;
- `payments.contract_id` is `UUID NOT NULL REFERENCES public.contracts(id) ON
  DELETE RESTRICT` at lines 369-370;
- `payouts.payment_id` is `UUID NOT NULL UNIQUE REFERENCES public.payments(id)
  ON DELETE RESTRICT` at lines 389-393.

Therefore the selected semantics are confirmed and required: apply
`contractId` directly to failed payments through `payments.contract_id`, and
include a failed payout only when its linked payment satisfies
`payouts.payment_id -> payments.id -> payments.contract_id = contractId`.
The implementation must use this relationship-aware filter and preserve the
foreign-key/nullability guarantees; it must not invent a payout-side
`contract_id` column or silently include unlinked rows. The current failed query
does not yet apply this filter, as noted at `src/services/admin.service.ts:895-922`.

Required tests after the decision: page 1/page 2, boundary limits, totals,
empty results, both resource types, failed-status preservation, independent
resource metadata, direct payment `contractId` filtering, relationship-aware
payout `contractId` filtering, and no-match behavior. No existing test
currently pins this contract.

### 3. Dynamic route ID validation

Affected dynamic admin routes are:

- `src/app/api/admin/users/[id]/route.ts:18-20`;
- `src/app/api/admin/jobs/[id]/route.ts:17-20`;
- `src/app/api/admin/proposals/[id]/route.ts:15-18`;
- `src/app/api/admin/reports/[id]/route.ts:13-16`;
- the intended dispute route, once split into `[id]`.

The actual schema uses UUID primary keys for users, jobs, proposals, disputes,
and reports in `supabase/migrations/00001_initial_schema.sql:55-58,209-210,252-255,439-462`.
The installed repository package is Zod `4.6.5` (`node_modules/zod/package.json`),
and the installed API exposes `z.uuid()`. A local runtime check confirmed that
`z.uuid()` accepts a standard hyphenated UUID and an uppercase hyphenated UUID,
and rejects braces, compact/no-hyphen form, `urn:uuid:` form, surrounding
whitespace, and arbitrary text. The contract therefore defines canonical IDs as
the hyphenated UUID representation accepted by the installed `z.uuid()` API;
uppercase remains accepted because that is the verified installed behavior.
Lowercase-only enforcement is not established by the repository and must not be
silently added by implementation.

Required consistent behavior:

- malformed or rejected noncanonical ID: HTTP 400 with the stable generic public
  message `Invalid resource ID.`, no service/database detail leakage;
- valid UUID with no row: HTTP 404 using the existing `NotFoundError` convention;
- valid UUID with a row: continue to the existing admin authorization and
  resource operation.

Required tests cover every affected route and relevant method: canonical
lowercase UUID, uppercase hyphenated UUID accepted by installed Zod, malformed
IDs, braces/compact/URN/whitespace representations rejected by installed Zod,
valid-but-nonexistent UUID (404), and an authorized existing resource. Tests
must also prove authentication and authorization run before any resource detail
is exposed.

### 4. Public error serialization

The shared admin wrapper catches handler failures at
`src/lib/admin/route-helpers.ts:78-84` and delegates to
`formatErrorResponse`. Known public error classes and codes are defined in
`src/lib/errors.ts:7-55`: `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`,
`VALIDATION_ERROR`, and `CONFLICT`.

The implementation contract must ensure clients receive only:

- stable public error code;
- safe public message appropriate to the status;
- sanitized validation field details where useful, with no raw submitted secret
  values;
- no raw Supabase/Postgres/Razorpay error object, SQL text, provider ID,
  credentials, stack, headers, or internal filesystem data.

This is not currently guaranteed for `AppError`: lines 96-105 return
`error.details` directly, and many admin service errors pass raw database/RPC
objects as details, such as `src/services/admin.service.ts:919-920` and
`1070-1080`. The generic unknown-error branch does sanitize the message in
production at `src/lib/errors.ts:154-165`, but that does not sanitize explicit
`AppError.details`.

Server diagnostics must remain available through controlled server-side
structured logging. Each public error response must carry or otherwise expose a
safe request correlation ID that links it to the server diagnostic entry. A
trustworthy incoming correlation ID may be reused only after format validation;
otherwise the server must generate one. Arbitrary incoming values must not be
trusted. Logs must redact secrets and sensitive personal/payment data and must
not indiscriminately record complete provider/database error objects. The
repository does not currently prove that this correlation/logging behavior
exists, so it is a future implementation requirement rather than an existing
capability. Public error safety must not depend on `NODE_ENV`.

Required tests:

- known `UnauthorizedError`, `ForbiddenError`, `NotFoundError`,
  `ValidationError`, and `ConflictError` preserve status/code and safe text;
- Zod errors return only field/code/message details;
- unexpected `Error` returns the approved generic internal error response in
  every supported environment;
- an `AppError` containing a fake database/provider error does not expose its
  message, details, stack, SQL, or identifiers;
- admin route wrappers return the same sanitized contract for service/database
  failures;
- responses contain a safe correlation ID;
- valid-format incoming correlation IDs are reused only when they pass the
  approved format validation, while invalid/missing values receive generated
  IDs;
- structured diagnostics include the correlation ID but redact secrets,
  sensitive personal/payment fields, raw provider/database objects, and stacks
  from unapproved sinks.

## Acceptance criteria

The future implementation task is acceptable only when:

1. Dispute collection/detail routes are distinct, use the specified methods,
   preserve admin authorization and strict request validation, and have route
   tests for success, malformed input, 401, and 403.
2. Failed-transaction pagination implements the selected separate response
   shape, defined page/limit/totals behavior, confirmed relationship-aware
   `contractId` semantics, and tests for both payments and payouts while
   preserving failed status.
3. All affected dynamic routes validate UUID IDs consistently and test 400,
   404, authorized success, and unauthorized access.
4. Public error responses expose only approved stable codes/messages/details and
   retain sensitive diagnostics only on the server side, with regression tests
   for known, unexpected, and sensitive-detail cases.
5. TypeScript, relevant unit tests, route-level tests, and lint/build checks
   required by the implementation task are actually run and recorded; no test
   may be reported as passing without observed output.

## Dependencies and unresolved decisions

- Human/security review of the exact correlation-ID format and structured-log
  field redaction policy.
- Route-level test harness conventions and non-production admin fixtures.
- Existing `AdminService` and migration contracts must remain authorization
  boundaries; this task must not weaken them.

## Checkpoint

Current phase: `REVIEW_REQUIRED` — local implementation, tests, lint, and build
completed. Human review is required before any release or privileged operation.

Completed phases: contract definition, local schema/Zod verification, admin UI,
route/API corrections, validation/error hardening, projection/configuration
review, regression tests, and local verification.

Remaining review items: authenticated browser authorization coverage needs
legitimate non-production admin/client fixtures; production migration and
permission state, first-administrator bootstrap, and audit-actor provisioning
remain explicitly blocked.

## Approval state

Implementation is approved for the local scope above. The exact approval marker
is present in this task record. Production and privileged bootstrap operations
remain blocked and must not be performed.
