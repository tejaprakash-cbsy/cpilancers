/**
 * Payment provider abstraction.
 *
 * The payment service depends only on this interface, expressed in marketplace
 * vocabulary. Provider-specific types never cross this boundary, which is what
 * lets the ledger, the state machines, the fee engine and the webhook handler be
 * written once and tested without a network call.
 *
 * Provider: Razorpay Route (India). See `razorpay.provider.ts`.
 *
 * Two properties are non-negotiable for any implementation:
 *
 *  1. Amounts crossing this boundary are integer paise, computed by the caller
 *     from database state. A provider adapter must never accept an amount from
 *     a request body or invent one.
 *  2. `verifyWebhookSignature` must be given the untouched raw request body.
 *     An adapter that re-serialises a parsed payload will fail verification and
 *     must not be written.
 */

// ---------------------------------------------------------------------------
// Normalised snapshots
// ---------------------------------------------------------------------------

/** Order status as the provider reports it. */
export type ProviderOrderStatus = 'created' | 'attempted' | 'paid';

export interface ProviderOrder {
  id: string;
  amountCents: number;
  amountPaidCents: number;
  amountDueCents: number;
  currency: string;
  status: ProviderOrderStatus;
  receipt: string | null;
}

/**
 * Provider payment status. Razorpay's exact set is:
 * created | authorized | captured | refunded | failed.
 * There is no `attempted`; that is an order status, and conflating the two is a
 * common source of "payment succeeded" bugs.
 */
export type ProviderPaymentStatus =
  | 'created'
  | 'authorized'
  | 'captured'
  | 'refunded'
  | 'failed';

export interface ProviderPayment {
  id: string;
  orderId: string | null;
  amountCents: number;
  amountCapturedCents: number;
  amountRefundedCents: number;
  currency: string;
  status: ProviderPaymentStatus;
  method: string | null;
  /** Razorpay `fee`, which already includes GST and must not be added to `tax`. */
  feeCents: number | null;
  taxCents: number | null;
  errorCode: string | null;
  errorDescription: string | null;
  errorReason: string | null;
}

/** Transfer status. */
export type ProviderTransferStatus =
  | 'created'
  | 'pending'
  | 'processed'
  | 'failed'
  | 'reversed'
  | 'partially_reversed';

/**
 * Settlement status of a transfer.
 *
 * `on_hold` is the escrow state. `pending` means the hold was released and the
 * transfer is queued under the linked account's own settlement schedule.
 * `settled` means Razorpay has initiated the bank credit, which can still take
 * up to three hours to appear.
 */
export type ProviderSettlementStatus = 'pending' | 'on_hold' | 'settled';

export interface ProviderTransfer {
  id: string;
  sourceId: string | null;
  destinationAccountId: string;
  amountCents: number;
  amountReversedCents: number;
  currency: string;
  status: ProviderTransferStatus;
  settlementStatus: ProviderSettlementStatus;
  onHold: boolean;
  onHoldUntil: number | null;
  recipientSettlementId: string | null;
  failureReason: string | null;
}

export type ProviderRefundStatus = 'pending' | 'processed' | 'failed';

export interface ProviderRefund {
  id: string;
  paymentId: string;
  amountCents: number;
  currency: string;
  status: ProviderRefundStatus;
  speedRequested: string | null;
  speedProcessed: string | null;
  failureReason: string | null;
}

export interface ProviderTransferReversal {
  id: string;
  transferId: string;
  amountCents: number;
  currency: string;
}

export interface ProviderConnectedAccount {
  id: string;
  /** `created` until Razorpay has approved the linked account's KYC. */
  status: string;
  detailsSubmitted: boolean;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
}

export interface CreateConnectedAccountInput {
  email: string;
  phone: string;
  legalBusinessName: string;
  customerFacingBusinessName?: string;
  businessType: string;
  contactName: string;
  category: string;
  subcategory: string;
  businessModel?: string;
  address: {
    street1: string;
    street2: string;
    city: string;
    state: string;
    postalCode: string;
    country: string;
  };
  /** Our consultant profile UUID, stored by Razorpay as the account reference. */
  referenceId: string;
  pan?: string;
  gst?: string;
}

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

export interface CreateOrderInput {
  amountCents: number;
  currency: string;
  /**
   * Razorpay treats `receipt` as an idempotency key (max 40 chars, must be
   * unique). Reusing it is rejected, which is what stops a double-submit from
   * creating two payable orders.
   */
  receipt: string;
  notes: Record<string, string>;
}

export interface CapturePaymentInput {
  paymentId: string;
  /** Must equal the authorised amount; the provider rejects anything else. */
  amountCents: number;
  currency: string;
}

export interface CreateTransferInput {
  sourcePaymentId: string;
  destinationAccountId: string;
  amountCents: number;
  currency: string;
  notes: Record<string, string>;
  /**
   * Hold the settlement, which is how escrow is implemented: the money is
   * captured into the platform balance but cannot reach the destination account
   * until `releaseTransfer` flips the hold off.
   */
  onHold: boolean;
  /** Unix seconds. Omit to hold indefinitely. */
  onHoldUntil?: number;
}

export interface RefundPaymentInput {
  paymentId: string;
  /** Omit for a full refund. Validated against the captured amount by the service. */
  amountCents?: number;
  speed: 'normal' | 'optimum';
  notes: Record<string, string>;
  /**
   * Also reverse any transfer made to a linked account. Required when escrow was
   * already released, otherwise the consultant keeps funds the client was
   * refunded for.
   */
  reverseTransfers: boolean;
}

export interface ReverseTransferInput {
  transferId: string;
  /** Omit to reverse the entire transfer. */
  amountCents?: number;
  notes: Record<string, string>;
}

// ---------------------------------------------------------------------------
// The interface
// ---------------------------------------------------------------------------

export interface PaymentProvider {
  readonly name: string;
  /** Currencies this provider can settle. Route is INR-only. */
  readonly supportedCurrencies: readonly string[];

  createOrder(input: CreateOrderInput): Promise<ProviderOrder>;
  fetchOrder(orderId: string): Promise<ProviderOrder>;

  capturePayment(input: CapturePaymentInput): Promise<ProviderPayment>;
  fetchPayment(paymentId: string): Promise<ProviderPayment>;

  /** Create the escrow transfer for a captured payment. */
  createTransfer(input: CreateTransferInput): Promise<ProviderTransfer>;
  fetchTransfer(transferId: string): Promise<ProviderTransfer>;
  /** Release a held transfer. Escrow payout. */
  releaseTransfer(transferId: string): Promise<ProviderTransfer>;
  /** Re-apply a hold to a transfer. Used when a dispute reopens escrow. */
  holdTransfer(transferId: string, onHoldUntil?: number): Promise<ProviderTransfer>;
  reverseTransfer(input: ReverseTransferInput): Promise<ProviderTransferReversal>;

  refundPayment(input: RefundPaymentInput): Promise<ProviderRefund>;

  createConnectedAccount(
    input: CreateConnectedAccountInput
  ): Promise<ProviderConnectedAccount>;
  fetchConnectedAccount(accountId: string): Promise<ProviderConnectedAccount>;

  /**
   * Verify a webhook signature against the raw body.
   *
   * `rawBody` must be the exact bytes received. Returning false must be treated
   * as a hard rejection, never a warning.
   */
  verifyWebhookSignature(rawBody: string, signature: string): boolean;
}

/** Provider event names this integration acts on. Verified to exist. */
export const SUPPORTED_WEBHOOK_EVENTS = [
  'payment.authorized',
  'payment.captured',
  'payment.failed',
  'order.paid',
  'refund.created',
  'refund.processed',
  'refund.failed',
  'transfer.processed',
  'transfer.failed',
  'settlement.processed',
  'product.route.activated',
  'product.route.under_review',
  'product.route.needs_clarification',
] as const;

export type SupportedWebhookEvent = (typeof SUPPORTED_WEBHOOK_EVENTS)[number];
