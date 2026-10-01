import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Regression coverage for conversation-membership authorization.
 *
 * `MessagingService.getConversationMembers` used to read a conversation's roster
 * on the strength of the `conversationId` argument alone. Any authenticated user
 * could therefore pass an arbitrary conversation id and enumerate that
 * conversation's participants -- `user_id`, `member_role` and the joined
 * `users` row including email and name -- for conversations they had no part in.
 * A sweep added a membership gate to the method, but shipped no tests, so the
 * fix was unverified against regression and nothing would have failed had it been
 * dropped again.
 *
 * Every test here drives the real service method and asserts on the queries that
 * actually reach Supabase, because the property that was broken lives in the
 * query construction and in what is *not* sent, not in the return value. A test
 * that only asserted "a non-participant gets no members" would pass against the
 * vulnerable implementation if the vulnerable implementation returned `[]`, so
 * the refusal cases additionally assert that the roster query was never issued
 * and that the rejection is distinguishable from an empty conversation.
 */

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

type QueryCall = {
  op: string;
  args: unknown[];
};

/** A recorded call, tagged with the table its chain started from. */
type TaggedQueryCall = QueryCall & { table: string };

type QueryResult = { data?: unknown; error?: unknown; count?: number };

/**
 * Query-builder ops that record their arguments and return the builder.
 *
 * `match` is here in addition to the ops used by `jobs-authorization.test.ts`:
 * the membership probe in `getConversationById` / `getMessages` / `sendMessage`
 * filters with `.match({ conversation_id, user_id })`, and a builder without
 * `match` would throw a TypeError before it reached any assertion.
 */
const BUILDER_OPS = [
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
  'match',
  'single',
  'maybeSingle',
  'limit',
];

/** Recorded calls for one query chain. */
function makeQueryBuilder(result: QueryResult) {
  const calls: QueryCall[] = [];
  const builder: Record<string, unknown> = {};

  for (const op of BUILDER_OPS) {
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

/**
 * How a chain is read once it is awaited.
 *
 * `read` is any plain select, `roster` is the roster select that joins the user
 * row (`users:user_id (id, email, ...)`), and `write` is insert/update/delete.
 * `MessagingService` chains several `.from()` calls per operation -- the
 * membership probe, the data read, and for `sendMessage` the insert, the
 * conversation bump and a second roster read -- so the table alone is not enough
 * to pick which scripted result applies.
 */
type ChainMode = 'read' | 'roster' | 'write';

/** Scripted results, keyed `table:mode`. */
const tableResults: Record<string, QueryResult> = {};

/** Scripted rejections, keyed `table:mode`: the builder rejects when set. */
const tableFailures: Record<string, unknown> = {};

/**
 * Per-conversation overrides for the `conversation_members` read.
 *
 * Lets one test model a user who is a member of conversation A and has no row at
 * all for conversation B, which is the shape the IDOR depends on.
 */
const membershipByConversation: Record<string, QueryResult> = {};

/** Every call that reached the database, in order, tagged by table. */
const queryLog: TaggedQueryCall[] = [];

/** The user `supabase.auth.getUser()` reports for the current test. */
let currentUser: { id: string; email?: string } | null = null;

/** All recorded calls against one table. */
function callsFor(table: string): TaggedQueryCall[] {
  return queryLog.filter((call) => call.table === table);
}

/** Every recorded call, across all tables. */
function allCalls(): TaggedQueryCall[] {
  return queryLog;
}

/**
 * The roster query: the `conversation_members` select that joins the user row.
 *
 * This is the query that returns `user_id`, `member_role` and the embedded
 * email/name -- the data the IDOR leaked -- so "was it executed at all" is the
 * assertion the refusal cases turn on.
 */
const ROSTER_EMBED = 'users:user_id';

function rosterQueries(): TaggedQueryCall[] {
  return callsFor('conversation_members').filter(
    (call) => call.op === 'select' && String(call.args[0]).includes(ROSTER_EMBED)
  );
}

/** The `getConversationMembers` membership probe (`select('user_id')` chains). */
function membershipProbes(): TaggedQueryCall[] {
  return callsFor('conversation_members').filter(
    (call) => call.op === 'select' && call.args[0] === 'user_id'
  );
}

/**
 * Every membership read, whichever probe shape was used: the
 * `select('user_id')...maybeSingle()` probe in `getConversationMembers` and the
 * `select('*')...match(...)` probe in `getConversationById` / `getMessages` /
 * `sendMessage`. Excludes the roster select.
 */
function membershipChecks(): TaggedQueryCall[] {
  return callsFor('conversation_members').filter(
    (call) => call.op === 'select' && !String(call.args[0]).includes(ROSTER_EMBED)
  );
}

/** Values passed to `.eq(column, value)` on a table. */
function eqValues(table: string, column: string): unknown[] {
  return callsFor(table)
    .filter((call) => call.op === 'eq' && call.args[0] === column)
    .map((call) => call.args[1]);
}

/** Values passed to `.neq(column, value)` on a table. */
function neqValues(table: string, column: string): unknown[] {
  return callsFor(table)
    .filter((call) => call.op === 'neq' && call.args[0] === column)
    .map((call) => call.args[1]);
}

/** The `conversation_id` a chain filtered on, via `.eq` or `.match`. */
function conversationIdFilter(chainCalls: QueryCall[]): string | undefined {
  const eq = chainCalls.find((call) => call.op === 'eq' && call.args[0] === 'conversation_id');
  if (eq) return eq.args[1] as string;
  const match = chainCalls.find((call) => call.op === 'match');
  const fromMatch = (match?.args[0] as { conversation_id?: string } | undefined)?.conversation_id;
  return fromMatch;
}

/** How a recorded chain is read, derived from the calls it made. */
function chainMode(chainCalls: QueryCall[]): ChainMode {
  if (chainCalls.some((call) => call.op === 'insert' || call.op === 'update' || call.op === 'delete')) {
    return 'write';
  }
  if (chainCalls.some((call) => call.op === 'select' && String(call.args[0]).includes(ROSTER_EMBED))) {
    return 'roster';
  }
  return 'read';
}

/** The result a chain resolves to, given its table and mode. */
function resolveResult(table: string, mode: ChainMode, chainCalls: QueryCall[]): QueryResult {
  if (table === 'conversation_members' && mode === 'read') {
    const conversationId = conversationIdFilter(chainCalls);
    const override = conversationId ? membershipByConversation[conversationId] : undefined;
    if (override) return override;
  }
  // Fail closed: an unscripted `conversation_members` read looks like "no row".
  return tableResults[`${table}:${mode}`] ?? { data: null, error: null };
}

/**
 * One query chain for `table`: a fresh builder per `.from()` call, recording into
 * the shared log and resolving to the scripted result for its mode.
 */
function makeTableChain(table: string): Record<string, unknown> {
  const { builder, calls } = makeQueryBuilder({ data: null, error: null });

  // Mirror the same calls into the shared, table-tagged log.
  for (const op of BUILDER_OPS) {
    const recorded = builder[op] as (...args: unknown[]) => unknown;
    builder[op] = (...args: unknown[]) => {
      const result = recorded(...args);
      queryLog.push({ table, op, args });
      return result;
    };
  }

  builder.then = (resolve: (v: unknown) => void, reject?: (e: unknown) => void) => {
    const mode = chainMode(calls);
    const failure = tableFailures[`${table}:${mode}`];
    if (failure !== undefined) return Promise.reject(failure).then(resolve, reject);
    return Promise.resolve(resolveResult(table, mode, calls)).then(resolve, reject);
  };

  return builder;
}

/**
 * A Supabase-client stand-in: `.from()` yields a query BUILDER.
 *
 * Returning the builder where a client is expected falls through to the real
 * Supabase client and every test fails with a network 500, so `.from()` must
 * hand back the builder rather than the client.
 */
function makeClient() {
  return {
    from: (table: string) => makeTableChain(table),
    storage: { from: () => ({ remove: async () => undefined, upload: async () => ({ error: null }) }) },
    auth: { getUser: async () => ({ data: { user: currentUser }, error: null }) },
  };
}

const mockServerClient = vi.fn();
const mockAdminClient = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createClient: (...args: unknown[]) => mockServerClient(...args),
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: (...args: unknown[]) => mockAdminClient(...args),
}));

vi.mock('@/services/notification.service', () => ({
  NotificationService: { emitEvent: vi.fn(), emit: vi.fn() },
}));

vi.mock('@/lib/notifications/events', () => ({ messageReceived: vi.fn() }));

import { MessagingService } from '@/services/messaging.service';
import { AppError, UnauthorizedError } from '@/lib/errors';
import { NotificationService } from '@/services/notification.service';
import { messageReceived } from '@/lib/notifications/events';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** A participant of conversation A. */
const CALLER_USER = 'c1111111-1111-4111-8111-111111111111';
/** The other participant of conversation A. */
const PEER_USER = 'c2222222-2222-4222-8222-222222222222';
/** Has no membership row in either conversation. */
const OUTSIDER_USER = 'c3333333-3333-4333-8333-333333333333';
/**
 * Used only by the one test that exercises a successful `sendMessage`.
 *
 * `sendMessage` rate-limits in a module-level `Map` keyed by user id with no
 * reset hook, so a user id reused across tests would bleed quota between them.
 */
const SENDING_USER = 'c4444444-4444-4444-8444-444444444444';

const CONVERSATION_A = 'a1111111-1111-4111-8111-111111111111';
const CONVERSATION_B = 'b2222222-2222-4222-8222-222222222222';

const PEER_EMAIL = 'peer@example.com';
const OUTSIDER_EMAIL = 'outsider@example.com';

/** A membership row: what the probe sees for a participant. */
function membershipRow(userId: string, conversationId: string = CONVERSATION_A) {
  return { conversation_id: conversationId, user_id: userId, member_role: 'participant' };
}

/** A roster row with the joined user, as an object embed. */
function rosterRow(userId: string, email: string, firstName: string) {
  return {
    user_id: userId,
    member_role: 'participant',
    last_read_at: null,
    joined_at: '2026-01-01T00:00:00.000Z',
    users: {
      id: userId,
      email,
      profiles: { first_name: firstName, last_name: null, display_name: null, avatar_url: null },
    },
  };
}

/** The same row with the user embed shaped as a one-element array. */
function rosterRowArrayEmbed(userId: string, email: string, firstName: string) {
  const row = rosterRow(userId, email, firstName);
  return { ...row, users: [row.users] };
}

/** A `conversations` row as `getConversationById` returns it. */
function conversationRow(id: string = CONVERSATION_A) {
  return {
    id,
    conversation_type: 'job_application',
    job_id: 'j1111111-1111-4111-8111-111111111111',
    proposal_id: null,
    contract_id: null,
    title: 'Application for Warehouse Operative',
    last_message_at: '2026-01-02T00:00:00.000Z',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-02T00:00:00.000Z',
  };
}

/** A `messages` row. */
function messageRow(id: string, senderId: string, content: string) {
  return {
    id,
    conversation_id: CONVERSATION_A,
    sender_id: senderId,
    content,
    attachments: null,
    reply_to_message_id: null,
    is_edited: false,
    is_deleted: false,
    created_at: `2026-01-0${id === 'm1' ? '1' : '2'}T00:00:00.000Z`,
    updated_at: null,
    edited_at: null,
    deleted_at: null,
  };
}

/** Script the result for one `table:mode` pair. */
function setTableResult(table: string, result: QueryResult, mode: ChainMode = 'read'): void {
  tableResults[`${table}:${mode}`] = result;
}

/** Script a rejection for one `table:mode` pair. */
function setTableFailure(table: string, failure: unknown, mode: ChainMode = 'read'): void {
  tableFailures[`${table}:${mode}`] = failure;
}

/** A caller who is a member of conversation A. */
function signInAsParticipant(userId: string = CALLER_USER): void {
  currentUser = { id: userId, email: 'caller@example.com' };
}

/** A caller with no membership row anywhere. */
function signInAsOutsider(): void {
  currentUser = { id: OUTSIDER_USER, email: OUTSIDER_EMAIL };
}

function resetHarness(): void {
  queryLog.length = 0;
  currentUser = null;
  for (const key of Object.keys(tableResults)) delete tableResults[key];
  for (const key of Object.keys(tableFailures)) delete tableFailures[key];
  for (const key of Object.keys(membershipByConversation)) delete membershipByConversation[key];

  // Default: a participant of conversation A, with a two-member roster.
  setTableResult('conversation_members', { data: membershipRow(CALLER_USER), error: null });
  setTableResult(
    'conversation_members',
    { data: [rosterRow(CALLER_USER, 'caller@example.com', 'Call'), rosterRow(PEER_USER, PEER_EMAIL, 'Peer')], error: null },
    'roster'
  );
  setTableResult('conversations', { data: conversationRow(), error: null });
  setTableResult('conversations', { data: conversationRow(), error: null }, 'write');
  setTableResult('messages', { data: [], error: null });
  setTableResult('messages', { data: null, error: null }, 'write');

  mockServerClient.mockImplementation(async () => makeClient());
  mockAdminClient.mockImplementation(() => makeClient());
}

beforeEach(() => {
  vi.clearAllMocks();
  resetHarness();
  // These tests deliberately drive refusal and failure paths, which the service
  // reports through `console.error`. Swallow the noise so a real failure stands
  // out; assertions never depend on what was logged.
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

// ---------------------------------------------------------------------------
// Authenticated participant
// ---------------------------------------------------------------------------

describe('conversation membership: authenticated participant', () => {
  it('returns the roster when the caller has a conversation_members row', async () => {
    signInAsParticipant();

    const members = await MessagingService.getConversationMembers(CONVERSATION_A);

    expect(members.map((member) => member.user_id)).toEqual([CALLER_USER, PEER_USER]);
    expect(members[1].member_role).toBe('participant');
    expect(members[1].users?.email).toBe(PEER_EMAIL);

    // The gate is a membership probe scoped to this conversation and this user.
    expect(membershipProbes()).toHaveLength(1);
    expect(eqValues('conversation_members', 'conversation_id')).toContain(CONVERSATION_A);
    expect(eqValues('conversation_members', 'user_id')).toContain(CALLER_USER);
    expect(callsFor('conversation_members').some((call) => call.op === 'maybeSingle')).toBe(true);

    // And only then is the roster read, also scoped to this conversation.
    expect(rosterQueries()).toHaveLength(1);
    expect(eqValues('conversation_members', 'conversation_id')).toEqual([
      CONVERSATION_A,
      CONVERSATION_A,
    ]);
  });

  it('returns the allowed conversation information to a participant', async () => {
    signInAsParticipant();

    const conversation = await MessagingService.getConversationById(CONVERSATION_A);

    expect(conversation).toMatchObject({
      id: CONVERSATION_A,
      conversation_type: 'job_application',
      job_id: 'j1111111-1111-4111-8111-111111111111',
      title: 'Application for Warehouse Operative',
    });
    // The conversation read is preceded by a membership probe and is itself
    // pinned to the requested conversation id.
    expect(membershipChecks()).toHaveLength(1);
    expect(callsFor('conversations').some((call) => call.op === 'eq' && call.args[1] === CONVERSATION_A)).toBe(true);
  });

  it('omits the excluded member from the roster query', async () => {
    signInAsParticipant();
    // PostgREST applies the `.neq` itself, so the scripted roster here is the
    // filtered result the database would return.
    setTableResult(
      'conversation_members',
      { data: [rosterRow(PEER_USER, PEER_EMAIL, 'Peer')], error: null },
      'roster'
    );

    const excluded = await MessagingService.getConversationMembers(CONVERSATION_A, CALLER_USER);

    // The exclusion has to reach Postgres: `.neq('user_id', excludeUserId)` is
    // the only thing that keeps the caller out of the "notify the others" list.
    expect(neqValues('conversation_members', 'user_id')).toEqual([CALLER_USER]);
    expect(excluded.map((member) => member.user_id)).not.toContain(CALLER_USER);

    // No `excludeUserId` means no `neq`, i.e. the roster is not silently filtered.
    setTableResult(
      'conversation_members',
      {
        data: [
          rosterRow(CALLER_USER, 'caller@example.com', 'Call'),
          rosterRow(PEER_USER, PEER_EMAIL, 'Peer'),
        ],
        error: null,
      },
      'roster'
    );
    const withoutExclude = await MessagingService.getConversationMembers(CONVERSATION_A);
    expect(withoutExclude.map((member) => member.user_id)).toEqual([CALLER_USER, PEER_USER]);
    expect(neqValues('conversation_members', 'user_id')).toEqual([CALLER_USER]);
  });

  it('normalises a to-one user embed that PostgREST returns as an array', async () => {
    signInAsParticipant();
    setTableResult(
      'conversation_members',
      { data: [rosterRowArrayEmbed(PEER_USER, PEER_EMAIL, 'Peer')], error: null },
      'roster'
    );

    const members = await MessagingService.getConversationMembers(CONVERSATION_A, CALLER_USER);

    expect(Array.isArray(members[0].users)).toBe(false);
    expect(members[0].users?.email).toBe(PEER_EMAIL);
  });

  it('returns messages when the caller is a participant', async () => {
    signInAsParticipant();
    setTableResult('messages', { data: [messageRow('m2', PEER_USER, 'second'), messageRow('m1', CALLER_USER, 'first')], error: null });

    const messages = await MessagingService.getMessages(CONVERSATION_A);

    // Newest-first from the database, reversed to oldest-first for display.
    expect(messages.map((message) => message.content)).toEqual(['first', 'second']);
    expect(membershipChecks()).toHaveLength(1);
    expect(callsFor('messages').some((call) => call.op === 'eq' && call.args[1] === CONVERSATION_A)).toBe(true);
    expect(callsFor('messages').find((call) => call.op === 'range')?.args).toEqual([0, 49]);
  });

  it('lets a participant send a message', async () => {
    signInAsParticipant(SENDING_USER);
    setTableResult('conversation_members', { data: membershipRow(SENDING_USER), error: null });
    setTableResult('messages', { data: { id: 'm9', conversation_id: CONVERSATION_A, sender_id: SENDING_USER, content: 'hello' }, error: null }, 'write');
    setTableResult('conversations', { data: null, error: null }, 'write');
    // The roster read that follows a send drives notifications for the others.
    setTableResult('conversation_members', { data: [rosterRow(PEER_USER, PEER_EMAIL, 'Peer')], error: null }, 'roster');

    const sent = await MessagingService.sendMessage(CONVERSATION_A, '  hello  ');

    expect(sent).toMatchObject({ id: 'm9', sender_id: SENDING_USER, content: 'hello' });
    const insert = callsFor('messages').find((call) => call.op === 'insert');
    expect(insert?.args[0]).toMatchObject({
      conversation_id: CONVERSATION_A,
      sender_id: SENDING_USER,
      content: 'hello',
    });
    // The sender is excluded from their own notification fan-out.
    expect(messageReceived).toHaveBeenCalledTimes(1);
    expect(messageReceived).toHaveBeenCalledWith(
      NotificationService.emitEvent,
      expect.objectContaining({
        recipientUserId: PEER_USER,
        actorUserId: SENDING_USER,
        conversationId: CONVERSATION_A,
      })
    );
    expect(neqValues('conversation_members', 'user_id')).toEqual([SENDING_USER]);
  });
});

// ---------------------------------------------------------------------------
// Non-participant: the IDOR regression
// ---------------------------------------------------------------------------

describe('conversation membership: non-participant is refused', () => {
  it('does not expose email, name, user id or member role to a non-participant', async () => {
    signInAsOutsider();
    setTableResult('conversation_members', { data: null, error: null });

    await expect(MessagingService.getConversationMembers(CONVERSATION_A)).rejects.toThrow(
      UnauthorizedError
    );

    // The roster query is the leak: it returns `user_id`, `member_role` and the
    // embedded `users` row. It must never be issued for a non-participant.
    expect(rosterQueries()).toHaveLength(0);
    // Nothing that could carry roster data left the service.
    const serialised = JSON.stringify(allCalls().map((call) => call.args));
    expect(serialised).not.toContain(PEER_EMAIL);
  });

  it('throws UnauthorizedError and issues no roster query when there is no membership row', async () => {
    signInAsOutsider();
    setTableResult('conversation_members', { data: null, error: null });

    const error = await MessagingService.getConversationMembers(CONVERSATION_A).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(UnauthorizedError);
    expect(error).toBeInstanceOf(AppError);
    expect((error as UnauthorizedError).statusCode).toBe(401);
    expect((error as UnauthorizedError).code).toBe('UNAUTHORIZED');
    expect(rosterQueries()).toHaveLength(0);
    // Only the probe ran.
    expect(membershipProbes()).toHaveLength(1);
  });

  it('treats a failing membership probe as a refusal, not as a pass', async () => {
    signInAsOutsider();
    setTableResult('conversation_members', {
      data: null,
      error: { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' },
    });

    await expect(MessagingService.getConversationMembers(CONVERSATION_A)).rejects.toThrow(
      UnauthorizedError
    );

    expect(rosterQueries()).toHaveLength(0);
  });

  it('refuses getConversationById and never issues the conversations select', async () => {
    signInAsOutsider();
    // `.match(...).single()` with no row is a PGRST116 error from PostgREST.
    setTableResult('conversation_members', {
      data: null,
      error: { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' },
    });

    await expect(MessagingService.getConversationById(CONVERSATION_A)).rejects.toThrow(UnauthorizedError);

    expect(callsFor('conversations')).toHaveLength(0);
  });

  it('refuses getMessages and never issues the messages select', async () => {
    signInAsOutsider();
    setTableResult('conversation_members', {
      data: null,
      error: { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' },
    });

    await expect(MessagingService.getMessages(CONVERSATION_A)).rejects.toThrow(UnauthorizedError);

    expect(callsFor('messages')).toHaveLength(0);
  });

  it('refuses sendMessage and inserts no message row', async () => {
    signInAsOutsider();
    setTableResult('conversation_members', {
      data: null,
      error: { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' },
    });

    await expect(MessagingService.sendMessage(CONVERSATION_A, 'let me in')).rejects.toThrow(
      UnauthorizedError
    );

    expect(callsFor('messages')).toHaveLength(0);
    expect(allCalls().some((call) => call.op === 'insert')).toBe(false);
    // No conversation bump and no notification fan-out either.
    expect(callsFor('conversations')).toHaveLength(0);
    expect(messageReceived).not.toHaveBeenCalled();
  });

  it('does not let a participant of conversation A read conversation B', async () => {
    // The caller is a member of A and has no row for B.
    membershipByConversation[CONVERSATION_A] = { data: membershipRow(CALLER_USER, CONVERSATION_A), error: null };
    membershipByConversation[CONVERSATION_B] = { data: null, error: null };
    signInAsParticipant();

    await expect(MessagingService.getConversationMembers(CONVERSATION_B)).rejects.toThrow(
      UnauthorizedError
    );
    await expect(MessagingService.getConversationById(CONVERSATION_B)).rejects.toThrow(
      UnauthorizedError
    );
    await expect(MessagingService.getMessages(CONVERSATION_B)).rejects.toThrow(UnauthorizedError);

    // Each refusal filtered on B, i.e. membership really is conversation-scoped,
    // and no data query for B was issued.
    expect(rosterQueries()).toHaveLength(0);
    expect(callsFor('conversations')).toHaveLength(0);
    expect(callsFor('messages')).toHaveLength(0);
    expect(eqValues('conversation_members', 'conversation_id')).toContain(CONVERSATION_B);
    expect(callsFor('conversation_members').some((call) => call.op === 'match')).toBe(true);

    // The same caller still gets conversation A.
    const own = await MessagingService.getConversationMembers(CONVERSATION_A);
    expect(own.map((member) => member.user_id)).toEqual([CALLER_USER, PEER_USER]);
  });

  it('cannot bypass membership by claiming a member id other than their own', async () => {
    // The probe is keyed on the authenticated user id, so passing somebody
    // else's id must not reach the query.
    signInAsOutsider();
    setTableResult('conversation_members', { data: null, error: null });

    await MessagingService.getConversationMembers(CONVERSATION_A, CALLER_USER).catch(() => undefined);

    expect(eqValues('conversation_members', 'user_id')).toEqual([OUTSIDER_USER]);
    expect(rosterQueries()).toHaveLength(0);
  });
});

describe('refusal is distinguishable from an empty conversation', () => {
  it('returns [] for a participant of a conversation with no other members', async () => {
    signInAsParticipant();
    setTableResult('conversation_members', { data: [], error: null }, 'roster');

    await expect(MessagingService.getConversationMembers(CONVERSATION_A)).resolves.toEqual([]);
    expect(rosterQueries()).toHaveLength(1);
  });

  it('throws rather than returning [] for a non-participant', async () => {
    signInAsOutsider();
    setTableResult('conversation_members', { data: null, error: null });

    const outcome = await MessagingService.getConversationMembers(CONVERSATION_A).then(
      (value) => ({ resolved: value }),
      (error: unknown) => ({ rejected: error })
    );

    // An empty list here would be indistinguishable from an empty conversation,
    // turning a refused request into a plausible-looking success.
    expect(outcome).not.toHaveProperty('resolved');
    expect((outcome as { rejected: unknown }).rejected).toBeInstanceOf(UnauthorizedError);
    expect(rosterQueries()).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Unauthenticated
// ---------------------------------------------------------------------------

describe('unauthenticated callers are refused', () => {
  it('refuses every read and issues no data query', async () => {
    await expect(MessagingService.getConversationMembers(CONVERSATION_A)).rejects.toThrow(
      UnauthorizedError
    );
    await expect(MessagingService.getConversationById(CONVERSATION_A)).rejects.toThrow(UnauthorizedError);
    await expect(MessagingService.getMessages(CONVERSATION_A)).rejects.toThrow(UnauthorizedError);

    expect(allCalls()).toHaveLength(0);
  });

  it('refuses every write and issues no data query', async () => {
    await expect(MessagingService.sendMessage(CONVERSATION_A, 'hello')).rejects.toThrow(UnauthorizedError);
    await expect(MessagingService.editMessage('m1', 'edited')).rejects.toThrow(UnauthorizedError);
    await expect(MessagingService.deleteMessage('m1')).rejects.toThrow(UnauthorizedError);

    expect(allCalls()).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Error handling
// ---------------------------------------------------------------------------

describe('conversation member loading: error handling', () => {
  it('reports a roster read failure as AppError 500 MEMBERS_FETCH_ERROR', async () => {
    signInAsParticipant();
    setTableResult('conversation_members', {
      data: null,
      error: { code: '57014', message: 'canceling statement due to statement timeout' },
    }, 'roster');

    const error = await MessagingService.getConversationMembers(CONVERSATION_A).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(AppError);
    // A database fault must not be reported as an authorization failure, and
    // must not degrade into the `[]` an empty conversation returns.
    expect(error).not.toBeInstanceOf(UnauthorizedError);
    expect((error as AppError).statusCode).toBe(500);
    expect((error as AppError).code).toBe('MEMBERS_FETCH_ERROR');
  });

  it('wraps a thrown roster failure rather than letting it escape', async () => {
    signInAsParticipant();
    setTableFailure('conversation_members', new Error('socket hang up'), 'roster');

    const error = await MessagingService.getConversationMembers(CONVERSATION_A).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).statusCode).toBe(500);
    expect((error as AppError).code).toBe('MEMBERS_FETCH_ERROR');
  });
});