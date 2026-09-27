/**
 * Payment service — Stage 10.
 *
 * Owns the escrow lifecycle for marketplace payments:
 *
 *   create -> pending
 *   provider captures the payment -> held_in_escrow  (transfer created, on hold)
 *   client releases after milestone approval -> released (hold removed)
 *   provider settles the transfer -> payout completed
 *   dispute or cancellation -> refunded
 *   payment never completes -> failed
 *
 * Security invariants enforced here, not merely documented:
 *
 *  1. The amount is read from `milestones.amount_cents` and never from a request
 *     body. `createPayment` takes a milestone id and nothing else.
 *  2. The platform fee is resolved from `platform_fee_config` on the server and
 *     frozen onto the payment row.
 *  3. A payment is only ever advanced to `held_in_escrow` from a provider fetch
 *     whose captured amount equals the stored gross. Frontend state is ignored.
 *  4. Every mutation goes through the state machine in `payment.schemas`.
 *  5. Webhook processing is idempotent on the provider event id.
 *
 * The service uses the Supabase service-role client, which bypasses RLS, so
 * every method re-derives participant authorisation itself.
 */

import { createAdminClient } from '@/lib/supabase/admin';
import { BaseService } from './base.service';
import type {
  Payment,
  Payout,
  PaymentRefund,
  PaymentStatusHistory,
  PlatformFeeConfig,
} from '@/types/database';
import type { PayoutStatus, PaymentStatus, UserRole } from '@/types/database';
import {
  AppError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from '@/lib/errors';
import {
  isValidPaymentTransition,
  isValidPayoutTransition,
  getPaymentTransitionActor,
  getRefundAuthorizer,
  canRefundPayment,
  REFUND_FORBIDDEN_MESSAGE,
} from '@/lib/validations/payment.schemas';
import { calculateFeeBreakdown, selectFeeConfig, ZERO_FEE_CONFIG } from '@/lib/payments/fees';
import { getPaymentProvider } from '@/lib/payments/razorpay.provider';
import { RAZORPAY_CURRENCY } from '@/lib/payments/razorpay.provider';
import type {
  ProviderPayment,
  ProviderTransfer,
  CreateConnectedAccountInput,
} from '@/lib/payments/provider';
import { NotificationService } from '@/services/notification.service';
import { paymentEscrowed, paymentFailed, paymentReleased } from '@/lib/notifications/events';

/**
 * Render integer minor units (paise) as a human amount for notification copy.
 *
 * The division is done in paise and formatted to exactly two decimals, so no
 * floating-point rounding can put a wrong figure in front of a consultant or a
 * client. The currency code is appended rather than a symbol, because the ledger
 * is multi-currency by design and a hardcoded rupee sign would be wrong the moment
 * the provider market widens.
 */
function formatMinorUnits(minorUnits: number, currency: string): string {
  const safe = Number.isInteger(minorUnits) ? minorUnits : 0;
  const negative = safe < 0;
  const absolute = Math.abs(safe);
  const major = Math.trunc(absolute / 100);
  const paise = absolute % 100;
  return `${negative ? '-' : ''}${currency} ${major}.${String(paise).padStart(2, '0')}`;
}

// -------------------------------------------------------------------------
// Webhook payload shapes
// -------------------------------------------------------------------------
// Razorpay envelopes nest the interesting object under `payload.<entity>`, and
// the entity's field set varies by event. These are narrow, fully-typed views
// of the documented fields this integration actually reads, so a field that
// disappears upstream surfaces as `undefined` rather than as an `any` that
// silently type-checks.
interface WebhookPaymentEntity {
  id?: string;
  order_id?: string | null;
  amount?: number | string;
  amount_captured?: number | string;
  amount_refunded?: number | string;
  currency?: string;
  status?: string;
  method?: string | null;
  fee?: number | null;
  tax?: number | null;
  error_code?: string | null;
  error_description?: string | null;
  error_reason?: string | null;
}

interface WebhookTransferEntity {
  id?: string;
  status?: string;
  settlement_status?: string | null;
  recipient_settlement_id?: string | null;
  error?: { code?: string | null; description?: string | null } | null;
}

interface WebhookRefundEntity {
  id?: string;
  payment_id?: string;
  status?: string;
}

interface WebhookSettlementEntity {
  id?: string;
  status?: string;
}

type Participant = { isClient: boolean; isConsultant: boolean; clientId: string; consultantId: string };

export interface CreatePaymentResult {
  payment: Payment;
  /** Razorpay order id the browser hands to Checkout. */
  razorpay_order_id: string;
  /** Public key for the browser SDK. The key secret is never returned. */
  razorpay_key_id: string;
  amount_cents: number;
  currency: string;
}

export class PaymentService extends BaseService {
  private static provider() {
    return getPaymentProvider();
  }

  // -------------------------------------------------------------------------
  // Authorisation helpers
  // -------------------------------------------------------------------------

  /**
   * Resolve the caller's role on a contract, plus the profile ids that own the
   * contract. Mirrors ContractService.participant so both services agree on what
   * "participant" means.
   */
  private static async participantForContract(
    contract: { client_id: string; consultant_id: string },
    userId: string
  ): Promise<Participant> {
    const db = createAdminClient();
    const [{ data: client }, { data: consultant }] = await Promise.all([
      db.from('client_profiles').select('user_id').eq('id', contract.client_id).single(),
      db.from('consultant_profiles').select('user_id').eq('id', contract.consultant_id).single(),
    ]);
    return {
      isClient: client?.user_id === userId,
      isConsultant: consultant?.user_id === userId,
      clientId: contract.client_id,
      consultantId: contract.consultant_id,
    };
  }

  private static async participantForPayment(
    payment: Pick<Payment, 'payer_client_id' | 'recipient_consultant_id'>,
    userId: string
  ): Promise<Participant> {
    const db = createAdminClient();
    const [{ data: client }, { data: consultant }] = await Promise.all([
      db.from('client_profiles').select('user_id').eq('id', payment.payer_client_id).single(),
      db
        .from('consultant_profiles')
        .select('user_id')
        .eq('id', payment.recipient_consultant_id)
        .single(),
    ]);
    return {
      isClient: client?.user_id === userId,
      isConsultant: consultant?.user_id === userId,
      clientId: payment.payer_client_id,
      consultantId: payment.recipient_consultant_id,
    };
  }

  /**
   * Resolve the caller's role from `public.users`.
   *
   * `userId` is supplied by the route from `AuthService.getCurrentUser()`, which
   * resolves the validated session cookie, so the identity is server-derived and
   * not client-supplied. The role is then re-read from the database rather than
   * accepted from the caller, so a request body, query parameter or header can
   * never widen it.
   */
  private static async getCallerRole(userId: string): Promise<UserRole> {
    const { data, error } = await createAdminClient()
      .from('users')
      .select('role')
      .eq('id', userId)
      .single();
    if (error || !data) {
      throw new UnauthorizedError('Your account could not be resolved for authorization.');
    }
    return data.role as UserRole;
  }

  /**
   * Total cents already committed to a contract across live payment rows.
   *
   * Only `pending`, `held_in_escrow` and `released` count: a `failed` or
   * `refunded` payment no longer holds or represents money, so it releases budget
   * back to the contract.
   */
  private static async sumFundedCents(contractId: string): Promise<number> {
    const { data, error } = await createAdminClient()
      .from('payments')
      .select('gross_amount_cents')
      .eq('contract_id', contractId)
      .in('status', ['pending', 'held_in_escrow', 'released']);
    if (error) {
      throw new AppError('Failed to read the contract funding position.', 500, 'FUNDING_TOTAL_FETCH_ERROR', error);
    }
    return (data || []).reduce(
      (sum, row) => sum + Number(row.gross_amount_cents ?? 0),
      0
    );
  }

  // -------------------------------------------------------------------------
  // Fee resolution
  // -------------------------------------------------------------------------

  private static async resolveFees(
    contractId: string,
    milestoneId: string | null,
    grossAmountCents: number
  ) {
    const db = createAdminClient();
    const { data, error } = await db
      .from('platform_fee_config')
      .select('*')
      .eq('is_active', true);
    if (error) {
      throw new AppError('Failed to load the platform fee configuration.', 500, 'FEE_CONFIG_FETCH_ERROR', error);
    }

    const config = selectFeeConfig((data || []) as PlatformFeeConfig[], {
      contractId,
      milestoneId,
    });

    // A missing configuration resolves to a zero fee rather than throwing. The
    // payment must not fail because commercial configuration is incomplete, and
    // under-charging is recoverable while a wrong fee is not.
    return calculateFeeBreakdown(
      grossAmountCents,
      config ? { ...config, id: config.id, scope: config.scope } : { ...ZERO_FEE_CONFIG, scope: 'fallback_zero' }
    );
  }

  // -------------------------------------------------------------------------
  // Payment creation
  // -------------------------------------------------------------------------

  /**
   * Create a payment for a milestone.
   *
   * Only a milestone id is accepted. The amount, currency, fee and both
   * counterparties are read from the database. There is intentionally no
   * overload that accepts an amount.
   */
  static async createPayment(
    clientUserId: string,
    milestoneId: string
  ): Promise<CreatePaymentResult> {
    const db = createAdminClient();

    const { data: milestone, error: milestoneError } = await db
      .from('milestones')
      .select('*')
      .eq('id', milestoneId)
      .single();
    if (milestoneError || !milestone) throw new NotFoundError('Milestone');

    const { data: contract, error: contractError } = await db
      .from('contracts')
      .select('*')
      .eq('id', milestone.contract_id)
      .single();
    if (contractError || !contract) throw new NotFoundError('Contract');

    const actor = await this.participantForContract(contract, clientUserId);
    if (!actor.isClient) {
      throw new ForbiddenError('Only the client on this contract can fund a milestone.');
    }

    // Milestones are a fixed-price construct. Hourly contracts bill on time
    // entries, not upfront escrow, so there is no amount to fund here.
    const contractType = contract.contract_type ||
      (contract.payment_structure === 'hourly_capped' ? 'hourly' : 'fixed_price');
    if (contractType !== 'fixed_price') {
      throw new ForbiddenError('Milestone escrow is only available for fixed-price contracts.');
    }

    if (contract.status !== 'pending_acceptance' && contract.status !== 'active') {
      throw new ConflictError('This contract is not in a state that accepts funding.');
    }

    // Only an unfunded milestone can be funded. Anything past `pending` has
    // either been funded already or been cancelled.
    if (milestone.status !== 'pending') {
      throw new ConflictError(
        `This milestone is "${milestone.status}" and can no longer be funded.`
      );
    }

    const grossAmountCents = Number(milestone.amount_cents);
    if (!Number.isInteger(grossAmountCents) || grossAmountCents <= 0) {
      throw new ValidationError('The milestone amount stored for this contract is not chargeable.');
    }

    // Refuse to escrow into an account that cannot receive funds. Razorpay
    // reports this as a transfer failure, which is far more expensive to unwind
    // than a clear error at funding time.
    const { data: consultant } = await db
      .from('consultant_profiles')
      .select('razorpay_account_id, payouts_enabled')
      .eq('id', contract.consultant_id)
      .single();
    if (!consultant?.razorpay_account_id || consultant.payouts_enabled !== true) {
      throw new ConflictError(
        'The consultant has not completed payout onboarding, so this milestone cannot be funded yet.'
      );
    }

    const fees = await this.resolveFees(contract.id, milestone.id, grossAmountCents);

    // M-7: a payment whose net is zero can never pay the consultant. Escrow
    // creates the Route transfer BEFORE the payout row is inserted, and
    // `payouts.amount_cents > 0` (00001) would then reject the insert - leaving
    // an orphaned live transfer at the provider. Refuse before any provider call
    // so the failure is readable and nothing is created at Razorpay.
    if (fees.net_amount_cents <= 0) {
      throw new ValidationError(
        'The platform fee for this milestone leaves nothing for the consultant, so it cannot be escrowed. Review the fee configuration.'
      );
    }

    // M-6: refuse early with a readable error. This is a convenience check only:
    // the authoritative, concurrency-safe enforcement is the
    // `trg_contract_funding_ceiling` BEFORE INSERT trigger in migration 00009,
    // which takes a row lock on the contract so two simultaneous funding
    // requests cannot both observe the same pre-funding total and both pass.
    const alreadyFundedCents = await this.sumFundedCents(contract.id);
    if (alreadyFundedCents + fees.gross_amount_cents > contract.total_amount_cents) {
      throw new ConflictError(
        'Funding this milestone would exceed the total value of the contract.'
      );
    }

    // Write the ledger row before talking to the provider. If the provider call
    // fails, the row is a `pending` record with no order id, which is
    // indistinguishable from an abandoned checkout and can be swept.
    const { data: payment, error: insertError } = await db
      .from('payments')
      .insert({
        contract_id: contract.id,
        milestone_id: milestone.id,
        payer_client_id: contract.client_id,
        recipient_consultant_id: contract.consultant_id,
        gross_amount_cents: fees.gross_amount_cents,
        platform_fee_cents: fees.platform_fee_cents,
        net_amount_cents: fees.net_amount_cents,
        currency: RAZORPAY_CURRENCY,
        provider: this.provider().name,
        status: 'pending',
      })
      .select('*')
      .single();
    if (insertError || !payment) {
      throw new AppError('Failed to open a payment record.', 500, 'PAYMENT_INSERT_ERROR', insertError);
    }

    let order;
    try {
      order = await this.provider().createOrder({
        amountCents: fees.gross_amount_cents,
        currency: RAZORPAY_CURRENCY,
        // Razorpay enforces uniqueness on `receipt`, which is the idempotency
        // guard against a double-submitted checkout.
        receipt: `pay_${payment.id.replace(/-/g, '').slice(0, 28)}`,
        notes: {
          payment_id: payment.id,
          contract_id: contract.id,
          milestone_id: milestone.id,
        },
      });
    } catch (error) {
      await db.from('payments').delete().eq('id', payment.id);
      throw error;
    }

    const { data: withOrder, error: orderError } = await db
      .from('payments')
      .update({ razorpay_order_id: order.id, updated_at: new Date().toISOString() })
      .eq('id', payment.id)
      .select('*')
      .single();
    if (orderError || !withOrder) {
      throw new AppError('Failed to attach the provider order to the payment.', 500, 'PAYMENT_ORDER_LINK_ERROR', orderError);
    }

    await this.recordHistory(withOrder.id, null, 'pending', {
      trigger_source: 'service',
      actor_user_id: clientUserId,
      metadata: { fee_scope: fees.scope, platform_fee_cents: fees.platform_fee_cents },
    });

    return {
      payment: withOrder as Payment,
      razorpay_order_id: order.id,
      razorpay_key_id: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID || '',
      amount_cents: fees.gross_amount_cents,
      currency: RAZORPAY_CURRENCY,
    };
  }

  // -------------------------------------------------------------------------
  // Reads
  // -------------------------------------------------------------------------

  static async getPayment(id: string, userId: string): Promise<Payment> {
    const payment = await this.getRaw(id);
    const actor = await this.participantForPayment(payment, userId);
    if (!actor.isClient && !actor.isConsultant) {
      throw new ForbiddenError('You do not have access to this payment.');
    }
    return payment;
  }

  private static async getRaw(id: string): Promise<Payment> {
    const { data, error } = await createAdminClient()
      .from('payments')
      .select('*')
      .eq('id', id)
      .single();
    if (error || !data) throw new NotFoundError('Payment');
    return data as Payment;
  }

  static async listPayments(
    userId: string,
    filters: { contract_id?: string; status?: PaymentStatus[] } = {}
  ): Promise<Payment[]> {
    const db = createAdminClient();
    const [{ data: client }, { data: consultant }] = await Promise.all([
      db.from('client_profiles').select('id').eq('user_id', userId).maybeSingle(),
      db.from('consultant_profiles').select('id').eq('user_id', userId).maybeSingle(),
    ]);

    let query = db.from('payments').select('*').order('created_at', { ascending: false });

    if (client?.id) query = query.eq('payer_client_id', client.id);
    else if (consultant?.id) query = query.eq('recipient_consultant_id', consultant.id);
    else return [];

    if (filters.contract_id) query = query.eq('contract_id', filters.contract_id);
    if (filters.status?.length) query = query.in('status', filters.status);

    const { data, error } = await query;
    if (error) throw new AppError('Failed to fetch payments.', 500, 'PAYMENT_FETCH_ERROR', error);
    return (data || []) as Payment[];
  }

  static async listPayouts(
    userId: string,
    filters: { status?: PayoutStatus[] } = {}
  ): Promise<Payout[]> {
    const db = createAdminClient();
    const { data: consultant } = await db
      .from('consultant_profiles')
      .select('id')
      .eq('user_id', userId)
      .maybeSingle();
    if (!consultant?.id) return [];

    let query = db
      .from('payouts')
      .select('*')
      .eq('consultant_id', consultant.id)
      .order('created_at', { ascending: false });
    if (filters.status?.length) query = query.in('status', filters.status);

    const { data, error } = await query;
    if (error) throw new AppError('Failed to fetch payouts.', 500, 'PAYOUT_FETCH_ERROR', error);
    return (data || []) as Payout[];
  }

  static async listRefunds(paymentId: string, userId: string): Promise<PaymentRefund[]> {
    await this.getPayment(paymentId, userId);
    const { data, error } = await createAdminClient()
      .from('payment_refunds')
      .select('*')
      .eq('payment_id', paymentId)
      .order('created_at', { ascending: false });
    if (error) throw new AppError('Failed to fetch refunds.', 500, 'REFUND_FETCH_ERROR', error);
    return (data || []) as PaymentRefund[];
  }

  // -------------------------------------------------------------------------
  // Confirmation and escrow
  // -------------------------------------------------------------------------

  /**
   * Reconcile a payment against the provider and, once the money is provably
   * captured, open escrow.
   *
   * The browser is never trusted here. The amount the client claims to have paid
   * is not read at all: the provider is asked what happened, and the captured
   * amount is compared against the gross frozen on the ledger row at creation.
   * A mismatch is a hard failure, because it means the ledger and the provider
   * disagree about what this payment is.
   */
  static async confirmPayment(paymentId: string, userId: string): Promise<Payment> {
    const payment = await this.getPayment(paymentId, userId);

    if (payment.status === 'held_in_escrow') return payment;
    if (payment.status !== 'pending') {
      throw new ConflictError(`A payment that is "${payment.status}" cannot be confirmed.`);
    }
    if (!payment.razorpay_payment_id) {
      throw new ConflictError('This payment has not been completed by the buyer yet.');
    }

    const providerPayment = await this.provider().fetchPayment(payment.razorpay_payment_id);

    if (providerPayment.status === 'failed') {
      return this.markFailed(payment, {
        reason: providerPayment.errorDescription || 'The payment was declined.',
        provider_event_id: null,
      });
    }

    if (providerPayment.status === 'created' || providerPayment.status === 'authorized') {
      throw new ConflictError('The payment has not been captured yet.');
    }

    // Amount reconciliation. This is the check that makes "never trust the
    // browser" true rather than aspirational. It delegates to the same validator
    // the webhook path uses, so the two can never drift apart.
    this.assertCapturedAmount(payment, providerPayment.amountCapturedCents, 'confirm');

    return this.openEscrow(payment, providerPayment);
  }

  /**
   * The single authority for captured-amount reconciliation, used by both the
   * synchronous confirm path and the webhook path.
   *
   * Fails CLOSED. An amount that is absent, non-numeric, NaN, infinite, zero,
   * negative or unequal to the recorded gross is always an error; none of them
   * may open escrow. Previously the webhook path guarded with
   * `Number.isFinite(captured) && captured !== gross`, which meant a payload
   * missing both amount fields produced `NaN`, short-circuited the condition,
   * and let escrow open with no verification at all.
   */
  private static assertCapturedAmount(
    payment: Pick<Payment, 'id' | 'gross_amount_cents'>,
    captured: number,
    source: string
  ): number {
    if (!Number.isFinite(captured)) {
      throw new AppError(
        'The payment provider did not report a usable captured amount, so escrow cannot be opened.',
        409,
        'AMOUNT_UNVERIFIABLE',
        { payment_id: payment.id, source, reported: String(captured) }
      );
    }
    if (captured <= 0) {
      throw new AppError(
        'The payment provider reported a non-positive captured amount, so escrow cannot be opened.',
        409,
        'AMOUNT_UNVERIFIABLE',
        { payment_id: payment.id, source, reported_cents: captured }
      );
    }
    if (captured !== payment.gross_amount_cents) {
      throw new AppError(
        'The captured amount does not match the amount recorded for this payment. Manual review is required.',
        409,
        'AMOUNT_MISMATCH',
        {
          payment_id: payment.id,
          source,
          recorded_gross_cents: payment.gross_amount_cents,
          provider_captured_cents: captured,
        }
      );
    }
    return captured;
  }

  /**
   * Create the held Route transfer and mark the payment as escrowed.
   *
   * `payouts.payment_id` is UNIQUE, so a second attempt for the same payment
   * cannot create a second transfer. The insert is therefore the idempotency
   * gate, checked before the provider is called.
   */
  private static async openEscrow(
    payment: Payment,
    providerPayment: ProviderPayment,
    providerEventId: string | null = null
  ): Promise<Payment> {
    const db = createAdminClient();

    const { data: existingPayout } = await db
      .from('payouts')
      .select('*')
      .eq('payment_id', payment.id)
      .maybeSingle();
    if (existingPayout) {
      // Escrow already established; only the payment status may need syncing.
      return this.transitionPayment(payment, 'held_in_escrow', {
        provider_event_id: providerEventId,
        metadata: { transfer_id: existingPayout.razorpay_transfer_id },
      });
    }

    const { data: consultant } = await db
      .from('consultant_profiles')
      .select('razorpay_account_id')
      .eq('id', payment.recipient_consultant_id)
      .single();
    const destination = consultant?.razorpay_account_id;
    if (!destination) {
      throw new ConflictError(
        'The consultant has no payout account, so escrow cannot be established.'
      );
    }

    // M-7 defense in depth: never ask the provider for a 0-value transfer. The
    // database also rejects such a payout, but by then the transfer would
    // already exist at Razorpay.
    if (payment.net_amount_cents <= 0) {
      throw new ConflictError('Refusing to create a zero-value escrow transfer.');
    }

    const transfer = await this.provider().createTransfer({
      sourcePaymentId: payment.razorpay_payment_id!,
      destinationAccountId: destination,
      // The consultant's share. The platform fee is never transferred, which is
      // how the "single fee withheld from gross" model is realised at the rail.
      amountCents: payment.net_amount_cents,
      currency: payment.currency,
      notes: { payment_id: payment.id, milestone_id: payment.milestone_id ?? '' },
      // Escrow: hold the settlement indefinitely until the client releases.
      onHold: true,
    });

    const now = new Date().toISOString();

    const { error: payoutError } = await db.from('payouts').insert({
      consultant_id: payment.recipient_consultant_id,
      payment_id: payment.id,
      amount_cents: payment.net_amount_cents,
      currency: payment.currency,
      razorpay_transfer_id: transfer.id,
      status: 'pending',
    });
    if (payoutError) {
      // The transfer exists at the provider but the local row did not land.
      // Surfacing this loudly is deliberate: a human must reconcile, and the
      // money is still held so nothing is lost.
      throw new AppError(
        'Escrow was created at the provider but could not be recorded locally. Manual reconciliation is required.',
        500,
        'PAYOUT_INSERT_ERROR',
        { transfer_id: transfer.id, cause: payoutError }
      );
    }

    const { data: milestone } = payment.milestone_id
      ? await db.from('milestones').select('status').eq('id', payment.milestone_id).single()
      : { data: null };

    // Drive the Stage 9 milestone into `funded` now that funds are provably
    // escrowed. Only from `pending`, so a concurrent dispute cannot be clobbered.
    if (milestone && milestone.status === 'pending') {
      await db
        .from('milestones')
        .update({ status: 'funded', updated_at: now })
        .eq('id', payment.milestone_id)
        .eq('status', 'pending');
    }

    const next = await this.transitionPayment(payment, 'held_in_escrow', {
      provider_event_id: providerEventId,
      metadata: {
        transfer_id: transfer.id,
        settlement_status: transfer.settlementStatus,
        provider_fee_cents: providerPayment.feeCents,
      },
      extraColumns: { escrow_funded_at: now, razorpay_payment_id: payment.razorpay_payment_id },
    });

    await this.notify(
      payment.recipient_consultant_id,
      'payment_escrowed',
      next,
      formatMinorUnits(next.gross_amount_cents, next.currency),
      await this.milestoneTitleFor(next.milestone_id)
    );

    return next;
  }

  // -------------------------------------------------------------------------
  // Release
  // -------------------------------------------------------------------------

  /**
   * Release escrowed funds to the consultant.
   *
   * Client-only, and gated on the milestone being `approved`. Releasing before
   * approval would let a client pay out work that was never accepted, so the
   * check is not optional.
   */
  static async releaseToConsultant(
    paymentId: string,
    userId: string,
    note?: string
  ): Promise<Payment> {
    const db = createAdminClient();
    const payment = await this.getPayment(paymentId, userId);

    const actor = await this.participantForPayment(payment, userId);
    // `released` is a client-lane transition: only the paying client may move
    // escrowed money out of hold, and never the consultant who receives it.
    if (getPaymentTransitionActor(payment.status, 'released') !== 'client' || !actor.isClient) {
      throw new ForbiddenError('Only the client can release escrowed funds.');
    }
    if (!isValidPaymentTransition(payment.status, 'released')) {
      throw new ConflictError(`A payment that is "${payment.status}" cannot be released.`);
    }

    if (payment.milestone_id) {
      const { data: milestone } = await db
        .from('milestones')
        .select('status, title')
        .eq('id', payment.milestone_id)
        .single();
      if (!milestone) throw new NotFoundError('Milestone');
      if (milestone.status !== 'approved') {
        throw new ConflictError(
          'Funds can only be released once the milestone has been approved.'
        );
      }
    }

    const { data: payout } = await db
      .from('payouts')
      .select('*')
      .eq('payment_id', payment.id)
      .single();
    if (!payout?.razorpay_transfer_id) {
      throw new ConflictError('No escrow transfer exists for this payment.');
    }

    const transfer: ProviderTransfer = await this.provider().releaseTransfer(
      payout.razorpay_transfer_id
    );

    await this.transitionPayout(payout as Payout, 'processing', {
      provider_event_id: null,
      metadata: { settlement_status: transfer.settlementStatus, note: note ?? null },
    });

    const now = new Date().toISOString();
    const next = await this.transitionPayment(payment, 'released', {
      metadata: { transfer_id: transfer.id, settlement_status: transfer.settlementStatus },
      extraColumns: { escrow_released_at: now },
    });

    await this.notify(
      payment.recipient_consultant_id,
      'payment_released',
      next,
      formatMinorUnits(next.net_amount_cents, next.currency),
      await this.milestoneTitleFor(next.milestone_id)
    );

    return next;
  }

  // -------------------------------------------------------------------------
  // Refund
  // -------------------------------------------------------------------------

  /**
   * Refund a captured payment.
   *
   * Authorization: refunds are an administrative action, never a contract
   * participant self-service operation. The caller must hold the `admin` role,
   * read from their own `public.users` row (see `getCallerRole`). Neither the
   * paying client nor the paid consultant may invoke this, and participation in
   * the contract confers no refund rights.
   *
   * The role is resolved BEFORE the payment is loaded. Checking it first means a
   * non-administrator receives an identical 403 whether or not the payment id
   * exists, so this endpoint cannot be used to probe which payment ids are real.
   *
   * When escrow was already released, the transfer is reversed in the same call,
   * otherwise the consultant would keep money the client was refunded for.
   */
  static async refundPayment(
    paymentId: string,
    userId: string,
    input: { amount_cents?: number; reason: string; speed: 'normal' | 'optimum' }
  ): Promise<{ payment: Payment; refund: PaymentRefund }> {
    const db = createAdminClient();

    // 1. Role gate, before any existence disclosure.
    const callerRole = await this.getCallerRole(userId);
    if (getRefundAuthorizer(callerRole) === null) {
      throw new ForbiddenError(REFUND_FORBIDDEN_MESSAGE);
    }

    // 2. Load without the participant check: an administrator acting on behalf
    //    of the platform is not necessarily a party to the contract.
    const payment = await this.getRaw(paymentId);

    // 3. State machine: a refund is only reachable from a captured state, and
    //    `refunded` is terminal so it refuses re-entry. `getPaymentTransitionActor`
    //    classifies `refunded` as a `system` lane, i.e. a privileged transition
    //    that no participant drives; the admin gate above is what enforces it.
    if (!canRefundPayment(payment.status)) {
      throw new ConflictError(`A payment that is "${payment.status}" cannot be refunded.`);
    }
    if (!payment.razorpay_payment_id) {
      throw new ConflictError('This payment was never captured, so there is nothing to refund.');
    }

    // The refundable ceiling is the captured amount, not the requested amount.
    // Razorpay funds refunds from the merchant balance and rejects an amount
    // above what was captured, so validate before spending a round trip.
    const gross = payment.gross_amount_cents;
    if (input.amount_cents !== undefined) {
      if (!Number.isInteger(input.amount_cents) || input.amount_cents <= 0) {
        throw new ValidationError('The refund amount must be a positive whole number of paise.');
      }
      if (input.amount_cents > gross) {
        throw new ValidationError('The refund amount cannot exceed the captured amount.');
      }
    }

    const { data: payout } = await db
      .from('payouts')
      .select('*')
      .eq('payment_id', payment.id)
      .maybeSingle();

    const wasReleased = payment.status === 'released';

    const providerRefund = await this.provider().refundPayment({
      paymentId: payment.razorpay_payment_id,
      ...(input.amount_cents !== undefined ? { amountCents: input.amount_cents } : {}),
      speed: input.speed,
      notes: { payment_id: payment.id, reason: input.reason.slice(0, 200) },
      reverseTransfers: wasReleased,
    });

    const { data: refundRow, error: refundError } = await db
      .from('payment_refunds')
      .insert({
        payment_id: payment.id,
        provider: this.provider().name,
        provider_refund_id: providerRefund.id,
        amount_cents: providerRefund.amountCents,
        currency: providerRefund.currency,
        status: providerRefund.status,
        speed: input.speed,
        reason: input.reason,
        initiated_by_user_id: userId,
      })
      .select('*')
      .single();
    if (refundError || !refundRow) {
      throw new AppError(
        'The refund was issued by the provider but could not be recorded locally.',
        500,
        'REFUND_INSERT_ERROR',
        { refund_id: providerRefund.id, cause: refundError }
      );
    }

    // A reversal happened; record it against the payout so reconciliation can
    // see that the consultant's transfer was clawed back.
    if (wasReleased && payout?.razorpay_transfer_id) {
      await db
        .from('payment_refunds')
        .update({ transfer_reversal_id: `reverse_all:${payout.razorpay_transfer_id}` })
        .eq('id', refundRow.id);
      await this.transitionPayout(payout as Payout, 'failed', {
        metadata: { reason: 'refund reversed the transfer', refund_id: providerRefund.id },
      });
    }

    const refundedAt =
      providerRefund.status === 'processed' ? new Date().toISOString() : null;

    const next = await this.transitionPayment(payment, 'refunded', {
      metadata: { refund_id: providerRefund.id, amount_cents: providerRefund.amountCents },
      extraColumns: {
        refunded_at: refundedAt,
        razorpay_refund_id: providerRefund.id,
      },
    });

    return { payment: next, refund: refundRow as PaymentRefund };
  }

  // -------------------------------------------------------------------------
  // Failure
  // -------------------------------------------------------------------------

  private static async markFailed(
    payment: Payment,
    opts: { reason: string; provider_event_id: string | null }
  ): Promise<Payment> {
    const { data: pendingPayout } = await createAdminClient()
      .from('payouts')
      .select('*')
      .eq('payment_id', payment.id)
      .maybeSingle();
    if (pendingPayout) {
      await this.transitionPayout(pendingPayout as Payout, 'failed', {
        provider_event_id: opts.provider_event_id,
        metadata: { reason: opts.reason },
      });
    }
    const failed = await this.transitionPayment(payment, 'failed', {
      provider_event_id: opts.provider_event_id,
      metadata: { reason: opts.reason },
    });

    // Tell the payer. Deduped on the payment id, so a redelivered payment.failed
    // webhook does not mail them repeatedly. Fire-and-forget by design: the
    // payment has already failed, and a notification problem must not change that
    // outcome.
    await this.notifyPaymentFailed(failed, opts.reason);

    return failed;
  }

  /** Milestone title for notification copy, or null for a contract-level payment. */
  private static async milestoneTitleFor(
    milestoneId: string | null
  ): Promise<string | null> {
    if (!milestoneId) return null;
    const { data } = await createAdminClient()
      .from('milestones')
      .select('title')
      .eq('id', milestoneId)
      .maybeSingle();
    return (data?.title as string) ?? null;
  }

  // -------------------------------------------------------------------------
  // Connected accounts (consultant payout onboarding)
  // -------------------------------------------------------------------------

  static async createLinkedAccount(
    userId: string,
    input: CreateConnectedAccountInput
  ): Promise<string> {
    const db = createAdminClient();
    const { data: consultant } = await db
      .from('consultant_profiles')
      .select('id, razorpay_account_id')
      .eq('user_id', userId)
      .single();
    if (!consultant) throw new NotFoundError('Consultant profile');

    if (consultant.razorpay_account_id) {
      // Idempotent: onboarding is re-runnable without orphaning an account.
      return consultant.razorpay_account_id;
    }

    const account = await this.provider().createConnectedAccount(input);
    const { data, error } = await db
      .from('consultant_profiles')
      .update({ razorpay_account_id: account.id })
      .eq('id', consultant.id)
      .is('razorpay_account_id', null)
      .select('razorpay_account_id')
      .maybeSingle();
    if (error) {
      throw new AppError('The linked account was created but could not be stored.', 500, 'LINKED_ACCOUNT_STORE_ERROR', error);
    }
    return (data?.razorpay_account_id as string) ?? account.id;
  }

  static async getConnectStatus(userId: string) {
    const db = createAdminClient();
    const { data: consultant } = await db
      .from('consultant_profiles')
      .select('id, razorpay_account_id, payouts_enabled')
      .eq('user_id', userId)
      .single();
    if (!consultant) throw new NotFoundError('Consultant profile');

    if (!consultant.razorpay_account_id) {
      return {
        onboarded: false,
        account_id: null,
        status: null,
        payouts_enabled: false,
        details_submitted: false,
      };
    }

    const account = await this.provider().fetchConnectedAccount(consultant.razorpay_account_id);

    // Razorpay is the authority on whether payouts are enabled, so mirror its
    // answer locally. The escrow path reads this flag before funding.
    if (account.payoutsEnabled !== consultant.payouts_enabled) {
      await db
        .from('consultant_profiles')
        .update({ payouts_enabled: account.payoutsEnabled })
        .eq('id', consultant.id);
    }

    return {
      onboarded: true,
      account_id: account.id,
      status: account.status,
      payouts_enabled: account.payoutsEnabled,
      details_submitted: account.detailsSubmitted,
    };
  }

  // -------------------------------------------------------------------------
  // Transitions
  // -------------------------------------------------------------------------

  /**
   * Move a payment to `next` if the state machine allows it, writing the audit
   * row in the same pass. Re-applying a status the payment already holds is a
   * no-op rather than an error, because webhooks are redelivered by design.
   */
  private static async transitionPayment(
    payment: Payment,
    next: PaymentStatus,
    opts: {
      provider_event_id?: string | null;
      trigger_source?: 'service' | 'webhook' | 'reconciliation';
      actor_user_id?: string;
      metadata?: Record<string, unknown>;
      extraColumns?: Record<string, unknown>;
    } = {}
  ): Promise<Payment> {
    if (payment.status === next) return payment;
    if (!isValidPaymentTransition(payment.status, next)) {
      throw new ConflictError(
        `Invalid payment transition: ${payment.status} -> ${next}.`
      );
    }

    const db = createAdminClient();
    const { data, error } = await db
      .from('payments')
      .update({
        status: next,
        updated_at: new Date().toISOString(),
        ...(opts.extraColumns || {}),
      })
      .eq('id', payment.id)
      .eq('status', payment.status)
      .select('*')
      .single();

    // A concurrent writer already moved the row. Re-read rather than clobber.
    if (error || !data) {
      const { data: current } = await db.from('payments').select('*').eq('id', payment.id).single();
      if (!current) throw new NotFoundError('Payment');
      return current as Payment;
    }

    await this.recordHistory(payment.id, payment.status, next, {
      trigger_source: opts.trigger_source || 'service',
      provider_event_id: opts.provider_event_id ?? null,
      actor_user_id: opts.actor_user_id ?? null,
      metadata: opts.metadata || {},
    });

    return data as Payment;
  }

  private static async transitionPayout(
    payout: Payout,
    next: PayoutStatus,
    opts: {
      provider_event_id?: string | null;
      trigger_source?: 'service' | 'webhook' | 'reconciliation';
      metadata?: Record<string, unknown>;
    } = {}
  ): Promise<Payout> {
    if (payout.status === next) return payout;
    if (!isValidPayoutTransition(payout.status, next)) {
      throw new ConflictError(`Invalid payout transition: ${payout.status} -> ${next}.`);
    }

    const now = new Date().toISOString();
    const db = createAdminClient();
    const { data, error } = await db
      .from('payouts')
      .update({
        status: next,
        processed_at: next === 'completed' ? now : payout.processed_at,
        updated_at: now,
      })
      .eq('id', payout.id)
      .eq('status', payout.status)
      .select('*')
      .single();

    if (error || !data) {
      const { data: current } = await db.from('payouts').select('*').eq('id', payout.id).single();
      if (!current) throw new NotFoundError('Payout');
      return current as Payout;
    }

    console.info(
      `[payments] payout ${payout.id} ${payout.status} -> ${next}`,
      opts.metadata || {}
    );
    return data as Payout;
  }

  private static async recordHistory(
    paymentId: string,
    from: string | null,
    to: string,
    opts: {
      trigger_source: 'service' | 'webhook' | 'reconciliation';
      provider_event_id?: string | null;
      actor_user_id?: string | null;
      metadata?: Record<string, unknown>;
    }
  ): Promise<PaymentStatusHistory | null> {
    const { data } = await createAdminClient()
      .from('payment_status_history')
      .insert({
        payment_id: paymentId,
        from_status: from,
        to_status: to,
        trigger_source: opts.trigger_source,
        provider_event_id: opts.provider_event_id ?? null,
        actor_user_id: opts.actor_user_id ?? null,
        metadata: opts.metadata || {},
      })
      .select('*')
      .single();
    return (data as PaymentStatusHistory) ?? null;
  }

  /**
   * Notify the consultant about a money movement on their payment.
   *
   * Routed through NotificationService so the notification is deduplicated on the
   * payment id, honours the recipient's channel preferences, and is recorded in
   * the delivery ledger. A direct insert would bypass all three, and a webhook
   * redelivery would mail the consultant twice.
   */
  private static async notify(
    consultantProfileId: string,
    type: 'payment_escrowed' | 'payment_released',
    payment: Payment,
    amountFormatted: string,
    milestoneTitle?: string | null
  ): Promise<void> {
    try {
      const { data: consultant } = await createAdminClient()
        .from('consultant_profiles')
        .select('user_id')
        .eq('id', consultantProfileId)
        .single();
      if (!consultant?.user_id) return;

      const emit = NotificationService.emitEvent;
      const input = {
        recipientUserId: consultant.user_id,
        paymentId: payment.id,
        amountFormatted,
        milestoneTitle: milestoneTitle ?? null,
      };

      if (type === 'payment_escrowed') {
        await paymentEscrowed(emit, input);
      } else {
        await paymentReleased(emit, input);
      }
    } catch (error) {
      // A notification failure must never roll back a financial transition. The
      // money has already moved; losing the email is recoverable, unwinding the
      // escrow is not.
      console.error('[payments] failed to write notification:', error);
    }
  }

  /**
   * Tell the payer their payment failed.
   *
   * The payer is the only party who can act on it, so unlike the escrow and
   * release notices this is addressed to the client rather than the consultant.
   * `payment_failed` is one of the four event types Stage 1's enum could not
   * express, so Stage 12 added it.
   */
  private static async notifyPaymentFailed(
    payment: Payment,
    reason?: string | null
  ): Promise<void> {
    try {
      const { data: client } = await createAdminClient()
        .from('client_profiles')
        .select('user_id')
        .eq('id', payment.payer_client_id)
        .single();
      if (!client?.user_id) return;

      await paymentFailed(NotificationService.emitEvent, {
        recipientUserId: client.user_id,
        paymentId: payment.id,
        amountFormatted: formatMinorUnits(payment.gross_amount_cents, payment.currency),
        reason: reason ?? null,
      });
    } catch (error) {
      console.error('[payments] failed to write payment-failed notification:', error);
    }
  }

  // -------------------------------------------------------------------------
  // Webhook processing
  // -------------------------------------------------------------------------

  /**
   * Entry point for a verified provider webhook.
   *
   * Idempotency: the event id is inserted into `payment_webhook_events` under a
   * unique (provider, provider_event_id) index before anything is applied. The
   * insert that wins the index is the only one that proceeds, so a redelivery
   * after a crash, a duplicate, or an out-of-order replay all collapse to a
   * no-op. Razorpay retries a non-2xx for 24 hours on an exponential backoff
   * and then disables the endpoint, so this must never throw for an event that
   * was already handled.
   *
   * A previously *failed* event is deliberately re-entered rather than skipped.
   * If a crash landed between "apply" and "acknowledge", or the first attempt hit
   * a transient fault, the retry is the only chance to finish the work. Skipping
   * on the basis of "seen before" would strand the payment in escrow forever.
   * Every state transition is separately idempotent, so re-entry is safe.
   *
   * @returns whether the event was a duplicate, and the payment it affected.
   */
  static async handleWebhook(params: {
    eventId: string;
    eventType: string;
    payload: Record<string, unknown>;
  }): Promise<{ duplicate: boolean; payment_id: string | null }> {
    const db = createAdminClient();
    const provider = this.provider().name;
    const { eventId, eventType, payload } = params;

    const { data: claimed, error: claimError } = await db
      .from('payment_webhook_events')
      .insert({
        provider,
        provider_event_id: eventId,
        event_type: eventType,
        processing_status: 'received',
        payload,
      })
      .select('*')
      .single();

    let row = claimed;
    let isRetry = false;

    if (claimError || !claimed) {
      // The unique index rejected it. Re-read to decide between "already done"
      // and "previous attempt failed, so retry".
      const { data: existing } = await db
        .from('payment_webhook_events')
        .select('*')
        .eq('provider', provider)
        .eq('provider_event_id', eventId)
        .maybeSingle();

      if (!existing) {
        // The claim insert failed for a reason other than the unique
        // constraint, so this is an infrastructure fault rather than a
        // duplicate. Rethrow so the route answers non-2xx and Razorpay retries.
        // Reporting "duplicate" here would answer 200 and silently discard a
        // genuine event, stranding the payment.
        throw new AppError(
          'Could not record the webhook event for idempotency.',
          500,
          'WEBHOOK_CLAIM_FAILED',
          { event_id: eventId, cause: claimError }
        );
      }
      if (existing.processing_status === 'processed' || existing.processing_status === 'ignored') {
        return { duplicate: true, payment_id: existing.payment_id ?? null };
      }

      isRetry = true;
      row = existing;
      const { data: reclaimed } = await db
        .from('payment_webhook_events')
        .update({
          processing_status: 'received',
          attempt_count: (existing.attempt_count ?? 1) + 1,
          last_error: null,
          payload,
        })
        .eq('id', existing.id)
        .eq('processing_status', existing.processing_status)
        .select('*')
        .maybeSingle();

      // Another concurrent retry won the reclaim; let it do the work.
      if (!reclaimed) return { duplicate: true, payment_id: existing.payment_id ?? null };
      row = reclaimed;
    }

    try {
      const paymentId = await this.applyWebhookEvent(eventType, payload, eventId);
      await db
        .from('payment_webhook_events')
        .update({
          processing_status: paymentId ? 'processed' : 'ignored',
          payment_id: paymentId,
          processed_at: new Date().toISOString(),
          last_error: null,
        })
        .eq('id', row.id);
      return { duplicate: isRetry, payment_id: paymentId };
    } catch (error) {
      await db
        .from('payment_webhook_events')
        .update({
          processing_status: 'failed',
          last_error: (error as Error)?.message?.slice(0, 500) ?? 'Unknown error',
        })
        .eq('id', row.id);
      // Rethrow so the route can answer non-2xx and let Razorpay retry on its
      // exponential backoff. The event is marked failed, so the retry re-enters.
      throw error;
    }
  }

  /**
   * Apply one event. Returns the payment id it affected, or null when the event
   * is not actionable for this integration.
   */
  private static async applyWebhookEvent(
    eventType: string,
    payload: Record<string, unknown>,
    eventId: string
  ): Promise<string | null> {
    const db = createAdminClient();

    switch (eventType) {
      case 'payment.captured': {
        const providerPayment = this.extractPayment(payload);
        if (!providerPayment?.id) return null;
        const payment = await this.findByProviderPayment(providerPayment.id);
        if (!payment) return null;

        // The same fail-closed validator as the synchronous confirm path. An
        // absent, unparseable, NaN, non-finite, non-positive or mismatched amount
        // throws here instead of quietly opening escrow. The previous guard,
        // `Number.isFinite(captured) && captured !== gross`, short-circuited to
        // "no error" when the payload carried no amount at all.
        const normalised = this.toProviderPayment(providerPayment);
        this.assertCapturedAmount(
          payment,
          normalised.amountCapturedCents,
          'webhook:payment.captured'
        );
        await this.openEscrow(payment, normalised, eventId);
        return payment.id;
      }

      case 'payment.failed': {
        const providerPayment = this.extractPayment(payload);
        if (!providerPayment?.id) return null;
        const payment = await this.findByProviderPayment(providerPayment.id);
        if (!payment) return null;
        if (payment.status === 'failed') return payment.id;
        await this.markFailed(payment, {
          reason: providerPayment.error_description || 'The payment failed.',
          provider_event_id: eventId,
        });
        return payment.id;
      }

      case 'order.paid': {
        // Carries both order and payment. Prefer the payment, which is what the
        // escrow path is keyed on.
        const providerPayment = this.extractPayment(payload);
        if (!providerPayment?.id) return null;
        const payment = await this.findByProviderPayment(providerPayment.id);
        if (!payment) return null;
        if (payment.status !== 'pending') return payment.id;

        // `order.paid` can arrive before the payment is actually captured. When
        // the captured amount is not yet a usable positive figure the correct
        // action is to ignore the event, not to fail: `payment.captured` follows
        // and carries the authoritative amount. Throwing here would burn
        // Razorpay's retry budget on an event that is legitimately not
        // actionable yet. A usable amount is still reconciled fail-closed below.
        const normalised = this.toProviderPayment(providerPayment);
        if (
          !Number.isFinite(normalised.amountCapturedCents) ||
          normalised.amountCapturedCents <= 0
        ) {
          return null;
        }
        this.assertCapturedAmount(
          payment,
          normalised.amountCapturedCents,
          'webhook:order.paid'
        );
        await this.openEscrow(payment, normalised, eventId);
        return payment.id;
      }

      case 'transfer.processed':
      case 'transfer.failed': {
        const transfer = this.extractTransfer(payload);
        if (!transfer?.id) return null;
        const { data: payout } = await db
          .from('payouts')
          .select('*')
          .eq('razorpay_transfer_id', transfer.id)
          .maybeSingle();
        if (!payout) return null;

        if (eventType === 'transfer.failed') {
          await this.transitionPayout(payout as Payout, 'failed', {
            provider_event_id: eventId,
            trigger_source: 'webhook',
            metadata: { reason: transfer.error?.description ?? 'Transfer failed' },
          });
        } else if (transfer.settlement_status === 'settled') {
          await this.transitionPayout(payout as Payout, 'completed', {
            provider_event_id: eventId,
            trigger_source: 'webhook',
            metadata: { recipient_settlement_id: transfer.recipient_settlement_id },
          });
          if (transfer.recipient_settlement_id) {
            await db
              .from('payouts')
              .update({ razorpay_settlement_id: transfer.recipient_settlement_id })
              .eq('id', payout.id);
          }
        }
        return payout.payment_id;
      }

      case 'settlement.processed': {
        // Razorpay fires no per-transfer event when a hold expires, so a settled
        // settlement is reconciled back to whichever transfers it covered.
        const settlement = this.extractSettlement(payload);
        if (!settlement?.id) return null;
        const { data: transfers } = await db
          .from('payouts')
          .select('*')
          .eq('razorpay_settlement_id', settlement.id);
        if (!transfers?.length) return null;
        for (const payout of transfers) {
          await this.transitionPayout(payout as Payout, 'completed', {
            provider_event_id: eventId,
            trigger_source: 'webhook',
          });
        }
        return transfers[0]?.payment_id ?? null;
      }

      case 'refund.processed':
      case 'refund.failed':
      case 'refund.created': {
        const refund = this.extractRefund(payload);
        if (!refund?.id) return null;

        const status =
          eventType === 'refund.failed'
            ? 'failed'
            : eventType === 'refund.processed'
              ? 'processed'
              : 'pending';
        const { error } = await db
          .from('payment_refunds')
          .update({
            status,
            processed_at: status === 'processed' ? new Date().toISOString() : null,
          })
          .eq('provider_refund_id', refund.id);
        if (error) return null;

        if (status === 'processed' && refund.payment_id) {
          const { data: payment } = await db
            .from('payments')
            .select('*')
            .eq('id', refund.payment_id)
            .maybeSingle();
          if (payment && payment.status !== 'refunded' && payment.status !== 'failed') {
            await this.transitionPayment(payment as Payment, 'refunded', {
              provider_event_id: eventId,
              trigger_source: 'webhook',
              metadata: { refund_id: refund.id },
              extraColumns: {
                refunded_at: new Date().toISOString(),
                razorpay_refund_id: refund.id,
              },
            });
          }
        }
        return refund.payment_id ?? null;
      }

      case 'product.route.activated':
      case 'product.route.under_review':
      case 'product.route.needs_clarification': {
        // Route product status for the platform account itself; recorded but not
        // mapped to a payment.
        return null;
      }

      default:
        // Unknown events are recorded and ignored rather than retried forever.
        return null;
    }
  }

  // -------------------------------------------------------------------------
  // Payload helpers
  // -------------------------------------------------------------------------

  /**
   * Razorpay envelopes put the object under `payload.<entity>`, and the
   * `contains` array names the key actually used. Both are checked because
   * `order.paid` carries a payment and an order under different keys.
   */
  private static extractEntity<T>(
    payload: Record<string, unknown>,
    entity: string
  ): T | undefined {
    const inner = payload?.payload as Record<string, unknown> | undefined;
    if (!inner) return undefined;
    const contains = (payload.contains as string[] | undefined) ?? [entity];
    for (const key of contains) {
      const candidate = inner[key];
      if (candidate && typeof candidate === 'object') return candidate as T;
    }
    const fallback = inner[entity];
    return fallback && typeof fallback === 'object' ? (fallback as T) : undefined;
  }

  private static extractPayment(
    payload: Record<string, unknown>
  ): WebhookPaymentEntity | undefined {
    return this.extractEntity<WebhookPaymentEntity>(payload, 'payment');
  }

  private static extractTransfer(
    payload: Record<string, unknown>
  ): WebhookTransferEntity | undefined {
    return this.extractEntity<WebhookTransferEntity>(payload, 'transfer');
  }

  private static extractRefund(
    payload: Record<string, unknown>
  ): WebhookRefundEntity | undefined {
    return this.extractEntity<WebhookRefundEntity>(payload, 'refund');
  }

  private static extractSettlement(
    payload: Record<string, unknown>
  ): WebhookSettlementEntity | undefined {
    return this.extractEntity<WebhookSettlementEntity>(payload, 'settlement');
  }

  /**
   * Coerce a provider monetary field to a number without inventing a value.
   *
   * Returns NaN when the field is absent or unparseable, rather than 0, so the
   * caller can distinguish "the provider said zero" from "the provider said
   * nothing usable". Both are refused downstream; the distinction only makes the
   * resulting error honest.
   */
  private static toCents(value: number | string | null | undefined): number {
    if (value === null || value === undefined || value === '') return NaN;
    const n = typeof value === 'string' ? Number(value) : value;
    return typeof n === 'number' && Number.isFinite(n) ? n : NaN;
  }

  private static toProviderPayment(wire: WebhookPaymentEntity): ProviderPayment {
    return {
      id: String(wire.id),
      orderId: wire.order_id ?? null,
      amountCents: this.toCents(wire.amount),
      amountCapturedCents: this.toCents(wire.amount_captured ?? wire.amount),
      amountRefundedCents: this.toCents(wire.amount_refunded ?? null) || 0,
      currency: String(wire.currency ?? RAZORPAY_CURRENCY),
      status: (wire.status ?? 'captured') as ProviderPayment['status'],
      method: wire.method ?? null,
      feeCents: typeof wire.fee === 'number' ? wire.fee : null,
      taxCents: typeof wire.tax === 'number' ? wire.tax : null,
      errorCode: wire.error_code ?? null,
      errorDescription: wire.error_description ?? null,
      errorReason: wire.error_reason ?? null,
    };
  }

  private static async findByProviderPayment(
    providerPaymentId: string
  ): Promise<Payment | null> {
    const { data } = await createAdminClient()
      .from('payments')
      .select('*')
      .eq('razorpay_payment_id', providerPaymentId)
      .maybeSingle();
    return (data as Payment) ?? null;
  }

  /**
   * Bind a provider payment id to a ledger row after checkout completes.
   *
   * The provider payment id arrives from the browser, so it is verified against
   * Razorpay before it is trusted: the fetched payment must belong to the order
   * this ledger row created, and its amount must equal the recorded gross.
   */
  static async attachProviderPayment(
    paymentId: string,
    userId: string,
    providerPaymentId: string
  ): Promise<Payment> {
    const payment = await this.getPayment(paymentId, userId);
    if (payment.razorpay_payment_id) return payment;
    if (!payment.razorpay_order_id) {
      throw new ConflictError('This payment has no provider order to complete.');
    }

    const providerPayment = await this.provider().fetchPayment(providerPaymentId);

    if (providerPayment.orderId && providerPayment.orderId !== payment.razorpay_order_id) {
      throw new AppError(
        'The payment does not belong to this order.',
        409,
        'PROVIDER_PAYMENT_MISMATCH'
      );
    }
    if (providerPayment.amountCents !== payment.gross_amount_cents) {
      throw new AppError(
        'The payment amount does not match the amount recorded for this order.',
        409,
        'AMOUNT_MISMATCH',
        {
          recorded_gross_cents: payment.gross_amount_cents,
          provider_amount_cents: providerPayment.amountCents,
        }
      );
    }

    const { data, error } = await createAdminClient()
      .from('payments')
      .update({
        razorpay_payment_id: providerPayment.id,
        updated_at: new Date().toISOString(),
      })
      .eq('id', payment.id)
      .is('razorpay_payment_id', null)
      .select('*')
      .single();
    if (error || !data) {
      const { data: current } = await createAdminClient()
        .from('payments')
        .select('*')
        .eq('id', payment.id)
        .single();
      if (!current) throw new NotFoundError('Payment');
      return current as Payment;
    }
    return data as Payment;
  }
}
