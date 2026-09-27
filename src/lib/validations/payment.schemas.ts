/**
 * Payment & Payout Validation Schemas + state machines.
 *
 * Mirrors the `payment_status` and `payout_status` PostgreSQL enums created in
 * migration 00001. Every status change in the application is validated against
 * these tables before a write, so an out-of-order webhook cannot drive a payment
 * backwards through its lifecycle.
 *
 * Money is always an integer count of paise (INR minor units). Razorpay Route
 * settles only in INR, so no currency field is accepted from a caller anywhere
 * in this file.
 */

import { z } from 'zod';
import type { UserRole } from '@/types/database';

// ---------------------------------------------------------------------------
// Status enums (mirrors the DB enums)
// ---------------------------------------------------------------------------

export const paymentStatusEnum = z.enum([
  'pending',
  'held_in_escrow',
  'released',
  'refunded',
  'failed',
]);

export type PaymentStatus = z.infer<typeof paymentStatusEnum>;

export const payoutStatusEnum = z.enum([
  'pending',
  'processing',
  'completed',
  'failed',
]);

export type PayoutStatus = z.infer<typeof payoutStatusEnum>;

export const paymentRefundStatusEnum = z.enum([
  'pending',
  'processed',
  'failed',
]);

// ---------------------------------------------------------------------------
// Payment state machine
// ---------------------------------------------------------------------------
// pending         Order created, payment not yet captured, no escrow.
// held_in_escrow  Payment captured and a Route transfer exists with on_hold.
//                 Funds are in the platform balance and cannot reach the
//                 consultant until the hold is released.
// released        Hold released. The transfer is eligible to settle. This is
//                 NOT the same as money in the consultant's bank account: the
//                 linked account's own T+N settlement schedule still applies.
// refunded        A refund was issued against the captured payment.
// failed          The payment never completed capture.
//
// A payment is funded once. Because escrow is held on the transfer rather than
// on an uncaptured payment, a failed payment can never hold funds, so
// `held_in_escrow -> failed` exists only for a provider-side reversal of a
// held transfer and is not reachable through the normal release path.
export const PAYMENT_TRANSITIONS: Record<PaymentStatus, PaymentStatus[]> = {
  pending: ['held_in_escrow', 'failed'],
  held_in_escrow: ['released', 'refunded'],
  released: ['refunded'],
  refunded: [],
  failed: [],
};

/**
 * Who is allowed to drive a given payment transition, as a coarse lane.
 *
 * Note the lanes are deliberately not the same thing as "who may call the API".
 * `system` means the transition is a privileged/platform-driven action that is
 * never a participant self-service operation, and it is enforced separately by
 * the specific caller check at each call site rather than by this table.
 */
export function getPaymentTransitionActor(
  from: PaymentStatus,
  to: PaymentStatus
): 'client' | 'consultant' | 'system' {
  if (to === 'failed') return 'system';
  if (to === 'released') return 'client';
  if (to === 'held_in_escrow') return 'client';
  return 'system';
}

// ---------------------------------------------------------------------------
// Refund authorization
//
// A refund is a unilateral reversal of a disbursement, so it is NEVER a
// contract-participant action. Being the paying client or the paid consultant
// confers no refund rights; that is the whole point of the control. Refunds are
// reserved for a platform administrator acting out of band (for example after a
// dispute has been resolved out of this codebase).
//
// The role is read from the caller's row in `public.users`, which is derived
// server-side from the validated session. It is never read from a request body,
// query string or header, and a caller cannot widen their own lane.
// ---------------------------------------------------------------------------

/** The only role permitted to drive a refund. */
export const REFUND_AUTHORIZER_ROLE: UserRole = 'admin';

/** Message returned to any non-administrator attempting a refund. */
export const REFUND_FORBIDDEN_MESSAGE =
  'Refunds are an administrative action. Contract participants cannot initiate a disbursement reversal.';

/**
 * Resolve the refund authorizer from the caller's server-derived role.
 * Returns null for every non-administrator, including both participants.
 */
export function getRefundAuthorizer(callerRole: UserRole): 'admin' | null {
  return callerRole === REFUND_AUTHORIZER_ROLE ? 'admin' : null;
}

/**
 * Whether a payment in this status may be refunded at all. A refund is only
 * meaningful once money has actually been captured, so `pending` and `failed`
 * are refused; `refunded` is terminal and refuses re-entry.
 */
export function canRefundPayment(status: PaymentStatus): boolean {
  return isValidPaymentTransition(status, 'refunded');
}

export function isValidPaymentTransition(
  from: PaymentStatus,
  to: PaymentStatus
): boolean {
  return PAYMENT_TRANSITIONS[from]?.includes(to) ?? false;
}

// ---------------------------------------------------------------------------
// Payout state machine
// ---------------------------------------------------------------------------
// pending     Transfer created; settlement is on hold. Nothing can move.
// processing  Hold released. Transfer is eligible to settle under the linked
//             account's settlement schedule.
// completed   settlement.processed received; recipient_settlement_id recorded.
// failed      transfer.failed received, or a transfer reversal emptied the
//             transfer. Recoverable: a retried transfer re-enters processing.
//
// `pending -> completed` is legal because a linked account with a same-day
// schedule can settle before the release webhook round-trips.
export const PAYOUT_TRANSITIONS: Record<PayoutStatus, PayoutStatus[]> = {
  pending: ['processing', 'completed', 'failed'],
  processing: ['completed', 'failed'],
  completed: [],
  failed: ['processing', 'completed'],
};

export function isValidPayoutTransition(
  from: PayoutStatus,
  to: PayoutStatus
): boolean {
  return PAYOUT_TRANSITIONS[from]?.includes(to) ?? false;
}

// ---------------------------------------------------------------------------
// Money helpers
// ---------------------------------------------------------------------------

/** Integer paise. Rejects floats, negatives and zero at the boundary. */
export const amountCentsSchema = z
  .number()
  .int('Amounts must be whole paise')
  .positive('Amount must be greater than zero');

// ---------------------------------------------------------------------------
// Request schemas
// ---------------------------------------------------------------------------

/**
 * Create a payment for a milestone.
 *
 * There is deliberately NO amount, currency, fee or recipient field. The amount
 * comes from `milestones.amount_cents`, the fee from the server-side
 * `platform_fee_config` table, and the parties from the owning contract. A
 * client that posts an amount is not believed; the extra keys are stripped
 * before the service call and a body carrying them is treated as a tamper
 * attempt rather than silently ignored.
 */
export const paymentCreateSchema = z
  .object({
    milestone_id: z.string().uuid('Invalid milestone ID'),
  })
  .strict();

export type PaymentCreateFormData = z.infer<typeof paymentCreateSchema>;

/**
 * Keys a client is never allowed to send when creating a payment. Presence of
 * any of these means the caller is trying to dictate a financial field.
 */
export const FORBIDDEN_PAYMENT_INPUT_KEYS = [
  'amount',
  'amount_cents',
  'gross_amount_cents',
  'net_amount_cents',
  'platform_fee_cents',
  'platform_fee_client_cents',
  'platform_fee_consultant_cents',
  'currency',
  'payer_client_id',
  'recipient_consultant_id',
  'contract_id',
  'client_secret',
  'razorpay_payment_id',
  'razorpay_order_id',
] as const;

/**
 * Release escrowed funds to the consultant.
 *
 * Gated server-side on: the payment is `held_in_escrow`, the caller is the
 * contract's client, and the milestone is `approved`. The body carries no
 * amount either, for the same reason as paymentCreateSchema.
 */
export const paymentReleaseSchema = z
  .object({
    note: z.string().max(1000).optional(),
  })
  .strict();

export type PaymentReleaseFormData = z.infer<typeof paymentReleaseSchema>;

/**
 * Refund a captured payment.
 *
 * `amount_cents` is optional because omitting it means a full refund at
 * Razorpay. When present it is still validated against the authoritative
 * captured amount server-side, and partial refunds can be rejected by the
 * provider for some payment methods.
 */
export const paymentRefundSchema = z
  .object({
    amount_cents: amountCentsSchema.optional(),
    reason: z.string().min(3).max(500),
    speed: z.enum(['normal', 'optimum']).optional().default('normal'),
  })
  .strict();

export type PaymentRefundFormData = z.infer<typeof paymentRefundSchema>;

/**
 * Consultant payout onboarding (Route linked account).
 *
 * Razorpay requires a business type, a registered address and a contact name to
 * create a linked account. `business_type` and `category`/`subcategory` come
 * from Razorpay's own enumerated lists, so they are constrained to a known set
 * rather than left free-form.
 */
export const razorpayBusinessTypeEnum = z.enum([
  'individual',
  'partnership',
  'company',
  'society',
  'trust',
  'government',
  'llp',
  'huf',
  'partnership_firm',
  'proprietorship',
]);

export const connectOnboardingSchema = z
  .object({
    legal_business_name: z.string().min(4).max(200),
    business_type: razorpayBusinessTypeEnum,
    contact_name: z.string().min(4).max(255),
    phone: z.string().min(8).max(15),
    category: z.string().min(2).max(100),
    subcategory: z.string().min(2).max(100),
    address: z.object({
      street1: z.string().min(1).max(100),
      street2: z.string().max(100).optional().default(''),
      city: z.string().min(1).max(100),
      state: z.string().min(2).max(32),
      postal_code: z.string().regex(/^\d{6}$/, 'Indian PIN codes are 6 digits'),
      country: z.string().length(2).default('IN'),
    }),
    pan: z
      .string()
      .regex(/^[a-zA-Z]{5}\d{4}[a-zA-Z]$/, 'Invalid PAN format')
      .optional(),
    gst: z.string().max(15).optional(),
  })
  .strict();

export type ConnectOnboardingFormData = z.infer<typeof connectOnboardingSchema>;

/** Admin-managed fee configuration. Never accepted from a client session. */
export const platformFeeConfigSchema = z
  .object({
    scope: z.enum(['global', 'contract', 'milestone']),
    contract_id: z.string().uuid().optional(),
    milestone_id: z.string().uuid().optional(),
    basis_points: z.number().int().min(0).max(10000),
    fixed_cents: z.number().int().min(0).default(0),
    min_fee_cents: z.number().int().min(0).default(0),
    max_fee_cents: z.number().int().min(0).optional(),
  })
  .refine(
    (v) =>
      (v.scope === 'global' &&
        !v.contract_id &&
        !v.milestone_id) ||
      (v.scope === 'contract' && v.contract_id && !v.milestone_id) ||
      (v.scope === 'milestone' && !!v.milestone_id),
    { message: 'A fee scope requires exactly its matching target id.' }
  )
  .refine((v) => v.max_fee_cents === undefined || v.max_fee_cents >= v.min_fee_cents, {
    message: 'max_fee_cents must be greater than or equal to min_fee_cents',
    path: ['max_fee_cents'],
  });

export type PlatformFeeConfigFormData = z.infer<typeof platformFeeConfigSchema>;

// ---------------------------------------------------------------------------
// Filters
// ---------------------------------------------------------------------------

export const paymentFilterSchema = z.object({
  contract_id: z.string().uuid().optional(),
  milestone_id: z.string().uuid().optional(),
  status: z.array(paymentStatusEnum).optional(),
  sortBy: z.enum(['created_at', 'gross_amount_cents']).optional().default('created_at'),
  sortOrder: z.enum(['asc', 'desc']).optional().default('desc'),
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(100).default(20),
});

export type PaymentFilterFormData = z.infer<typeof paymentFilterSchema>;

export const payoutFilterSchema = z.object({
  consultant_id: z.string().uuid().optional(),
  status: z.array(payoutStatusEnum).optional(),
  sortBy: z.enum(['created_at', 'amount_cents']).optional().default('created_at'),
  sortOrder: z.enum(['asc', 'desc']).optional().default('desc'),
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(100).default(20),
});

export type PayoutFilterFormData = z.infer<typeof payoutFilterSchema>;
