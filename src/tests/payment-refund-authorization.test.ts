/**
 * Stage 10 security regression tests: refund authorization and webhook amount
 * reconciliation.
 *
 * These drive the REAL `PaymentService` methods rather than re-implementing the
 * rules. The previous suite asserted a security property
 * (`getPaymentTransitionActor(...) === 'system'`) against a function production
 * code never called, so a green suite coexisted with a completely unenforced
 * control. Every test here exercises the production entry point
 * (`PaymentService.refundPayment`, `PaymentService.handleWebhook`) with only the
 * Supabase client and the payment provider substituted, so a regression in the
 * service itself fails these tests.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { AppError } from '@/lib/errors';
import type { UserRole } from '@/types/database';

type Row = Record<string, unknown>;
type Filter = [string, unknown];

const db: Record<string, Row[]> = {
  users: [], payments: [], payouts: [], milestones: [], contracts: [],
  client_profiles: [], consultant_profiles: [], payment_refunds: [],
  payment_webhook_events: [], payment_status_history: [], notifications: [],
};

interface Query {
  table: string;
  op: 'select' | 'insert' | 'update';
  filters: Filter[];
  payload: Row | null;
  single: boolean;
}

function matches(row: Row, filters: Filter[]): boolean {
  return filters.every(([col, want]) => {
    const actual = row[col];
    if (want === null) return actual === null || actual === undefined;
    if (Array.isArray(want)) return want.includes(actual);
    return actual === want;
  });
}

function run(q: Query): { data: unknown; error: { message: string } | null } {
  const rows = db[q.table] ?? (db[q.table] = []);
  if (q.op === 'insert') {
    const row: Row = { id: randomUUID(), ...(q.payload ?? {}) };
    if (q.table === 'payment_webhook_events') {
      const clash = rows.find(
        (r) => r.provider === row.provider && r.provider_event_id === row.provider_event_id
      );
      if (clash) return { data: null, error: { message: 'duplicate key value' } };
    }
    rows.push(row);
    return { data: row, error: null };
  }
  if (q.op === 'update') {
    const target = rows.find((r) => matches(r, q.filters));
    if (!target) return { data: null, error: { message: 'no rows returned' } };
    Object.assign(target, q.payload ?? {});
    return { data: target, error: null };
  }
  const found = rows.filter((r) => matches(r, q.filters));
  if (q.single) {
    return found[0]
      ? { data: found[0], error: null }
      : { data: null, error: { message: 'no rows returned' } };
  }
  return { data: found, error: null };
}

function makeQuery(q: Query): unknown {
  return new Proxy(
    {},
    {
      get(_t, prop: string) {
        if (prop === 'then') return (resolve: (v: unknown) => void) => resolve(run(q));
        if (prop === 'single' || prop === 'maybeSingle') {
          return () => { q.single = true; return makeQuery(q); };
        }
        if (prop === 'select') return () => makeQuery(q);
        if (prop === 'eq' || prop === 'is') {
          return (col: string, val: unknown) => {
            q.filters.push([col, val]);
            return makeQuery(q);
          };
        }
        if (prop === 'in') {
          return (col: string, val: unknown[]) => {
            q.filters.push([col, val]);
            return makeQuery(q);
          };
        }
        if (prop === 'insert' || prop === 'update') {
          return (val: Row) => { q.op = prop; q.payload = val; return makeQuery(q); };
        }
        return () => makeQuery(q);
      },
    }
  );
}

function fakeSupabase() {
  return {
    from: (table: string) =>
      makeQuery({ table, op: 'select', filters: [], payload: null, single: false }),
  };
}

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => fakeSupabase() }));

const providerCalls: { method: string; args: unknown[] }[] = [];

function track<T>(method: string, result: (args: never[]) => T) {
  return vi.fn(async (...args: never[]) => {
    providerCalls.push({ method, args: args as unknown[] });
    return result(args);
  });
}

const fakeProvider = {
  name: 'razorpay',
  supportedCurrencies: ['INR'],
  createOrder: track('createOrder', () => ({ id: 'order_test_1' })),
  fetchOrder: track('fetchOrder', () => ({ id: 'order_test_1', amountCents: 1000, status: 'paid' })),
  fetchPayment: track('fetchPayment', () => ({
    id: 'pay_1', orderId: 'order_test_1', amountCents: 1000, amountCapturedCents: 1000,
    amountRefundedCents: 0, currency: 'INR', status: 'captured', method: null,
    feeCents: null, taxCents: null, errorCode: null, errorDescription: null, errorReason: null,
  })),
  capturePayment: track('capturePayment', () => ({})),
  createTransfer: track('createTransfer', () => ({ id: 'trf_1', settlementStatus: 'pending' })),
  releaseTransfer: track('releaseTransfer', () => ({ id: 'trf_1', settlementStatus: 'processing' })),
  reverseTransfer: track('reverseTransfer', () => ({ id: 'rvr_1' })),
  refundPayment: track('refundPayment', (args: never[]) => {
    const input = args[0] as { paymentId: string; amountCents?: number };
    return {
      id: 'rfnd_1', paymentId: input.paymentId,
      amountCents: input.amountCents ?? 1000, currency: 'INR', status: 'processed',
    };
  }),
  createConnectedAccount: track('createConnectedAccount', () => ({ id: 'acc_1' })),
  fetchConnectedAccount: track('fetchConnectedAccount', () => ({
    id: 'acc_1', status: 'active', detailsSubmitted: true, chargesEnabled: true, payoutsEnabled: true,
  })),
  verifyWebhookSignature: vi.fn(() => true),
};

vi.mock('@/lib/payments/razorpay.provider', () => ({
  getPaymentProvider: () => fakeProvider,
  RAZORPAY_CURRENCY: 'INR',
}));

const { PaymentService } = await import('@/services/payment.service');

const CONTRACT_ID = 'contract-1';
const GROSS = 1000;
const NET = GROSS - 100;

function seedUser(id: string, role: UserRole): string {
  db.users.push({ id, role, email: `${id}@example.com` });
  return id;
}

function seedEscrowedPayment(overrides: Row = {}): Row {
  const row: Row = {
    id: 'payment-1', contract_id: CONTRACT_ID, milestone_id: 'milestone-1',
    payer_client_id: 'client-profile-1', recipient_consultant_id: 'consultant-profile-1',
    gross_amount_cents: GROSS, platform_fee_cents: 100, net_amount_cents: NET,
    currency: 'INR', provider: 'razorpay', status: 'held_in_escrow',
    razorpay_order_id: 'order_test_1', razorpay_payment_id: 'pay_1',
    escrow_funded_at: new Date().toISOString(), escrow_released_at: null, refunded_at: null,
    created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    ...overrides,
  };
  db.payments.push(row);
  return row;
}

function seedConsultantProfile(): void {
  db.consultant_profiles.push({
    id: 'consultant-profile-1', user_id: 'consultant-1',
    razorpay_account_id: 'acc_1', payouts_enabled: true,
  });
}

const called = (method: string) => providerCalls.filter((c) => c.method === method).length;

beforeEach(() => {
  for (const key of Object.keys(db)) db[key] = [];
  providerCalls.length = 0;
});


// ---------------------------------------------------------------------------
// C-1: refund authorization
// ---------------------------------------------------------------------------

describe('refund authorization', () => {
  it('refuses a consultant, the party receiving the money', async () => {
    const consultant = seedUser('consultant-1', 'consultant');
    seedEscrowedPayment();

    await expect(
      PaymentService.refundPayment('payment-1', consultant, { reason: 'unfair', speed: 'normal' })
    ).rejects.toBeInstanceOf(AppError);

    expect(called('refundPayment')).toBe(0);
    expect(db.payments[0].status).toBe('held_in_escrow');
  });

  it('refuses an ordinary client, so escrow cannot be self-reversed', async () => {
    const client = seedUser('client-1', 'client');
    seedEscrowedPayment();

    await expect(
      PaymentService.refundPayment('payment-1', client, { reason: 'changed my mind', speed: 'normal' })
    ).rejects.toMatchObject({ statusCode: 403 });

    expect(called('refundPayment')).toBe(0);
    expect(db.payments[0].status).toBe('held_in_escrow');
  });

  it('allows an administrator to refund a held payment', async () => {
    const admin = seedUser('admin-1', 'admin');
    seedEscrowedPayment();

    const result = await PaymentService.refundPayment('payment-1', admin, {
      reason: 'dispute upheld out of band', speed: 'normal',
    });

    expect(called('refundPayment')).toBe(1);
    expect(result.payment.status).toBe('refunded');
    expect(result.refund.provider_refund_id).toBe('rfnd_1');
    expect(db.payment_refunds).toHaveLength(1);
  });

  it('reverses a released transfer when refunding after release', async () => {
    const admin = seedUser('admin-1', 'admin');
    seedEscrowedPayment({ status: 'released', escrow_released_at: new Date().toISOString() });
    db.payouts.push({
      id: 'payout-1', payment_id: 'payment-1', consultant_id: 'consultant-profile-1',
      amount_cents: NET, currency: 'INR', razorpay_transfer_id: 'trf_1',
      status: 'pending', processed_at: null,
    });

    await PaymentService.refundPayment('payment-1', admin, { reason: 'chargeback', speed: 'normal' });

    const args = providerCalls.find((c) => c.method === 'refundPayment')?.args[0] as {
      reverseTransfers: boolean;
    };
    expect(args.reverseTransfers).toBe(true);
    expect(db.payouts[0].status).toBe('failed');
    expect(db.payment_refunds[0].transfer_reversal_id).toBe('reverse_all:trf_1');
  });

  it('refuses to refund a payment that was never captured', async () => {
    const admin = seedUser('admin-1', 'admin');
    seedEscrowedPayment({ status: 'pending', escrow_funded_at: null });

    await expect(
      PaymentService.refundPayment('payment-1', admin, { reason: 'x', speed: 'normal' })
    ).rejects.toMatchObject({ statusCode: 409 });

    expect(called('refundPayment')).toBe(0);
  });

  it('refuses a second refund of an already-refunded payment', async () => {
    const admin = seedUser('admin-1', 'admin');
    seedEscrowedPayment({ status: 'refunded' });

    await expect(
      PaymentService.refundPayment('payment-1', admin, { reason: 'again', speed: 'normal' })
    ).rejects.toMatchObject({ statusCode: 409 });

    expect(called('refundPayment')).toBe(0);
  });

  it('returns 403, not 404, for a non-admin probing a missing payment id', async () => {
    const client = seedUser('client-1', 'client');
    // Enumeration guard: a non-admin must not learn whether an id exists, so the
    // role gate must fire before the payment is loaded.
    await expect(
      PaymentService.refundPayment('does-not-exist', client, { reason: 'x', speed: 'normal' })
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it('returns 404 to an administrator for a genuinely missing payment', async () => {
    const admin = seedUser('admin-1', 'admin');
    await expect(
      PaymentService.refundPayment('does-not-exist', admin, { reason: 'x', speed: 'normal' })
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});


// ---------------------------------------------------------------------------
// H-1: webhook captured-amount reconciliation fails closed
// ---------------------------------------------------------------------------

function capturedPayload(entity: Row) {
  return {
    event: 'payment.captured',
    contains: ['payment'],
    payload: { payment: { id: 'pay_1', order_id: 'order_test_1', ...entity } },
  };
}

function fire(eventId: string, entity: Row) {
  return PaymentService.handleWebhook({
    eventId, eventType: 'payment.captured', payload: capturedPayload(entity),
  });
}

describe('webhook captured-amount reconciliation fails closed', () => {
  it('refuses an event carrying no amount at all', async () => {
    seedEscrowedPayment({ status: 'pending' });
    await expect(fire('evt_1', {})).rejects.toMatchObject({ code: 'AMOUNT_UNVERIFIABLE' });
    expect(called('createTransfer')).toBe(0);
    expect(db.payments[0].status).toBe('pending');
  });

  it('refuses a non-numeric amount', async () => {
    seedEscrowedPayment({ status: 'pending' });
    await expect(fire('evt_2', { amount_captured: 'not-a-number' }))
      .rejects.toMatchObject({ code: 'AMOUNT_UNVERIFIABLE' });
    expect(called('createTransfer')).toBe(0);
  });

  it('refuses a null amount', async () => {
    seedEscrowedPayment({ status: 'pending' });
    await expect(fire('evt_2b', { amount: null, amount_captured: null }))
      .rejects.toMatchObject({ code: 'AMOUNT_UNVERIFIABLE' });
    expect(called('createTransfer')).toBe(0);
  });

  it('refuses a zero captured amount', async () => {
    seedEscrowedPayment({ status: 'pending' });
    await expect(fire('evt_2c', { amount_captured: 0 }))
      .rejects.toMatchObject({ code: 'AMOUNT_UNVERIFIABLE' });
    expect(called('createTransfer')).toBe(0);
  });

  it('refuses a captured amount that does not match the recorded gross', async () => {
    seedEscrowedPayment({ status: 'pending' });
    await expect(fire('evt_3', { amount_captured: 1 }))
      .rejects.toMatchObject({ code: 'AMOUNT_MISMATCH' });
    expect(called('createTransfer')).toBe(0);
    expect(db.payments[0].status).toBe('pending');
  });

  it('opens escrow when the captured amount reconciles exactly', async () => {
    seedEscrowedPayment({ status: 'pending' });
    seedConsultantProfile();
    db.milestones.push({ id: 'milestone-1', contract_id: CONTRACT_ID, status: 'pending' });

    const result = await fire('evt_4', { amount_captured: GROSS });

    expect(result.payment_id).toBe('payment-1');
    expect(called('createTransfer')).toBe(1);
    expect(db.payments[0].status).toBe('held_in_escrow');
    expect(db.payouts).toHaveLength(1);
    // Held escrow drives the Stage 9 milestone into `funded`.
    expect(db.milestones[0].status).toBe('funded');
  });

  it('stays idempotent when the same event id is delivered twice', async () => {
    seedEscrowedPayment({ status: 'pending' });
    seedConsultantProfile();
    db.milestones.push({ id: 'milestone-1', contract_id: CONTRACT_ID, status: 'pending' });

    const first = await fire('evt_5', { amount_captured: GROSS });
    const second = await fire('evt_5', { amount_captured: GROSS });

    expect(first.duplicate).toBe(false);
    expect(second.duplicate).toBe(true);
    expect(called('createTransfer')).toBe(1);
    expect(db.payouts).toHaveLength(1);
  });

  it('records a failed event so a retry re-enters instead of being skipped', async () => {
    seedEscrowedPayment({ status: 'pending' });
    await expect(fire('evt_6', {})).rejects.toBeTruthy();
    const event = db.payment_webhook_events.find((e) => e.provider_event_id === 'evt_6');
    expect(event?.processing_status).toBe('failed');
  });
});

