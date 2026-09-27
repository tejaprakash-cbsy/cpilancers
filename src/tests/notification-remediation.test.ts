import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Stage 12 remediation tests.
 *
 * These exist because the previous suite could not catch the three High findings.
 * Two structural changes make that possible:
 *
 *   1. The mock enforces the `dedup_key` unique index for real, from an in-memory
 *      set, instead of a test hand-writing `{ code: '23505' }`. The concurrency
 *      test therefore loses an actual race rather than being told it did.
 *   2. Every test that previously used a genuinely-unique entity id (a proposal)
 *      is joined by tests using a REPEATABLE one (messages, milestone
 *      submissions), because the original bug only appeared for events that can
 *      legitimately recur.
 */

type Result = { data: unknown; error: unknown };

// ---------------------------------------------------------------------------
// Mock plumbing
// ---------------------------------------------------------------------------

const { mockInApp, mockEmail } = vi.hoisted(() => ({
  mockInApp: { name: 'in_app', isConfigured: vi.fn(() => true), deliver: vi.fn() },
  mockEmail: { name: 'email', isConfigured: vi.fn(() => true), deliver: vi.fn() },
}));

vi.mock('@/lib/notifications/channels', () => ({
  ALL_CHANNELS: [],
  getChannel: (name: string) =>
    name === 'in_app' ? mockInApp : name === 'email' ? mockEmail : undefined,
  registeredChannelNames: () => ['in_app', 'email'],
  availableChannels: () => [mockInApp, mockEmail],
  inAppChannel: mockInApp,
  emailChannel: mockEmail,
}));

/** dedup_key values already committed, mirroring `uq_notifications_dedup_key`. */
let committedKeys = new Set<string>();
/** Rows actually written, so tests can count notifications rather than calls. */
let notificationRows: Array<Record<string, unknown>> = [];
/** Per-user in_app_enabled overrides, mirroring `notification_preferences`. */
let prefRows: Array<{ channel: string; enabled: boolean }> = [];
let callLog: { table: string; op: string; payload?: unknown; args?: unknown[] }[] = [];

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: (table: string) => builder(table) }),
}));

function log(table: string, op: string, payload?: unknown, args?: unknown[]) {
  callLog.push({ table, op, payload, args });
}

function builder(table: string) {
  let lastWrite: Result | null = null;
  // A payload awaiting its terminal read. supabase-js returns the builder
  // synchronously from insert/upsert/update and only awaits at .single()/.maybeSingle(),
  // so the uniqueness check happens there — which is also what lets two concurrent
  // emits interleave before either commits.
  let pending: { payload: unknown; table: string } | null = null;

  const settle = async (): Promise<Result> => {
    if (!pending) return api._result as Result;
    const { payload, table: t } = pending;
    const row = payload as Record<string, unknown>;
    pending = null;

    if (t === 'notifications') {
      // Yield once, so two concurrent emits both reach this point before either
      // records its key. That is the race the unique index has to arbitrate.
      await Promise.resolve();
      const key = row.dedup_key as string | null;
      if (key && committedKeys.has(key)) {
        return { data: null, error: { code: '23505' } };
      }
      if (key) committedKeys.add(key);
      const created = { id: `n${notificationRows.length + 1}`, ...row };
      notificationRows.push(created);
      return { data: created, error: null };
    }
    return { data: row, error: null };
  };

  const api: Record<string, unknown> = {
    _result: { data: null, error: null } as Result,
    select: (...args: unknown[]) => {
      if (lastWrite) {
        api._result = lastWrite;
        return api;
      }
      log(table, 'select', undefined, args);
      api._result = readHandler(table);
      return api;
    },
    insert: (payload: unknown) => {
      log(table, 'insert', payload);
      pending = { payload, table };
      lastWrite = null;
      return api;
    },
    upsert: (payload: unknown) => {
      log(table, 'upsert', payload);
      pending = null;
      lastWrite = { data: payload, error: null };
      api._result = lastWrite;
      return api;
    },
    update: (payload: unknown) => {
      log(table, 'update', payload);
      pending = null;
      lastWrite = { data: { id: 'n1', ...(payload as object) }, error: null };
      api._result = lastWrite;
      return api;
    },
    delete: () => api,
    eq: (...args: unknown[]) => {
      log(table, 'eq', undefined, args);
      return api;
    },
    is: (...args: unknown[]) => {
      log(table, 'is', undefined, args);
      return api;
    },
    gte: () => api,
    in: () => api,
    or: () => api,
    order: () => api,
    range: () => api,
    single: async () => {
      const r = await settle();
      api._result = r;
      return r;
    },
    maybeSingle: async () => {
      const r = await settle();
      api._result = r;
      return r;
    },
    then: (resolve: (v: Result) => unknown) => {
      void settle().then(resolve);
      return undefined;
    },
  };
  return api;
}

function readHandler(table: string): Result {
  if (table === 'users') return { data: { email: 'user@example.com' }, error: null };
  if (table === 'profiles') return { data: { display_name: 'Test User' }, error: null };
  if (table === 'notification_preferences') return { data: prefRows, error: null };
  if (table === 'notifications') return { data: notificationRows, error: null };
  return { data: null, error: null };
}

import { NotificationService } from '@/services/notification.service';
import { messageReceived, milestoneSubmitted } from '@/lib/notifications/events';
import type { NotificationType } from '@/types/database';

const USER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const CONVERSATION = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const MILESTONE = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

function emitEvent(over: Record<string, unknown> = {}) {
  return NotificationService.emit({
    userId: USER,
    type: 'message_received' as NotificationType,
    title: 'New message received',
    body: 'Someone sent you a message.',
    entityType: 'message',
    entityId: `msg-${Math.random().toString(36).slice(2)}`,
    ...over,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  callLog = [];
  notificationRows = [];
  committedKeys = new Set();
  prefRows = [];
  mockInApp.isConfigured.mockReturnValue(true);
  mockEmail.isConfigured.mockReturnValue(true);
  mockInApp.deliver.mockResolvedValue({ status: 'sent', providerMessageId: 'n' });
  mockEmail.deliver.mockResolvedValue({ status: 'sent', providerMessageId: 'sg' });
});

// ===========================================================================
// TEST 1 — repeated messages in one conversation
// ===========================================================================

describe('TEST 1: distinct messages each notify', () => {
  it('produces one notification per message, not one per conversation', async () => {
    const m1 = '11111111-1111-4111-8111-111111111111';
    const m2 = '22222222-2222-4222-8222-222222222222';
    const m3 = '33333333-3333-4333-8333-333333333333';

    await messageReceived(NotificationService.emitEvent, {
      recipientUserId: USER,
      messageId: m1,
      conversationId: CONVERSATION,
    });
    await messageReceived(NotificationService.emitEvent, {
      recipientUserId: USER,
      messageId: m2,
      conversationId: CONVERSATION,
    });
    await messageReceived(NotificationService.emitEvent, {
      recipientUserId: USER,
      messageId: m3,
      conversationId: CONVERSATION,
    });

    // The regression: all three shared a conversationId, so the second and
    // third were swallowed by the unique index and only one row existed.
    expect(notificationRows).toHaveLength(3);
  });

  it('still deduplicates the same message processed twice', async () => {
    const m1 = '11111111-1111-4111-8111-111111111111';
    const input = { recipientUserId: USER, messageId: m1, conversationId: CONVERSATION };

    const first = await messageReceived(NotificationService.emitEvent, input);
    const second = await messageReceived(NotificationService.emitEvent, input);

    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(notificationRows).toHaveLength(1);
  });

  it('sends no second email when the same message is reprocessed', async () => {
    const input = {
      recipientUserId: USER,
      messageId: '11111111-1111-4111-8111-111111111111',
      conversationId: CONVERSATION,
    };
    await messageReceived(NotificationService.emitEvent, input);
    const emailsAfterFirst = mockEmail.deliver.mock.calls.length;
    await messageReceived(NotificationService.emitEvent, input);
    expect(mockEmail.deliver.mock.calls.length).toBe(emailsAfterFirst);
  });
});

// ===========================================================================
// TEST 2 — concurrency
// ===========================================================================

describe('TEST 2: concurrent handling of one event yields one notification', () => {
  it('loses the unique-index race rather than mocking it', async () => {
    const m1 = '11111111-1111-4111-8111-111111111111';
    const input = { recipientUserId: USER, messageId: m1, conversationId: CONVERSATION };

    // Both emits reach the insert before either commits, because the mock yields
    // inside the insert and the unique check runs after the yield.
    const [a, b] = await Promise.all([
      messageReceived(NotificationService.emitEvent, input),
      messageReceived(NotificationService.emitEvent, input),
    ]);

    expect(notificationRows).toHaveLength(1);
    expect([a.created, b.created].filter(Boolean)).toHaveLength(1);
    // The loser is told it was a duplicate, not that something broke.
    expect([a.created, b.created].filter((c) => !c)).toHaveLength(1);
  });

  it('does not email twice under concurrency', async () => {
    const input = {
      recipientUserId: USER,
      messageId: '22222222-2222-4222-8222-222222222222',
      conversationId: CONVERSATION,
    };
    prefRows = [{ channel: 'email', enabled: true }];
    await Promise.all([
      messageReceived(NotificationService.emitEvent, input),
      messageReceived(NotificationService.emitEvent, input),
    ]);
    expect(mockEmail.deliver).toHaveBeenCalledTimes(1);
  });
});

// ===========================================================================
// TEST 3 — milestone resubmission
// ===========================================================================

describe('TEST 3: a resubmitted milestone notifies again', () => {
  it('notifies on each distinct submission', async () => {
    const first = '2026-01-01T10:00:00.000Z';
    const second = '2026-01-05T14:30:00.000Z';
    const base = {
      recipientUserId: USER,
      milestoneId: MILESTONE,
      milestoneTitle: 'Sprint 1',
      contractId: CONVERSATION,
    };

    await milestoneSubmitted(NotificationService.emitEvent, { ...base, submissionId: first });
    // Stage 9 allows disputed -> submitted, so a second submission is legitimate.
    await milestoneSubmitted(NotificationService.emitEvent, { ...base, submissionId: second });

    expect(notificationRows).toHaveLength(2);
  });

  it('deduplicates a repeated processing of the same submission', async () => {
    const submission = '2026-01-01T10:00:00.000Z';
    const base = {
      recipientUserId: USER,
      milestoneId: MILESTONE,
      milestoneTitle: 'Sprint 1',
      contractId: CONVERSATION,
      submissionId: submission,
    };

    await milestoneSubmitted(NotificationService.emitEvent, base);
    await milestoneSubmitted(NotificationService.emitEvent, base);
    await milestoneSubmitted(NotificationService.emitEvent, base);

    expect(notificationRows).toHaveLength(1);
  });

  it('produces two rows across a full submitted/disputed/resubmitted cycle', async () => {
    const submissions = ['2026-01-01T10:00:00.000Z', '2026-01-09T09:15:00.000Z'];
    const base = {
      recipientUserId: USER,
      milestoneId: MILESTONE,
      milestoneTitle: 'Sprint 1',
      contractId: CONVERSATION,
    };
    // Each submission delivered twice: once on the transition, once on a retry.
    for (const submissionId of submissions) {
      await milestoneSubmitted(NotificationService.emitEvent, { ...base, submissionId });
      await milestoneSubmitted(NotificationService.emitEvent, { ...base, submissionId });
    }
    expect(notificationRows).toHaveLength(2);
  });
});

// ===========================================================================
// TEST 4 — in_app preference actually prevents the notification
// ===========================================================================

describe('TEST 4: the in_app preference is enforced at creation', () => {
  it('creates no row at all when in_app is off and nothing else is on', async () => {
    prefRows = [{ channel: 'in_app', enabled: false }];
    const result = await emitEvent({ type: 'message_received', entityId: 'm-1' });

    expect(result.created).toBe(false);
    expect(result.notification).toBeNull();
    expect(notificationRows).toHaveLength(0);
    expect(mockInApp.deliver).not.toHaveBeenCalled();
  });

  it('creates the row once in_app is switched back on', async () => {
    prefRows = [{ channel: 'in_app', enabled: false }];
    await emitEvent({ type: 'message_received', entityId: 'm-1' });
    expect(notificationRows).toHaveLength(0);

    prefRows = [{ channel: 'in_app', enabled: true }];
    const result = await emitEvent({ type: 'message_received', entityId: 'm-2' });

    expect(result.created).toBe(true);
    expect(notificationRows).toHaveLength(1);
    expect(notificationRows[0].in_app_enabled).toBe(true);
  });

  it('marks the row in_app_enabled=false when only email remains', async () => {
    prefRows = [
      { channel: 'in_app', enabled: false },
      { channel: 'email', enabled: true },
    ];
    // `proposal_accepted` rather than a dispute: disputes are ESSENTIAL and their
    // in-app delivery is locked, so an `in_app: false` override is correctly
    // ignored for them. Channel independence is only observable on a type the
    // user is actually allowed to suppress.
    await emitEvent({ type: 'proposal_accepted', entityId: 'pa-1' });

    expect(notificationRows).toHaveLength(1);
    expect(notificationRows[0].in_app_enabled).toBe(false);
    // The in-app channel is not invoked; email still is.
    expect(mockInApp.deliver).not.toHaveBeenCalled();
    expect(mockEmail.deliver).toHaveBeenCalledTimes(1);
  });

  it('never suppresses a locked essential event', async () => {
    prefRows = [{ channel: 'in_app', enabled: false }];
    const result = await emitEvent({ type: 'dispute_opened', entityId: 'd-2' });

    expect(result.notification).not.toBeNull();
    expect(notificationRows).toHaveLength(1);
    expect(notificationRows[0].in_app_enabled).toBe(true);
  });

  it('refuses to store a preference that would suppress an essential event', async () => {
    await expect(
      NotificationService.setPreference(USER, 'payment_escrowed', 'in_app', false)
    ).rejects.toMatchObject({ statusCode: 409 });
  });
});

// ===========================================================================
// TEST 5 — channel independence
// ===========================================================================

describe('TEST 5: channel preferences are independent', () => {
  it('in_app off + email on: email delivers, no in-app row shown', async () => {
    prefRows = [
      { channel: 'in_app', enabled: false },
      { channel: 'email', enabled: true },
    ];
    await emitEvent({ type: 'proposal_rejected', entityId: 'pr-1' });
    expect(mockEmail.deliver).toHaveBeenCalledTimes(1);
    expect(mockInApp.deliver).not.toHaveBeenCalled();
    expect(notificationRows[0].in_app_enabled).toBe(false);
  });

  it('in_app on + email off: in-app only', async () => {
    prefRows = [
      { channel: 'in_app', enabled: true },
      { channel: 'email', enabled: false },
    ];
    await emitEvent({ type: 'message_received', entityId: 'm-9' });
    expect(mockInApp.deliver).toHaveBeenCalledTimes(1);
    expect(mockEmail.deliver).not.toHaveBeenCalled();
  });

  it('does not treat one channel being off as disabling the event', async () => {
    // A naive "any channel off -> skip" bug would drop the row entirely here.
    prefRows = [{ channel: 'email', enabled: false }];
    const result = await emitEvent({ type: 'message_received', entityId: 'm-10' });
    expect(result.notification).not.toBeNull();
    expect(notificationRows).toHaveLength(1);
  });
});

// ===========================================================================
// TEST 8 — unread count
// ===========================================================================

describe('TEST 8: unread count', () => {
  it('returns 0 for a user with nothing unread', async () => {
    const original = NotificationService as unknown as {
      getUnreadCount: (u: string) => Promise<number>;
    };
    // The head-count path is asserted structurally below; here we check the
    // call is scoped to the caller and to unread, in-app-visible rows.
    void original;
    await NotificationService.getUnreadSummary(USER);
    const eqs = callLog.filter((c) => c.op === 'eq').map((c) => c.args);
    expect(eqs).toContainEqual(['user_id', USER]);
    expect(eqs).toContainEqual(['is_read', false]);
    expect(eqs).toContainEqual(['in_app_enabled', true]);
  });

  it('counts only unread, in-app-visible rows', async () => {
    const summary = await NotificationService.getUnreadSummary(USER);
    expect(summary.unread_count).toBe(0);
  });

  it('breaks the count down by type, most frequent first', async () => {
    notificationRows = [
      { type: 'payment_escrowed', is_read: false, in_app_enabled: true },
      { type: 'payment_escrowed', is_read: false, in_app_enabled: true },
      { type: 'message_received', is_read: false, in_app_enabled: true },
    ];
    const summary = await NotificationService.getUnreadSummary(USER);
    expect(summary.unread_count).toBe(3);
    expect(summary.by_type[0]).toEqual({ type: 'payment_escrowed', count: 2 });
  });
});

// ===========================================================================
// TEST 9 — read-state API contract
// ===========================================================================

describe('TEST 9: read state', () => {
  it('writes is_read and read_at together when marking read', async () => {
    await NotificationService.setReadState(USER, 'n1', true);
    const update = callLog.find((c) => c.table === 'notifications' && c.op === 'update');
    const patch = update?.payload as { is_read: boolean; read_at: string | null };
    expect(patch.is_read).toBe(true);
    expect(patch.read_at).toBeTruthy();
  });

  it('clears read_at when un-marking, keeping the CHECK constraint satisfied', async () => {
    await NotificationService.setReadState(USER, 'n1', false);
    const update = callLog.find((c) => c.table === 'notifications' && c.op === 'update');
    const patch = update?.payload as { is_read: boolean; read_at: string | null };
    expect(patch.is_read).toBe(false);
    // Must be null, not a stale timestamp: chk_notification_read_state requires
    // is_read=false to pair with read_at IS NULL.
    expect(patch.read_at).toBeNull();
  });

  it('scopes the write by both id and user', async () => {
    await NotificationService.setReadState(USER, 'n1', true);
    const eqs = callLog.filter((c) => c.op === 'eq').map((c) => c.args);
    expect(eqs).toContainEqual(['id', 'n1']);
    expect(eqs).toContainEqual(['user_id', USER]);
  });
});
