import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * Regression coverage for proposal validation and ownership relationships.
 *
 * The previous engineering sweep fixed two classes of real defects here and
 * shipped no tests for either:
 *
 *  1. Validation. `PATCH /api/proposals/[id]` used to hand-roll its update with
 *     truthiness checks (`if (body.x) updateData.x = body.x`), so a legitimate
 *     `0` was discarded, arbitrary types reached the database, and a ZodError
 *     escaping any `parse()` was reported as HTTP 500 by
 *     `formatErrorResponse`.
 *  2. Ownership relationships. `proposals.consultant_id` must be resolved from
 *     the authenticated user's consultant profile rather than trusted from the
 *     request body, and the `job.client_id -> client_profiles.user_id` chain
 *     must tolerate PostgREST returning a to-one embed as an object or a
 *     one-element array.
 *
 * Both fixes are unverified against regression, so these tests drive the real
 * exported handlers and the real service methods, and assert on the query that
 * actually reaches Supabase -- the properties that were broken live in the query
 * construction and the status code, not in the return value.
 *
 * Several tests pin behaviour that is arguably wrong (malformed JSON answering
 * 500, an empty PATCH body wiping milestones, a 201 with `data: null`). Those
 * are commented at the point of assertion and reported rather than fixed.
 */

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

type QueryCall = {
  op: string;
  args: unknown[];
};

type TableResult = { data?: unknown; error?: unknown; count?: number };

/** Recorded calls for one query chain. */
function makeQueryBuilder(result: { data?: unknown; error?: unknown; count?: number }) {
  const calls: QueryCall[] = [];
  const builder: Record<string, unknown> = {};

  for (const op of [
    'select',
    'insert',
    'update',
    'delete',
    'eq',
    'neq',
    'in',
    'or',
    'gte',
    'lte',
    'ilike',
    'contains',
    'order',
    'range',
    'single',
    'maybeSingle',
    'limit',
  ]) {
    // Capture every argument, not just the first: assertions need the value
    // lists passed to `.in()` and `.range()` as well as the column name.
    builder[op] = (...args: unknown[]) => {
      calls.push({ op, args });
      return builder;
    };
  }

  // The builder is thenable: awaiting it performs the query.
  builder.then = (resolve: (v: unknown) => void, reject?: (e: unknown) => void) =>
    Promise.resolve(result).then(resolve, reject);

  return { builder, calls };
}

/** A Supabase-client stand-in: `.from()` yields a fresh recorded builder. */
function makeClient(result: { data?: unknown; error?: unknown; count?: number }, calls: QueryCall[]) {
  const { builder } = makeQueryBuilder(result);
  return {
    from: () => {
      // Each call re-binds the shared recorder so every chain in one query is
      // captured in order.
      for (const op of Object.keys(builder)) {
        if (op === 'then') continue;
        (builder as Record<string, (...a: unknown[]) => unknown>)[op] = (...args: unknown[]) => {
          calls.push({ op, args });
          return builder;
        };
      }
      return builder;
    },
    storage: { from: () => ({ remove: async () => undefined, upload: async () => ({ error: null }) }) },
    auth: { getUser: async () => ({ data: { user: null }, error: null }) },
  };
}

const mockServerClient = vi.fn();
const mockAdminClient = vi.fn();
const mockGetCurrentUser = vi.fn();
const mockEmitEvent = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createClient: (...args: unknown[]) => mockServerClient(...args),
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: (...args: unknown[]) => mockAdminClient(...args),
}));

vi.mock('@/services/auth.service', () => ({
  AuthService: { getCurrentUser: (...args: unknown[]) => mockGetCurrentUser(...args) },
}));

// The proposal service emits real notification events on every submission and
// every decision. Left unmocked those fan out to SendGrid; stubbed here so the
// assertions are about proposal behaviour only, and so the recipient of each
// notification is itself assertable.
vi.mock('@/services/notification.service', () => ({
  NotificationService: { emitEvent: (...args: unknown[]) => mockEmitEvent(...args) },
}));

import {
  PROPOSAL_TRANSITIONS,
  TRANSITION_ACTOR,
  proposalCreateSchema,
  proposalStatusUpdateSchema,
  proposalUpdateSchema,
} from '@/lib/validations/proposal.schemas';
import type { ProposalStatus } from '@/lib/validations/proposal.schemas';
import { ProposalService } from '@/services/proposal.service';
import { GET as LIST_PROPOSALS, POST as CREATE_PROPOSAL } from '@/app/api/proposals/route';
import {
  GET as GET_PROPOSAL,
  PATCH as PATCH_PROPOSAL,
  DELETE as DELETE_PROPOSAL,
} from '@/app/api/proposals/[id]/route';

// ---------------------------------------------------------------------------
// Table-dispatching admin client
//
// `ProposalService` calls `createAdminClient()` once per method and then issues
// one `.from()` per logical query -- `proposals -> consultant_profiles` for an
// ownership check, `proposals -> jobs` for a status transition, and so on. The
// mock therefore serves each table from its own queue of results, consumed in
// `.from()` call order and then held at the last entry. That keeps a read and
// the write that follows it distinguishable on the same table.
// ---------------------------------------------------------------------------

const tableResults: Record<string, TableResult[]> = {};
const tableCursors: Record<string, number> = {};
const tableCalls: Record<string, QueryCall[]> = {};

function setTableResult(table: string, ...results: TableResult[]): void {
  tableResults[table] = results;
  tableCursors[table] = 0;
  tableCalls[table] = [];
}

function callsFor(table: string): QueryCall[] {
  return tableCalls[table] ?? (tableCalls[table] = []);
}

/** Every recorded query, tagged with its table, for "did X reach the DB" checks. */
function allRecordedCalls(): Array<{ table: string; op: string; args: unknown[] }> {
  return Object.entries(tableCalls).flatMap(([table, calls]) =>
    calls.map((c) => ({ table, op: c.op, args: c.args }))
  );
}

/** The single payload handed to `.update(payload)` on a table, if any. */
function updatePayload(table: string): Record<string, unknown> | undefined {
  const call = callsFor(table).find((c) => c.op === 'update');
  return call ? (call.args[0] as Record<string, unknown>) : undefined;
}

/** The single payload handed to `.insert(payload)` on a table, if any. */
function insertPayload(table: string): Record<string, unknown> | undefined {
  const call = callsFor(table).find((c) => c.op === 'insert');
  return call ? (call.args[0] as Record<string, unknown>) : undefined;
}

function ok(data: unknown, count?: number): TableResult {
  return count === undefined ? { data, error: null } : { data, error: null, count };
}

/** A client whose `.from(table)` is routed to that table's result queue. */
function tableDispatchClient() {
  return {
    from: (table: string) => {
      const queue = tableResults[table] ?? [];
      const cursor = tableCursors[table] ?? 0;
      tableCursors[table] = cursor + 1;
      const result: TableResult =
        queue.length === 0 ? { data: null, error: null } : queue[Math.min(cursor, queue.length - 1)];
      return makeClient(result, callsFor(table)).from();
    },
    storage: { from: () => ({ remove: async () => undefined, upload: async () => ({ error: null }) }) },
    auth: { getUser: async () => ({ data: { user: null }, error: null }) },
  };
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const CONSULTANT_USER = '11111111-1111-4111-8111-111111111111';
const CONSULTANT_PROFILE = '22222222-2222-4222-8222-222222222222';
const OTHER_CONSULTANT_USER = '33333333-3333-4333-8333-333333333333';
const OTHER_CONSULTANT_PROFILE = '44444444-4444-4444-8444-444444444444';
/** An id that must never appear in any query the routes issue. */
const ATTACKER_PROFILE = '99999999-9999-4999-8999-999999999999';
const CLIENT_USER = '55555555-5555-4555-8555-555555555555';
const CLIENT_PROFILE = '66666666-6666-4666-8666-666666666666';
const STRANGER_USER = '77777777-7777-4777-8777-777777777777';
const JOB_ID = '88888888-8888-4888-8888-888888888888';
const PROPOSAL_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

const MILESTONE = { title: 'Discovery', due_weeks: 2, amount_cents: 50000 };

/** A create body that satisfies `proposalCreateSchema` exactly. */
function validCreateBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    job_id: JOB_ID,
    cover_letter_markdown: 'C'.repeat(120),
    technical_solution_markdown: 'T'.repeat(80),
    proposed_duration_weeks: 6,
    proposed_price_cents: 150000,
    proposed_milestones: [MILESTONE],
    ...overrides,
  };
}

/** A persisted `proposals` row. */
function proposalRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: PROPOSAL_ID,
    job_id: JOB_ID,
    consultant_id: CONSULTANT_PROFILE,
    cover_letter_markdown: 'C'.repeat(120),
    technical_solution_markdown: 'T'.repeat(80),
    proposed_duration_weeks: 6,
    proposed_price_cents: 150000,
    proposed_milestones: [MILESTONE],
    status: 'draft',
    client_viewed_at: null,
    submitted_at: '2026-01-01T00:00:00.000Z',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

/** The `jobs` row the create flow loads, plus the re-read the notifier performs. */
function openJobRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: JOB_ID,
    client_id: CLIENT_PROFILE,
    company_id: null,
    status: 'open',
    title: 'SAP S/4HANA migration',
    ...overrides,
  };
}

/**
 * The row `updateProposal` reads: id, status and consultant_id only. A caller
 * whose profile is not this row's author must be refused.
 */
function authorRowForPatch(status: string, ownerUserId: string, ownerProfileId: string) {
  setTableResult('proposals', ok(proposalRow({ status, consultant_id: ownerProfileId })), ok({ id: PROPOSAL_ID }));
  setTableResult('consultant_profiles', ok({ id: ownerProfileId, user_id: ownerUserId }));
}

/**
 * The row `transitionStatus` reads, with the embeds the ownership chain walks:
 * `proposals.consultant_id -> consultant_profiles.user_id` and
 * `proposals.job -> jobs.client_id -> client_profiles.user_id`.
 */
function transitionRow(from: ProposalStatus, jobEmbed?: unknown) {
  return proposalRow({
    status: from,
    consultant_id: CONSULTANT_PROFILE,
    consultant: { id: CONSULTANT_PROFILE, user_id: CONSULTANT_USER },
    job: jobEmbed === undefined ? { id: JOB_ID, client_id: CLIENT_PROFILE, title: 'SAP S/4HANA migration' } : jobEmbed,
  });
}

function createRequest(body?: unknown): NextRequest {
  return new NextRequest('http://localhost/api/proposals', {
    method: 'POST',
    ...(body === undefined
      ? {}
      : { body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }),
  });
}

/** A POST whose body is a raw, possibly unparseable, string. */
function createRawRequest(raw: string): NextRequest {
  return new NextRequest('http://localhost/api/proposals', {
    method: 'POST',
    body: raw,
    headers: { 'content-type': 'application/json' },
  });
}

function proposalRequest(method: string, id = PROPOSAL_ID, body?: unknown): NextRequest {
  return new NextRequest(`http://localhost/api/proposals/${id}`, {
    method,
    ...(body === undefined
      ? {}
      : { body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }),
  });
}

function listRequest(query = ''): NextRequest {
  return new NextRequest(`http://localhost/api/proposals${query}`);
}

function asConsultant(userId = CONSULTANT_USER) {
  return { id: userId, role: 'consultant' };
}

function asClient(userId = CLIENT_USER) {
  return { id: userId, role: 'client' };
}

function resetSupabase(): void {
  for (const table of Object.keys(tableResults)) delete tableResults[table];
  for (const table of Object.keys(tableCursors)) delete tableCursors[table];
  for (const table of Object.keys(tableCalls)) delete tableCalls[table];

  mockServerClient.mockImplementation(async () => tableDispatchClient());
  mockAdminClient.mockImplementation(() => tableDispatchClient());
  mockEmitEvent.mockResolvedValue({ notification: { id: 'n1' }, created: true, deliveries: {} });
}

// The 500 paths below are asserted deliberately; silence the production logger
// so the failure output stays readable.
beforeAll(() => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

beforeEach(() => {
  vi.clearAllMocks();
  resetSupabase();
  mockGetCurrentUser.mockResolvedValue(null);
});

// ---------------------------------------------------------------------------
// A. Schema-level validation
// ---------------------------------------------------------------------------

describe('proposalCreateSchema: proposed_price_cents boundaries', () => {
  it.each([
    ['abc'],
    ['12.5.6'],
    ['1000'],
    [{}],
    [[]],
    [true],
    [null],
  ])('rejects the malformed price %j', (price) => {
    expect(() =>
      proposalCreateSchema.parse(validCreateBody({ proposed_price_cents: price }))
    ).toThrow();
  });

  it('rejects a negative price', () => {
    expect(() => proposalCreateSchema.parse(validCreateBody({ proposed_price_cents: -1 }))).toThrow();
    expect(() => proposalCreateSchema.parse(validCreateBody({ proposed_price_cents: -100 }))).toThrow();
  });

  it('rejects a non-integer price', () => {
    expect(() => proposalCreateSchema.parse(validCreateBody({ proposed_price_cents: 100.5 }))).toThrow();
  });

  it('rejects a zero price: the floor is $1.00, not $0.00', () => {
    const result = proposalCreateSchema.safeParse(validCreateBody({ proposed_price_cents: 0 }));

    // `min(100)` is a floor, so a free proposal cannot be submitted at all.
    expect(result.success).toBe(false);
    const issue = (result as { error: { issues: Array<{ code: string; path: unknown[] }> } }).error.issues[0];
    expect(issue.code).toBe('too_small');
    expect(issue.path).toEqual(['proposed_price_cents']);
  });

  it('accepts the smallest and largest prices the schema declares', () => {
    // Derived from the schema's own bounds: min(100) / max(100_000_00).
    expect(proposalCreateSchema.parse(validCreateBody({ proposed_price_cents: 100 })).proposed_price_cents).toBe(100);
    expect(proposalCreateSchema.parse(validCreateBody({ proposed_price_cents: 10_000_000 })).proposed_price_cents).toBe(
      10_000_000
    );
  });

  it('rejects one cent below the floor and one cent above the ceiling', () => {
    expect(() => proposalCreateSchema.parse(validCreateBody({ proposed_price_cents: 99 }))).toThrow();
    expect(() => proposalCreateSchema.parse(validCreateBody({ proposed_price_cents: 10_000_001 }))).toThrow();
  });

  it('accepts a zero-value milestone even though the total price cannot be zero', () => {
    // Asymmetry worth pinning: `amount_cents` is `min(0)` while
    // `proposed_price_cents` is `min(100)`, so a proposal can declare a
    // milestone list whose amounts all total $0.00.
    const parsed = proposalCreateSchema.parse(
      validCreateBody({ proposed_price_cents: 100, proposed_milestones: [{ ...MILESTONE, amount_cents: 0 }] })
    );

    expect(parsed.proposed_milestones[0].amount_cents).toBe(0);
    expect(() => proposalCreateSchema.parse(validCreateBody({ proposed_price_cents: 0 }))).toThrow();
  });
});

describe('proposalUpdateSchema: shape, immutability and length rules', () => {
  it('accepts an empty object without injecting any key', () => {
    const parsed = proposalUpdateSchema.parse({});

    // Regression: `.partial()` marks `proposed_milestones` optional but does not
    // remove its `.default([])`, so `parse({})` used to yield
    // `{ proposed_milestones: [] }`. PATCH then always had a key to write,
    // making its "no editable fields" guard unreachable, and an empty body
    // silently wiped every milestone. Absent must mean absent.
    expect(parsed).toEqual({});
    expect('proposed_milestones' in parsed).toBe(false);
  });

  it.each([
    ['a malformed price', { proposed_price_cents: 'abc' }],
    ['a negative price', { proposed_price_cents: -1 }],
    ['a boolean price', { proposed_price_cents: false }],
    ['an object price', { proposed_price_cents: {} }],
    ['an array price', { proposed_price_cents: [] }],
    ['a null price', { proposed_price_cents: null }],
  ])('rejects %s', (_label, patch) => {
    expect(() => proposalUpdateSchema.parse(patch)).toThrow();
  });

  it('rejects an over-long cover letter and technical solution', () => {
    expect(() => proposalUpdateSchema.parse({ cover_letter_markdown: 'C'.repeat(5001) })).toThrow();
    expect(() => proposalUpdateSchema.parse({ technical_solution_markdown: 'T'.repeat(5001) })).toThrow();
  });

  it('accepts text fields exactly at their documented maximum', () => {
    expect(proposalUpdateSchema.parse({ cover_letter_markdown: 'C'.repeat(5000) }).cover_letter_markdown).toHaveLength(
      5000
    );
    expect(
      proposalUpdateSchema.parse({ technical_solution_markdown: 'T'.repeat(5000) }).technical_solution_markdown
    ).toHaveLength(5000);
  });

  it('rejects a cover letter below the 100-character minimum', () => {
    // The minimum is enforced on PATCH too, even though the field is optional.
    expect(() => proposalUpdateSchema.parse({ cover_letter_markdown: 'C'.repeat(99) })).toThrow();
    expect(proposalUpdateSchema.parse({ cover_letter_markdown: 'C'.repeat(100) })).toBeTruthy();
  });

  it('rejects an over-long milestone title, description and note', () => {
    expect(() =>
      proposalUpdateSchema.parse({ proposed_milestones: [{ ...MILESTONE, title: 'x'.repeat(201) }] })
    ).toThrow();
    expect(() =>
      proposalUpdateSchema.parse({ proposed_milestones: [{ ...MILESTONE, description: 'x'.repeat(1001) }] })
    ).toThrow();
    expect(() => proposalStatusUpdateSchema.parse({ status: 'rejected', note: 'x'.repeat(1001) })).toThrow();
  });

  it('strips unknown and immutable fields instead of rejecting the body', () => {
    // The schema is non-strict: Zod objects drop unrecognised keys rather than
    // failing. `consultant_id` / `job_id` therefore survive the parse as absent
    // keys, which is what stops them reaching an update payload. The ROUTE-level
    // consequence of that is asserted in its own describe below.
    const parsed = proposalUpdateSchema.parse({
      consultant_id: ATTACKER_PROFILE,
      job_id: JOB_ID,
      status: 'accepted',
      proposed_price_cents: 150000,
    });

    expect(parsed).not.toHaveProperty('consultant_id');
    expect(parsed).not.toHaveProperty('job_id');
    expect(parsed).not.toHaveProperty('status');
    expect(parsed.proposed_price_cents).toBe(150000);
  });
});

// ---------------------------------------------------------------------------
// B. Valid creation
// ---------------------------------------------------------------------------

describe('POST /api/proposals: valid creation', () => {
  it('creates a valid proposal and answers 201 with { success, data }', async () => {
    mockGetCurrentUser.mockResolvedValue(asConsultant());
    const created = proposalRow({ status: 'submitted', submitted_at: '2026-02-02T00:00:00.000Z' });
    setTableResult('consultant_profiles', ok({ id: CONSULTANT_PROFILE, user_id: CONSULTANT_USER }));
    setTableResult('jobs', ok(openJobRow()), ok(openJobRow()));
    setTableResult('client_profiles', ok({ user_id: CLIENT_USER }), ok({ user_id: CLIENT_USER }));
    setTableResult('proposals', ok([]), ok(created));
    setTableResult('profiles', ok({ display_name: 'Ada Lovelace' }));

    const res = await CREATE_PROPOSAL(createRequest(validCreateBody()));
    const body = (await res.json()) as { success: boolean; data: Record<string, unknown> };

    expect(res.status).toBe(201);
    expect(body.success).toBe(true);
    expect(body.data).toEqual(created);
    expect(body.data.job_id).toBe(JOB_ID);
    expect(body.data.status).toBe('submitted');
  });

  it('resolves consultant_id from the profile, ignoring the request body', async () => {
    mockGetCurrentUser.mockResolvedValue(asConsultant());
    const created = proposalRow({ status: 'submitted' });
    setTableResult('consultant_profiles', ok({ id: CONSULTANT_PROFILE, user_id: CONSULTANT_USER }));
    setTableResult('jobs', ok(openJobRow()), ok(openJobRow()));
    setTableResult('client_profiles', ok({ user_id: CLIENT_USER }), ok({ user_id: CLIENT_USER }));
    setTableResult('proposals', ok([]), ok(created));
    setTableResult('profiles', ok({ display_name: 'Ada Lovelace' }));

    const res = await CREATE_PROPOSAL(
      createRequest(validCreateBody({ consultant_id: ATTACKER_PROFILE, user_id: ATTACKER_PROFILE }))
    );

    expect(res.status).toBe(201);
    const payload = insertPayload('proposals');
    // The ownership fix: the row is written against the caller's own profile.
    expect(payload?.consultant_id).toBe(CONSULTANT_PROFILE);
    // ...and the caller-supplied id reached neither the insert nor any filter.
    expect(JSON.stringify(allRecordedCalls())).not.toContain(ATTACKER_PROFILE);
  });

  it('scopes the duplicate check to the resolved consultant profile', async () => {
    mockGetCurrentUser.mockResolvedValue(asConsultant());
    setTableResult('consultant_profiles', ok({ id: CONSULTANT_PROFILE, user_id: CONSULTANT_USER }));
    setTableResult('jobs', ok(openJobRow()), ok(openJobRow()));
    setTableResult('client_profiles', ok({ user_id: CLIENT_USER }), ok({ user_id: CLIENT_USER }));
    setTableResult('proposals', ok([]), ok(proposalRow({ status: 'submitted' })));
    setTableResult('profiles', ok({ display_name: 'Ada Lovelace' }));

    await CREATE_PROPOSAL(createRequest(validCreateBody()));

    const filters = callsFor('proposals').filter((c) => c.op === 'eq');
    expect(filters.some((c) => c.args[0] === 'job_id' && c.args[1] === JOB_ID)).toBe(true);
    expect(filters.some((c) => c.args[0] === 'consultant_id' && c.args[1] === CONSULTANT_PROFILE)).toBe(true);
  });

  it('rejects a second active proposal for the same consultant and job with 409', async () => {
    mockGetCurrentUser.mockResolvedValue(asConsultant());
    setTableResult('consultant_profiles', ok({ id: CONSULTANT_PROFILE, user_id: CONSULTANT_USER }));
    setTableResult('jobs', ok(openJobRow()));
    setTableResult('client_profiles', ok({ user_id: CLIENT_USER }));
    setTableResult('proposals', ok([{ id: PROPOSAL_ID, status: 'submitted' }]));

    const res = await CREATE_PROPOSAL(createRequest(validCreateBody()));
    const body = (await res.json()) as { error: { code: string } };

    expect(res.status).toBe(409);
    expect(body.error.code).toBe('CONFLICT');
    expect(insertPayload('proposals')).toBeUndefined();
  });

  it('stores a save_as_draft proposal as a draft and does not notify the client', async () => {
    mockGetCurrentUser.mockResolvedValue(asConsultant());
    const created = proposalRow({ status: 'draft', submitted_at: null });
    setTableResult('consultant_profiles', ok({ id: CONSULTANT_PROFILE, user_id: CONSULTANT_USER }));
    setTableResult('jobs', ok(openJobRow()));
    setTableResult('client_profiles', ok({ user_id: CLIENT_USER }));
    setTableResult('proposals', ok([]), ok(created));

    const res = await CREATE_PROPOSAL(createRequest(validCreateBody({ save_as_draft: true })));

    expect(res.status).toBe(201);
    expect(insertPayload('proposals')?.status).toBe('draft');
    // A draft is the consultant's own working copy; telling the client would leak it.
    expect(insertPayload('proposals')?.submitted_at).toBeNull();
    expect(mockEmitEvent).not.toHaveBeenCalled();
  });

  it('notifies the job owner, not an id supplied by the caller', async () => {
    mockGetCurrentUser.mockResolvedValue(asConsultant());
    setTableResult('consultant_profiles', ok({ id: CONSULTANT_PROFILE, user_id: CONSULTANT_USER }));
    setTableResult('jobs', ok(openJobRow()), ok(openJobRow()));
    setTableResult('client_profiles', ok({ user_id: CLIENT_USER }), ok({ user_id: CLIENT_USER }));
    setTableResult('proposals', ok([]), ok(proposalRow({ status: 'submitted' })));
    setTableResult('profiles', ok({ display_name: 'Ada Lovelace' }));

    await CREATE_PROPOSAL(createRequest(validCreateBody()));

    expect(mockEmitEvent).toHaveBeenCalledTimes(1);
    const event = mockEmitEvent.mock.calls[0][0] as { userId: string; type: string };
    expect(event.type).toBe('proposal_received');
    expect(event.userId).toBe(CLIENT_USER);
  });

  it('refuses a consultant applying to a job they posted themselves', async () => {
    mockGetCurrentUser.mockResolvedValue(asConsultant());
    setTableResult('consultant_profiles', ok({ id: CONSULTANT_PROFILE, user_id: CONSULTANT_USER }));
    setTableResult('jobs', ok(openJobRow()));
    setTableResult('client_profiles', ok({ user_id: CONSULTANT_USER }));

    const res = await CREATE_PROPOSAL(createRequest(validCreateBody()));

    expect(res.status).toBe(403);
    expect(insertPayload('proposals')).toBeUndefined();
  });

  it('refuses a proposal against a job that is not open for applications', async () => {
    mockGetCurrentUser.mockResolvedValue(asConsultant());
    setTableResult('consultant_profiles', ok({ id: CONSULTANT_PROFILE, user_id: CONSULTANT_USER }));
    setTableResult('jobs', ok(openJobRow({ status: 'closed' })));

    const res = await CREATE_PROPOSAL(createRequest(validCreateBody()));

    expect(res.status).toBe(403);
    expect(insertPayload('proposals')).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// C. Invalid input
// ---------------------------------------------------------------------------

describe('POST /api/proposals: invalid input', () => {
  it('answers 400 with VALIDATION_ERROR for an invalid body', async () => {
    mockGetCurrentUser.mockResolvedValue(asConsultant());

    const res = await CREATE_PROPOSAL(createRequest(validCreateBody({ proposed_price_cents: 'abc' })));
    const body = (await res.json()) as {
      success: boolean;
      error: { code: string; details: Array<{ field: string; code: string }> };
    };

    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.details[0]).toMatchObject({ field: 'proposed_price_cents', code: 'invalid_type' });
    // Validation runs before any write.
    expect(insertPayload('proposals')).toBeUndefined();
  });

  it('answers 400 when required fields are missing', async () => {
    mockGetCurrentUser.mockResolvedValue(asConsultant());
    const body = validCreateBody();
    delete body.cover_letter_markdown;
    delete body.job_id;

    const res = await CREATE_PROPOSAL(createRequest(body));
    const json = (await res.json()) as { error: { code: string; details: Array<{ field: string }> } };

    expect(res.status).toBe(400);
    expect(json.error.code).toBe('VALIDATION_ERROR');
    const fields = json.error.details.map((d) => d.field);
    expect(fields).toContain('job_id');
    expect(fields).toContain('cover_letter_markdown');
  });

  it('answers 400 for a non-uuid job id', async () => {
    mockGetCurrentUser.mockResolvedValue(asConsultant());

    const res = await CREATE_PROPOSAL(createRequest(validCreateBody({ job_id: 'not-a-uuid' })));

    expect(res.status).toBe(400);
  });

  it('answers 400 for a literal JSON null body', async () => {
    mockGetCurrentUser.mockResolvedValue(asConsultant());

    // `proposalCreateSchema.parse(null)` is a ZodError, so this path is a
    // clean 400 -- contrast with the raw-garbage cases below.
    const res = await CREATE_PROPOSAL(createRawRequest('null'));

    expect(res.status).toBe(400);
  });

  it('answers 400 with INVALID_JSON for a malformed JSON body', async () => {
    mockGetCurrentUser.mockResolvedValue(asConsultant());

    const res = await CREATE_PROPOSAL(createRawRequest('{ this is not json'));
    const body = (await res.json()) as { error: { code: string } };

    // `request.json()` rejects with a SyntaxError, which is a client input
    // error. `formatErrorResponse` now maps it to 400 rather than telling the
    // caller the server broke.
    expect(res.status).toBe(400);
    expect(body.error.code).toBe('INVALID_JSON');
  });

  it('answers 400 for a request with no body at all', async () => {
    mockGetCurrentUser.mockResolvedValue(asConsultant());

    const res = await CREATE_PROPOSAL(createRequest());

    // Same cause as the malformed-JSON case: `request.json()` throws
    // "Unexpected end of JSON input", which is also mapped to a 400.
    expect(res.status).toBe(400);
  });

  it('answers 400 for a malformed body on PATCH', async () => {
    mockGetCurrentUser.mockResolvedValue(asConsultant());

    const res = await PATCH_PROPOSAL(
      new NextRequest(`http://localhost/api/proposals/${PROPOSAL_ID}`, {
        method: 'PATCH',
        body: '{"proposed_price_cents":',
        headers: { 'content-type': 'application/json' },
      })
    );

    expect(res.status).toBe(400);
  });

  it('answers 400 for a literal JSON null body on PATCH', async () => {
    mockGetCurrentUser.mockResolvedValue(asConsultant());

    // The PATCH handler reads `requestBody.status` before any schema check, so a
    // body of `null` used to throw a TypeError and become a 500 -- while the
    // same body on POST was a clean 400. `formatErrorResponse` now maps the
    // TypeError to a 400 so both methods agree.
    const res = await PATCH_PROPOSAL(
      new NextRequest(`http://localhost/api/proposals/${PROPOSAL_ID}`, {
        method: 'PATCH',
        body: 'null',
        headers: { 'content-type': 'application/json' },
      })
    );

    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// D. Authorization
// ---------------------------------------------------------------------------

describe('proposal routes: authorization', () => {
  it('refuses an unauthenticated caller creating a proposal with 401', async () => {
    mockGetCurrentUser.mockResolvedValue(null);

    const res = await CREATE_PROPOSAL(createRequest(validCreateBody()));
    const body = (await res.json()) as { error: { code: string } };

    expect(res.status).toBe(401);
    expect(body.error.code).toBe('UNAUTHORIZED');
    expect(insertPayload('proposals')).toBeUndefined();
  });

  it('refuses an unauthenticated caller reading, patching and deleting with 401', async () => {
    mockGetCurrentUser.mockResolvedValue(null);

    const read = await GET_PROPOSAL(proposalRequest('GET'));
    const patched = await PATCH_PROPOSAL(proposalRequest('PATCH', PROPOSAL_ID, { proposed_price_cents: 200000 }));
    const deleted = await DELETE_PROPOSAL(proposalRequest('DELETE'));

    expect([read.status, patched.status, deleted.status]).toEqual([401, 401, 401]);
    expect(updatePayload('proposals')).toBeUndefined();
  });

  it('refuses a client creating a proposal with 403', async () => {
    mockGetCurrentUser.mockResolvedValue(asClient());

    const res = await CREATE_PROPOSAL(createRequest(validCreateBody()));
    const body = (await res.json()) as { error: { code: string } };

    expect(res.status).toBe(403);
    expect(body.error.code).toBe('FORBIDDEN');
    expect(insertPayload('proposals')).toBeUndefined();
  });

  it('refuses a client listing proposals with 403', async () => {
    mockGetCurrentUser.mockResolvedValue(asClient());

    const res = await LIST_PROPOSALS(listRequest());

    expect(res.status).toBe(403);
  });

  it('refuses a consultant patching a proposal they do not own', async () => {
    mockGetCurrentUser.mockResolvedValue(asConsultant(OTHER_CONSULTANT_USER));
    authorRowForPatch('draft', CONSULTANT_USER, CONSULTANT_PROFILE);

    const res = await PATCH_PROPOSAL(proposalRequest('PATCH', PROPOSAL_ID, { proposed_price_cents: 200000 }));
    const body = (await res.json()) as { error: { code: string } };

    expect(res.status).toBe(403);
    expect(body.error.code).toBe('FORBIDDEN');
    // The ownership check happens before the write.
    expect(updatePayload('proposals')).toBeUndefined();
  });

  it('refuses a consultant deleting a proposal they do not own', async () => {
    mockGetCurrentUser.mockResolvedValue(asConsultant(OTHER_CONSULTANT_USER));
    const row = proposalRow({ status: 'submitted', consultant_id: OTHER_CONSULTANT_PROFILE });
    setTableResult('proposals', ok(row), ok({ ...row, status: 'withdrawn' }));
    setTableResult('consultant_profiles', ok({ user_id: CONSULTANT_USER }));
    setTableResult('client_profiles', ok({ user_id: CLIENT_USER }));

    const res = await DELETE_PROPOSAL(proposalRequest('DELETE'));
    const body = (await res.json()) as { error: { code: string } };

    // DELETE is a withdrawal, so it must fail the same author check as PATCH.
    expect(res.status).toBe(403);
    expect(body.error.code).toBe('FORBIDDEN');
    expect(updatePayload('proposals')).toBeUndefined();
  });

  it('refuses a GET from someone who is neither the author nor the job owner with 403', async () => {
    mockGetCurrentUser.mockResolvedValue({ id: STRANGER_USER, role: 'consultant' });
    setTableResult('proposals', ok(transitionRow('submitted')));
    setTableResult('consultant_profiles', ok({ user_id: CONSULTANT_USER }));
    setTableResult('client_profiles', ok({ user_id: CLIENT_USER }));

    const res = await GET_PROPOSAL(proposalRequest('GET'));
    const body = (await res.json()) as { error: { code: string } };

    expect(res.status).toBe(403);
    expect(body.error.code).toBe('FORBIDDEN');
  });

  it('lets the author read their own proposal', async () => {
    mockGetCurrentUser.mockResolvedValue(asConsultant());
    const row = transitionRow('submitted');
    setTableResult('proposals', ok(row));
    setTableResult('consultant_profiles', ok({ user_id: CONSULTANT_USER }));
    setTableResult('client_profiles', ok({ user_id: CLIENT_USER }));

    const res = await GET_PROPOSAL(proposalRequest('GET'));
    const body = (await res.json()) as { success: boolean; data: { id: string } };

    expect(res.status).toBe(200);
    expect(body.data.id).toBe(PROPOSAL_ID);
  });

  it('lets the job owner read the proposal when the job embed is an object', async () => {
    mockGetCurrentUser.mockResolvedValue(asClient());
    setTableResult('proposals', ok(transitionRow('submitted', { id: JOB_ID, client_id: CLIENT_PROFILE })));
    setTableResult('consultant_profiles', ok({ user_id: CONSULTANT_USER }));
    setTableResult('client_profiles', ok({ user_id: CLIENT_USER }));

    const res = await GET_PROPOSAL(proposalRequest('GET'));

    expect(res.status).toBe(200);
  });

  it('lets the job owner read the proposal when the job embed is a one-element array', async () => {
    mockGetCurrentUser.mockResolvedValue(asClient());
    // PostgREST types every embedded relation as an array because supabase-js
    // cannot infer cardinality from the foreign key, so a to-one embed can
    // arrive either way. Reading `.client_id` off the array shape silently
    // yields `undefined` and denies the legitimate owner access.
    setTableResult('proposals', ok(transitionRow('submitted', [{ id: JOB_ID, client_id: CLIENT_PROFILE }])));
    setTableResult('consultant_profiles', ok({ user_id: CONSULTANT_USER }));
    setTableResult('client_profiles', ok({ user_id: CLIENT_USER }));

    const res = await GET_PROPOSAL(proposalRequest('GET'));

    expect(res.status).toBe(200);
  });

  it('answers 404 when the proposal does not exist', async () => {
    mockGetCurrentUser.mockResolvedValue(asConsultant());
    setTableResult('proposals', ok(null));

    const res = await GET_PROPOSAL(proposalRequest('GET'));
    const body = (await res.json()) as { error: { code: string } };

    expect(res.status).toBe(404);
    expect(body.error.code).toBe('NOT_FOUND');
  });
});

// ---------------------------------------------------------------------------
// E. PATCH route: the update allowlist
// ---------------------------------------------------------------------------

describe('PATCH /api/proposals/[id]: update allowlist', () => {
  it('writes a validated field and stamps updated_at', async () => {
    mockGetCurrentUser.mockResolvedValue(asConsultant());
    authorRowForPatch('draft', CONSULTANT_USER, CONSULTANT_PROFILE);

    const res = await PATCH_PROPOSAL(proposalRequest('PATCH', PROPOSAL_ID, { proposed_price_cents: 250000 }));
    const body = (await res.json()) as { success: boolean };

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    const payload = updatePayload('proposals');
    expect(payload?.proposed_price_cents).toBe(250000);
    expect(typeof payload?.updated_at).toBe('string');
  });

  it('preserves an explicit zero and an explicit empty milestone list', async () => {
    // The truthiness bug this replaced discarded 0 and `[]`.
    mockGetCurrentUser.mockResolvedValue(asConsultant());
    authorRowForPatch('draft', CONSULTANT_USER, CONSULTANT_PROFILE);

    const res = await PATCH_PROPOSAL(
      proposalRequest('PATCH', PROPOSAL_ID, { proposed_milestones: [{ ...MILESTONE, amount_cents: 0 }] })
    );

    expect(res.status).toBe(200);
    const milestones = updatePayload('proposals')?.proposed_milestones as Array<{ amount_cents: number }>;
    expect(milestones[0].amount_cents).toBe(0);
  });

  it('rejects an empty body instead of clearing every milestone', async () => {
    mockGetCurrentUser.mockResolvedValue(asConsultant());
    authorRowForPatch('draft', CONSULTANT_USER, CONSULTANT_PROFILE);

    const res = await PATCH_PROPOSAL(proposalRequest('PATCH', PROPOSAL_ID, {}));
    const body = (await res.json()) as { success: boolean; error: { message: string } };

    // Regression: `proposed_milestones` carried a `.default([])` that survived
    // `.partial()`, so this parse always produced one key and the handler's
    // `Object.keys(updateData).length === 0` guard was unreachable. An empty
    // PATCH on a draft returned 200 and wiped its milestones. It must now be the
    // intended client error, and nothing may be written.
    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error.message).toMatch(/no editable proposal fields/i);
    expect(updatePayload('proposals')).toBeUndefined();
  });

  it('never writes immutable or unknown fields', async () => {
    mockGetCurrentUser.mockResolvedValue(asConsultant());
    authorRowForPatch('draft', CONSULTANT_USER, CONSULTANT_PROFILE);

    const res = await PATCH_PROPOSAL(
      proposalRequest('PATCH', PROPOSAL_ID, {
        proposed_price_cents: 250000,
        consultant_id: ATTACKER_PROFILE,
        job_id: ATTACKER_PROFILE,
      })
    );

    expect(res.status).toBe(200);
    const payload = updatePayload('proposals');
    expect(payload?.proposed_price_cents).toBe(250000);
    expect(payload).not.toHaveProperty('consultant_id');
    expect(payload).not.toHaveProperty('job_id');
    expect(JSON.stringify(allRecordedCalls())).not.toContain(ATTACKER_PROFILE);
  });

  it('routes a body carrying `status` to the state machine and drops the rest', async () => {
    mockGetCurrentUser.mockResolvedValue(asConsultant());
    arrangeTransition('submitted', 'withdrawn');

    // `if (requestBody.status)` picks the transition branch, so no content field
    // alongside it -- and no immutable field either -- reaches the write.
    const res = await PATCH_PROPOSAL(
      proposalRequest('PATCH', PROPOSAL_ID, {
        status: 'withdrawn',
        note: 'taking another offer',
        proposed_price_cents: 250000,
        consultant_id: ATTACKER_PROFILE,
      })
    );
    const body = (await res.json()) as { success: boolean; data: { status: string } };

    expect(res.status).toBe(200);
    expect(body.data.status).toBe('withdrawn');
    const payload = updatePayload('proposals');
    expect(Object.keys(payload ?? {}).sort()).toEqual(['status', 'updated_at']);
    expect(JSON.stringify(allRecordedCalls())).not.toContain(ATTACKER_PROFILE);
  });

  it('rejects an out-of-range field with 400 before any write', async () => {
    mockGetCurrentUser.mockResolvedValue(asConsultant());
    authorRowForPatch('draft', CONSULTANT_USER, CONSULTANT_PROFILE);

    const res = await PATCH_PROPOSAL(proposalRequest('PATCH', PROPOSAL_ID, { proposed_price_cents: 'abc' }));
    const body = (await res.json()) as { error: { code: string } };

    expect(res.status).toBe(400);
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(updatePayload('proposals')).toBeUndefined();
  });

  it('answers 400 for a status value outside the enum', async () => {
    mockGetCurrentUser.mockResolvedValue(asConsultant());

    const res = await PATCH_PROPOSAL(proposalRequest('PATCH', PROPOSAL_ID, { status: 'in_review' }));
    const body = (await res.json()) as { error: { code: string } };

    expect(res.status).toBe(400);
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('refuses to edit a proposal that is no longer a draft', async () => {
    mockGetCurrentUser.mockResolvedValue(asConsultant());
    authorRowForPatch('submitted', CONSULTANT_USER, CONSULTANT_PROFILE);

    const res = await PATCH_PROPOSAL(proposalRequest('PATCH', PROPOSAL_ID, { proposed_price_cents: 250000 }));

    expect(res.status).toBe(403);
    expect(updatePayload('proposals')).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// F. Status transitions
// ---------------------------------------------------------------------------

/**
 * Every transition `PROPOSAL_TRANSITIONS` declares, with the actor
 * `TRANSITION_ACTOR` requires. Enumerated by hand from the source so the table
 * is a pin rather than a tautology; the next test proves the two agree.
 */
const ALLOWED_TRANSITIONS: Array<[ProposalStatus, ProposalStatus, 'consultant' | 'client']> = [
  ['draft', 'submitted', 'consultant'],
  ['draft', 'withdrawn', 'consultant'],
  ['submitted', 'shortlisted', 'client'],
  ['submitted', 'rejected', 'client'],
  ['submitted', 'withdrawn', 'consultant'],
  ['shortlisted', 'accepted', 'client'],
  ['shortlisted', 'rejected', 'client'],
  ['shortlisted', 'withdrawn', 'consultant'],
];

function arrangeTransition(from: ProposalStatus, to: ProposalStatus) {
  const read = transitionRow(from);
  setTableResult('proposals', ok(read), ok({ ...read, status: to }));
  setTableResult('consultant_profiles', ok({ user_id: CONSULTANT_USER }));
  setTableResult('client_profiles', ok({ user_id: CLIENT_USER }));
  setTableResult('profiles', ok({ display_name: 'Ada Lovelace' }));
}

describe('proposal status transitions: allowed', () => {
  it('the enumeration under test is exactly the declared state machine', () => {
    const fromMap = Object.entries(PROPOSAL_TRANSITIONS).flatMap(([from, targets]) =>
      targets.map((to) => [from as ProposalStatus, to] as const)
    );

    expect(fromMap).toEqual(ALLOWED_TRANSITIONS.map(([from, to]) => [from, to]));
    for (const [from, to, actor] of ALLOWED_TRANSITIONS) {
      expect(TRANSITION_ACTOR[`${from}→${to}`]).toBe(actor);
    }
  });

  it.each(ALLOWED_TRANSITIONS)('allows %s -> %s by the %s', async (from, to, actor) => {
    mockGetCurrentUser.mockResolvedValue(actor === 'consultant' ? asConsultant() : asClient());
    arrangeTransition(from, to);

    const res = await PATCH_PROPOSAL(proposalRequest('PATCH', PROPOSAL_ID, { status: to }));
    const body = (await res.json()) as { success: boolean; data: { status: string } };

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.status).toBe(to);
    expect(updatePayload('proposals')?.status).toBe(to);
  });

  it.each(ALLOWED_TRANSITIONS)('allows %s -> %s through the service directly', async (from, to, actor) => {
    arrangeTransition(from, to);
    const actorUserId = actor === 'consultant' ? CONSULTANT_USER : CLIENT_USER;

    const result = await ProposalService.transitionStatus(PROPOSAL_ID, to, actorUserId);

    expect(result.status).toBe(to);
    expect(updatePayload('proposals')?.status).toBe(to);
  });

  it('stamps client_viewed_at when a proposal is accepted', async () => {
    arrangeTransition('shortlisted', 'accepted');

    await ProposalService.transitionStatus(PROPOSAL_ID, 'accepted', CLIENT_USER);

    const payload = updatePayload('proposals');
    expect(payload?.status).toBe('accepted');
    expect(typeof payload?.client_viewed_at).toBe('string');
  });

  it('notifies the consultant on a client decision, addressed to the author', async () => {
    arrangeTransition('submitted', 'shortlisted');

    await ProposalService.transitionStatus(PROPOSAL_ID, 'shortlisted', CLIENT_USER);

    expect(mockEmitEvent).toHaveBeenCalledTimes(1);
    const event = mockEmitEvent.mock.calls[0][0] as { userId: string; type: string };
    expect(event.type).toBe('proposal_shortlisted');
    expect(event.userId).toBe(CONSULTANT_USER);
  });

  it('does not notify anyone when the consultant withdraws their own proposal', async () => {
    arrangeTransition('submitted', 'withdrawn');

    await ProposalService.transitionStatus(PROPOSAL_ID, 'withdrawn', CONSULTANT_USER);

    expect(mockEmitEvent).not.toHaveBeenCalled();
  });

  it('DELETE withdraws an owned draft', async () => {
    mockGetCurrentUser.mockResolvedValue(asConsultant());
    arrangeTransition('draft', 'withdrawn');

    const res = await DELETE_PROPOSAL(proposalRequest('DELETE'));
    const body = (await res.json()) as { success: boolean; message: string; data: { status: string } };

    expect(res.status).toBe(200);
    expect(body.message).toBe('Proposal withdrawn successfully.');
    expect(body.data.status).toBe('withdrawn');
    expect(updatePayload('proposals')?.status).toBe('withdrawn');
  });
});

describe('proposal status transitions: disallowed', () => {
  it.each([
    ['draft', 'shortlisted'],
    ['draft', 'accepted'],
    ['draft', 'rejected'],
    ['submitted', 'accepted'],
    ['submitted', 'draft'],
    ['shortlisted', 'submitted'],
  ])('rejects %s -> %s', async (from, to) => {
    mockGetCurrentUser.mockResolvedValue(asClient());
    arrangeTransition(from as ProposalStatus, to as ProposalStatus);

    const res = await PATCH_PROPOSAL(proposalRequest('PATCH', PROPOSAL_ID, { status: to }));
    const body = (await res.json()) as { error: { code: string; message: string } };

    // Pinned: the state machine raises ForbiddenError, so an illegal
    // transition answers 403, not the 409 a state conflict would normally use.
    expect(res.status).toBe(403);
    expect(body.error.code).toBe('FORBIDDEN');
    expect(body.error.message).toContain('Invalid transition');
    expect(updatePayload('proposals')).toBeUndefined();
  });

  it.each(['accepted', 'rejected', 'withdrawn'] as const)(
    'refuses any transition out of the terminal state %s',
    async (from) => {
      mockGetCurrentUser.mockResolvedValue(asClient());
      arrangeTransition(from, 'rejected');

      const res = await PATCH_PROPOSAL(proposalRequest('PATCH', PROPOSAL_ID, { status: 'rejected' }));
      const body = (await res.json()) as { error: { code: string; message: string } };

      expect(res.status).toBe(403);
      expect(body.error.message).toContain(`already ${from}`);
      expect(updatePayload('proposals')).toBeUndefined();
    }
  );

  it('refuses a client-only transition attempted by the proposal author', async () => {
    mockGetCurrentUser.mockResolvedValue(asConsultant());
    arrangeTransition('submitted', 'shortlisted');

    const res = await PATCH_PROPOSAL(proposalRequest('PATCH', PROPOSAL_ID, { status: 'shortlisted' }));
    const body = (await res.json()) as { error: { message: string } };

    // Authored is not the same as authorised: `submitted -> shortlisted` is the
    // client's decision, so the consultant who wrote the proposal is refused.
    expect(res.status).toBe(403);
    expect(body.error.message).toContain('Only the job owner');
    expect(updatePayload('proposals')).toBeUndefined();
  });

  it('refuses a consultant-only withdrawal attempted by the job owner', async () => {
    mockGetCurrentUser.mockResolvedValue(asClient());
    arrangeTransition('submitted', 'withdrawn');

    const res = await DELETE_PROPOSAL(proposalRequest('DELETE'));
    const body = (await res.json()) as { error: { message: string } };

    expect(res.status).toBe(403);
    expect(body.error.message).toContain('Only the proposal author');
  });

  it('refuses a client transition when the job embed carries no client', async () => {
    mockGetCurrentUser.mockResolvedValue(asClient());
    const read = proposalRow({
      status: 'submitted',
      consultant_id: CONSULTANT_PROFILE,
      consultant: { user_id: CONSULTANT_USER },
      job: null,
    });
    setTableResult('proposals', ok(read));
    setTableResult('consultant_profiles', ok({ user_id: CONSULTANT_USER }));
    setTableResult('client_profiles', ok(null));

    const res = await PATCH_PROPOSAL(proposalRequest('PATCH', PROPOSAL_ID, { status: 'shortlisted' }));

    // Ownership is resolved from the embed, so a missing job means nobody owns
    // it -- the transition fails closed rather than falling open.
    expect(res.status).toBe(403);
    expect(updatePayload('proposals')).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// G. Empty / nullable response safety
// ---------------------------------------------------------------------------

describe('proposal routes: empty and nullable service results', () => {
  it('GET /api/proposals answers 200 with an empty page', async () => {
    mockGetCurrentUser.mockResolvedValue(asConsultant());
    setTableResult('consultant_profiles', ok({ id: CONSULTANT_PROFILE }));
    setTableResult('proposals', ok([], 0));

    const res = await LIST_PROPOSALS(listRequest());
    const body = (await res.json()) as { success: boolean; data: { proposals: unknown[]; total: number } };

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.proposals).toEqual([]);
    expect(body.data.total).toBe(0);
  });

  it('GET /api/proposals reports total 0 when the count is absent', async () => {
    mockGetCurrentUser.mockResolvedValue(asConsultant());
    setTableResult('consultant_profiles', ok({ id: CONSULTANT_PROFILE }));
    setTableResult('proposals', ok([]));

    const res = await LIST_PROPOSALS(listRequest());
    const body = (await res.json()) as { data: { total: number } };

    // A missing `count` must not leak through as `undefined`.
    expect(body.data.total).toBe(0);
  });

  it('GET /api/proposals answers 404 when the caller has no consultant profile', async () => {
    mockGetCurrentUser.mockResolvedValue(asConsultant());
    setTableResult('consultant_profiles', ok(null));

    const res = await LIST_PROPOSALS(listRequest());

    expect(res.status).toBe(404);
  });

  it('GET /api/proposals/[id] answers 404 when the proposal row is null', async () => {
    mockGetCurrentUser.mockResolvedValue(asConsultant());
    setTableResult('proposals', ok(null));

    const res = await GET_PROPOSAL(proposalRequest('GET'));

    expect(res.status).toBe(404);
  });

  it('GET /api/proposals/[id] answers 404 when the job embed is missing', async () => {
    mockGetCurrentUser.mockResolvedValue(asConsultant());
    setTableResult('proposals', ok(transitionRow('submitted', null)));
    setTableResult('consultant_profiles', ok({ user_id: CONSULTANT_USER }));

    const res = await GET_PROPOSAL(proposalRequest('GET'));

    // Without a job there is no job owner, so the proposal is not viewable.
    expect(res.status).toBe(404);
  });

  it('POST answers 201 with data null when the insert returns no row', async () => {
    mockGetCurrentUser.mockResolvedValue(asConsultant());
    setTableResult('consultant_profiles', ok({ id: CONSULTANT_PROFILE, user_id: CONSULTANT_USER }));
    setTableResult('jobs', ok(openJobRow()));
    setTableResult('client_profiles', ok({ user_id: CLIENT_USER }));
    setTableResult('proposals', ok([]), ok(null));

    const res = await CREATE_PROPOSAL(createRequest(validCreateBody()));
    const body = (await res.json()) as { success: boolean; data: unknown };

    // FINDING: the service only inspects `error`, so a driver that returns
    // `{ data: null, error: null }` yields a 201 with `data: null` -- a
    // "success" the client cannot use.
    expect(res.status).toBe(201);
    expect(body.success).toBe(true);
    expect(body.data).toBeNull();
  });

  it('POST omits data entirely when the insert returns undefined', async () => {
    mockGetCurrentUser.mockResolvedValue(asConsultant());
    setTableResult('consultant_profiles', ok({ id: CONSULTANT_PROFILE, user_id: CONSULTANT_USER }));
    setTableResult('jobs', ok(openJobRow()));
    setTableResult('client_profiles', ok({ user_id: CLIENT_USER }));
    setTableResult('proposals', ok([]), { error: null });

    const res = await CREATE_PROPOSAL(createRequest(validCreateBody()));
    const body = (await res.json()) as Record<string, unknown>;

    // FINDING: `data: undefined` is dropped by JSON.stringify, so the success
    // envelope loses the key entirely rather than reporting null.
    expect(res.status).toBe(201);
    expect(body.success).toBe(true);
    expect('data' in body).toBe(false);
  });

  it('PATCH answers 200 with data null when the update returns no row', async () => {
    mockGetCurrentUser.mockResolvedValue(asConsultant());
    setTableResult('proposals', ok(proposalRow({ status: 'draft' })), ok(null));
    setTableResult('consultant_profiles', ok({ user_id: CONSULTANT_USER }));

    const res = await PATCH_PROPOSAL(proposalRequest('PATCH', PROPOSAL_ID, { proposed_price_cents: 250000 }));
    const body = (await res.json()) as { success: boolean; data: unknown };

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toBeNull();
  });

  it('DELETE answers 200 with data null when the transition writes no row', async () => {
    mockGetCurrentUser.mockResolvedValue(asConsultant());
    const read = proposalRow({ status: 'draft', consultant: { user_id: CONSULTANT_USER }, job: null });
    setTableResult('proposals', ok(read), ok(undefined));
    setTableResult('consultant_profiles', ok({ user_id: CONSULTANT_USER }));

    const res = await DELETE_PROPOSAL(proposalRequest('DELETE'));
    const body = (await res.json()) as { success: boolean; data?: unknown; message: string };

    // FINDING: the withdrawal is reported as successful even though the update
    // returned nothing, so the caller is told it withdrew a proposal that is
    // still a draft.
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.message).toBe('Proposal withdrawn successfully.');
    expect('data' in body).toBe(false);
  });

  it('answers 500 when a database read fails outright, not a 200 with nothing', async () => {
    mockGetCurrentUser.mockResolvedValue(asConsultant());
    setTableResult('consultant_profiles', ok({ id: CONSULTANT_PROFILE }));
    setTableResult('proposals', { data: null, error: { message: 'connection reset' } });

    const res = await LIST_PROPOSALS(listRequest());
    const body = (await res.json()) as { error: { code: string } };

    // A failed read is surfaced rather than degraded into an empty page.
    expect(res.status).toBe(500);
    expect(body.error.code).toBe('DB_FETCH_ERROR');
  });
});
