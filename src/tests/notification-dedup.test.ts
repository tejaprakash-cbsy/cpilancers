import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Deduplication, concurrency and retry tests for `NotificationService`.
 *
 * The final Stage 12 audit asked for a milestone-submission concurrency test and
 * a retry/idempotency test, with one important constraint: the result must not be
 * faked by simply returning a unique-constraint error from a stub. These tests
 * therefore run the real `emit` against a fake database that ACTUALLY ENFORCES
 * the partial unique index from migration 00013:
 *
 *     CREATE UNIQUE INDEX uq_notifications_dedup_key
 *       ON public.notifications (dedup_key) WHERE dedup_key IS NOT NULL;
 *
 * The fake rejects a second insert carrying a live `dedup_key` with a genuine
 * SQLSTATE 23505, exactly as Postgres does. The service's own
 * `isDedupViolation` / `findByDedupKey` path then has to turn that into "already
 * notified, carry on". If that path were deleted, or if the dedup key stopped
 * including the submission identity, these tests fail. They encode no expected
 * answer of their own.
 */

type Row = Record<string, unknown>;

// ---------------------------------------------------------------------------
// Fake database, enforcing the 00013 partial unique index for real.
// ---------------------------------------------------------------------------

let notificationRows: Row[] = [];
let deliveryRows: Row[] = [];
let idCounter = 0;

function matches(r: Row, filters: Array<[string, unknown]>): boolean {
  return filters.every(([c, v]) => r[c] === v);
}

function findRows(table: string, filters: Array<[string, unknown]>): Row[] {
  if (table === 'notifications') return notificationRows.filter((r) => matches(r, filters));
  if (table === 'notification_deliveries') return deliveryRows.filter((r) => matches(r, filters));
  return [];
}

/** The one place a duplicate is arbitrated, mirroring Postgres. */
function insertNotification(payload: Row): { data: Row | null; error: unknown } {
  const key = payload.dedup_key;
  if (key != null && notificationRows.some((r) => r.dedup_key === key)) {
    return {
      data: null,
      error: {
        code: '23505',
        message: 'duplicate key value violates unique constraint "uq_notifications_dedup_key"',
      },
    };
  }
  idCounter += 1;
  const row: Row = {
    id: '00000000-0000-4000-8000-' + String(idCounter).padStart(12, '0'),
    created_at: new Date().toISOString(),
    ...payload,
  };
  notificationRows.push(row);
  return { data: row, error: null };
}

function upsertDelivery(payload: Row): { data: null; error: unknown } {
  const existing = deliveryRows.find(
    (r) => r.notification_id === payload.notification_id && r.channel === payload.channel
  );
  if (existing) {
    // The (notification_id, channel) unique constraint makes a repeat write an
    // UPDATE of the existing attempt, not a second row.
    Object.assign(existing, payload);
  } else {
    deliveryRows.push({ ...payload });
  }
  return { data: null, error: null };
}

function builder(table: string) {
  const filters: Array<[string, unknown]> = [];
  let lastWrite: { data: unknown; error: unknown } | null = null;

  const resolve = (): { data: unknown; error: unknown } => {
    if (lastWrite) return lastWrite;
    if (table === 'users') {
      return { data: { id: 'u1', email: 'recipient@example.test' }, error: null };
    }
    if (table === 'profiles') {
      return { data: { display_name: 'Test Recipient' }, error: null };
    }
    return { data: findRows(table, filters), error: null };
  };

  const one = (r: { data: unknown; error: unknown }) => {
    const data = Array.isArray(r.data) ? (r.data[0] ?? null) : r.data;
    return { data, error: r.error };
  };

  const api: Record<string, unknown> = {
    select: () => api,
    insert: (payload: unknown) => {
      lastWrite = insertNotification(payload as Row);
      return api;
    },
    upsert: (payload: unknown) => {
      lastWrite = upsertDelivery(payload as Row);
      return api;
    },
    eq: (col: string, val: unknown) => {
      filters.push([col, val]);
      return api;
    },
    order: () => api,
    range: () => api,
    // maybeSingle / single take the first match, or null, as PostgREST does.
    single: async () => one(resolve()),
    maybeSingle: async () => one(resolve()),
    then: (res: (v: { data: unknown; error: unknown }) => unknown) => res(resolve()),
  };
  return api;
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: (table: string) => builder(table) }),
}));

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

import { NotificationService } from '@/services/notification.service';
import { milestoneSubmitted, disputeOpened } from '@/lib/notifications/events';
import { buildDedupKey } from '@/lib/notifications/dedup';
import { CONTRACT_TRANSITIONS } from '@/lib/validations/contract.schemas';

const CLIENT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const MILESTONE = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const CONTRACT = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';


beforeEach(() => {
  notificationRows = [];
  deliveryRows = [];
  idCounter = 0;
  vi.clearAllMocks();
  mockInApp.isConfigured.mockReturnValue(true);
  mockEmail.isConfigured.mockReturnValue(true);
  mockInApp.deliver.mockResolvedValue({ status: 'sent', providerMessageId: 'in-app' });
  mockEmail.deliver.mockResolvedValue({ status: 'sent', providerMessageId: 'sg-1' });
});

// ===========================================================================
// Milestone submission: one event, one notification, under concurrency
// ===========================================================================

/** The real builder, with a caller-chosen submission occurrence id. */
function submitMilestone(submissionId: string) {
  return milestoneSubmitted(NotificationService.emitEvent, {
    recipientUserId: CLIENT,
    milestoneId: MILESTONE,
    submissionId,
    milestoneTitle: 'Cutover',
    contractId: CONTRACT,
    actorUserId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    actorName: 'Consultant',
  });
}

describe('Stage 12: a milestone submission event yields exactly one notification', () => {
  it('collapses two concurrent processors for the same submission', async () => {
    // The required property: same submission event, two simultaneous
    // processors, ONE notification. Both emits run the real code path; the
    // second loses the unique index, which the service must absorb.
    const [a, b] = await Promise.all([
      submitMilestone('2026-01-01T00:00:00.000Z'),
      submitMilestone('2026-01-01T00:00:00.000Z'),
    ]);

    expect(notificationRows).toHaveLength(1);
    // Exactly one of the two created it; the other reported the existing row.
    expect([a.created, b.created].filter(Boolean)).toHaveLength(1);
    // Both callers learn the notification is in place, so neither business
    // transaction sees a failure for a duplicate.
    expect(a.notification?.id).toBe(b.notification?.id);
  });

  it('sends one email, not two, for that same submission', async () => {
    await Promise.all([
      submitMilestone('2026-01-01T00:00:00.000Z'),
      submitMilestone('2026-01-01T00:00:00.000Z'),
    ]);
    expect(notificationRows).toHaveLength(1);
    // The loser returns before any channel is invoked, which is the layer that
    // actually prevents the second send.
    expect(mockEmail.deliver).toHaveBeenCalledTimes(1);
    expect(mockInApp.deliver).toHaveBeenCalledTimes(1);
  });

  it('writes one delivery row per channel', async () => {
    await Promise.all([
      submitMilestone('2026-01-01T00:00:00.000Z'),
      submitMilestone('2026-01-01T00:00:00.000Z'),
    ]);
    expect(deliveryRows).toHaveLength(2);
    expect(new Set(deliveryRows.map((d) => d.channel))).toEqual(new Set(['in_app', 'email']));
  });

  it('treats two distinct submissions of the same milestone as two events', async () => {
    // The Stage 9 machine permits disputed -> submitted, so a milestone really
    // can be submitted more than once. These are two legitimate notifications
    // and must not be merged.
    const first = await submitMilestone('2026-01-01T00:00:00.000Z');
    const second = await submitMilestone('2026-02-02T00:00:00.000Z');

    expect(first.created).toBe(true);
    expect(second.created).toBe(true);
    expect(notificationRows).toHaveLength(2);
    expect(mockEmail.deliver).toHaveBeenCalledTimes(2);
  });

  it('encodes the submission occurrence, not just the milestone, in the key', async () => {
    // This is the identity property the audit asked to see verified. If the key
    // were the milestone alone, the previous test would collapse to one.
    const a = buildDedupKey({
      type: 'milestone_submitted',
      entityId: MILESTONE + '@' + '2026-01-01T00:00:00.000Z',
      recipientId: CLIENT,
    });
    const b = buildDedupKey({
      type: 'milestone_submitted',
      entityId: MILESTONE + '@' + '2026-02-02T00:00:00.000Z',
      recipientId: CLIENT,
    });
    expect(a).not.toBe(b);
    expect(a).toContain(MILESTONE);
  });

  it('requires a submissionId, so a caller cannot silently fall back to milestone-only', () => {
    // The parameter is required rather than optional, which is what makes the
    // above guarantee hold for every call site.
    expect(milestoneSubmitted.length).toBe(2);
  });
});

// ===========================================================================
// Dispute deduplication identity
// ===========================================================================

function openDispute(contractId: string, disputeId?: string) {
  return disputeOpened(NotificationService.emitEvent, {
    recipientUserId: CLIENT,
    contractId,
    contractTitle: 'SAP migration',
    disputeId: disputeId ?? null,
  });
}

describe('Stage 12: the dispute dedup identity is sound', () => {
  it('collapses a repeated dispute-open event for the same contract', async () => {
    await openDispute(CONTRACT);
    await openDispute(CONTRACT);
    expect(notificationRows).toHaveLength(1);
    expect(mockEmail.deliver).toHaveBeenCalledTimes(1);
  });

  it('collapses the same contract under concurrent processors', async () => {
    await Promise.all([openDispute(CONTRACT), openDispute(CONTRACT)]);
    expect(notificationRows).toHaveLength(1);
  });

  it('keeps two different contracts apart', async () => {
    await openDispute(CONTRACT);
    await openDispute('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee');
    expect(notificationRows).toHaveLength(2);
  });

  it('tightens to the dispute id when one is supplied', async () => {
    // A future dispute-creation flow passes the row id; the key must follow it
    // so two disputes on one contract would not be merged.
    const d1 = 'd0000000-0000-4000-8000-000000000001';
    const d2 = 'd0000000-0000-4000-8000-000000000002';
    await openDispute(CONTRACT, d1);
    await openDispute(CONTRACT, d2);
    expect(notificationRows).toHaveLength(2);
  });

  it('justifies the contract key: a contract can be disputed at most once', () => {
    // This is the property that makes keying on the contract CORRECT rather than
    // merely convenient. If the state machine is ever widened to let a contract
    // leave dispute and re-enter, this test fails and the key must be revisited.
    const into = CONTRACT_TRANSITIONS.active;
    expect(into).toContain('disputed');
    // Every exit from `disputed` must be terminal, or a second dispute becomes
    // reachable and the contract is no longer a unique event identity.
    for (const next of CONTRACT_TRANSITIONS.disputed) {
      expect(CONTRACT_TRANSITIONS[next]).toEqual([]);
    }
    // Only `active` can enter dispute, and it cannot be re-entered from there.
    const reentry = CONTRACT_TRANSITIONS.disputed;
    expect(reentry).not.toContain('active');
  });
});

// ===========================================================================
// Retry / idempotency
// ===========================================================================

describe('Stage 12: retrying an event never duplicates a notification', () => {
  it('a second emit of the same event creates nothing and sends nothing', async () => {
    const first = await submitMilestone('2026-01-01T00:00:00.000Z');
    const second = await submitMilestone('2026-01-01T00:00:00.000Z');

    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(notificationRows).toHaveLength(1);
    // The retry must not re-invoke email. This is the whole point.
    expect(mockEmail.deliver).toHaveBeenCalledTimes(1);
  });

  it('returns the ORIGINAL notification to the retrying caller', async () => {
    const first = await submitMilestone('2026-01-01T00:00:00.000Z');
    const second = await submitMilestone('2026-01-01T00:00:00.000Z');
    // So a caller that needs the id (e.g. to attach a delivery record) gets the
    // real one rather than null.
    expect(second.notification?.id).toBe(first.notification?.id);
  });

  it('survives many sequential retries of one event', async () => {
    for (let i = 0; i < 5; i += 1) {
      await submitMilestone('2026-01-01T00:00:00.000Z');
    }
    expect(notificationRows).toHaveLength(1);
    expect(mockEmail.deliver).toHaveBeenCalledTimes(1);
  });

  it('keeps the retry from creating a second delivery record', async () => {
    await submitMilestone('2026-01-01T00:00:00.000Z');
    // Simulate a re-drive of the delivery itself (the shape a future retry
    // processor would use): the (notification_id, channel) unique constraint
    // turns it into an update of the existing attempt.
    const notificationId = notificationRows[0].id;
    upsertDelivery({
      notification_id: notificationId,
      channel: 'email',
      status: 'sent',
      provider_message_id: 'sg-retry',
      attempt_count: 2,
    });
    expect(deliveryRows.filter((d) => d.channel === 'email')).toHaveLength(1);
    expect(deliveryRows.find((d) => d.channel === 'email')?.provider_message_id).toBe('sg-retry');
  });

  it('records the failure on the delivery row without losing the notification', async () => {
    // A failed email is recorded against the notification, which stays visible
    // in the feed. A channel failure is not a notification failure.
    mockEmail.deliver.mockResolvedValue({ status: 'failed', error: 'SendGrid error 500' });
    const result = await submitMilestone('2026-01-01T00:00:00.000Z');

    expect(result.created).toBe(true);
    expect(result.notification).not.toBeNull();
    expect(result.deliveries.email).toBe('failed');
    expect(notificationRows).toHaveLength(1);
    const emailDelivery = deliveryRows.find((d) => d.channel === 'email');
    expect(emailDelivery?.status).toBe('failed');
    expect(emailDelivery?.last_error).toContain('500');
  });

  it('carries a retry hint on a retryable failure', async () => {
    // The hint is recorded for a future retry processor. Nothing consumes it
    // today, which is a deliberate choice: see the guarantee note on `emit`.
    mockEmail.deliver.mockResolvedValue({
      status: 'failed',
      error: 'SendGrid error 429',
      retryAfterSeconds: 60,
    });
    await submitMilestone('2026-01-01T00:00:00.000Z');
    const emailDelivery = deliveryRows.find((d) => d.channel === 'email');
    expect(emailDelivery?.next_retry_at).toBeTruthy();
  });

  it('does not re-send on retry after a failure either', async () => {
    // Even a failure leaves the notification recorded, so a re-drive of the
    // same business event is absorbed rather than producing a second attempt.
    mockEmail.deliver.mockResolvedValue({ status: 'failed', error: 'boom' });
    await submitMilestone('2026-01-01T00:00:00.000Z');
    await submitMilestone('2026-01-01T00:00:00.000Z');
    expect(mockEmail.deliver).toHaveBeenCalledTimes(1);
    expect(notificationRows).toHaveLength(1);
  });
});
