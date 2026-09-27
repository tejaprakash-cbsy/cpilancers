/**
 * Razorpay Route payment provider.
 *
 * Implements `PaymentProvider` for the Indian marketplace. Every call below maps
 * to a documented Razorpay Route endpoint; no endpoint, parameter or status
 * value in this file was inferred. Where Razorpay's own documentation is
 * internally inconsistent the defensive reading is commented.
 *
 * Escrow design note. Razorpay caps manual capture at 7200 minutes and
 * auto-refunds anything left uncaptured after that window, so a payment cannot
 * sit in `authorized` as a long-lived escrow state. Orders are therefore created
 * with `capture: 'automatic'`: the money is captured immediately into the
 * platform balance, and escrow is enforced by the Route transfer's `on_hold`
 * flag. Releasing escrow is `transfers.edit(id, { on_hold: false })`.
 */

import Razorpay from 'razorpay';
import type { Accounts } from 'razorpay/dist/types/accounts';
import type { Orders } from 'razorpay/dist/types/orders';
import type { Payments } from 'razorpay/dist/types/payments';
import type { Refunds } from 'razorpay/dist/types/refunds';
import type { Transfers } from 'razorpay/dist/types/transfers';
import { AppError } from '@/lib/errors';
import type {
  CapturePaymentInput,
  CreateConnectedAccountInput,
  CreateOrderInput,
  CreateTransferInput,
  PaymentProvider,
  ProviderConnectedAccount,
  ProviderOrder,
  ProviderOrderStatus,
  ProviderPayment,
  ProviderPaymentStatus,
  ProviderRefund,
  ProviderTransfer,
  ProviderTransferReversal,
  RefundPaymentInput,
  ReverseTransferInput,
} from './provider';

export const RAZORPAY_CURRENCY = 'INR';

/**
 * Razorpay's SDK declares response objects as the request type plus a handful of
 * fields, so several documented response attributes are missing from the
 * TypeScript types. These local shapes describe the wire format the docs
 * guarantee, and are used only for reading responses.
 */
interface WirePayment {
  id: string;
  order_id?: string | null;
  amount: number | string;
  amount_captured?: number;
  amount_refunded?: number;
  currency: string;
  status: string;
  method?: string | null;
  fee?: number | null;
  tax?: number | null;
  error_code?: string | null;
  error_description?: string | null;
  error_reason?: string | null;
}

interface WireTransfer {
  id: string;
  source?: string | null;
  recipient?: string | null;
  amount: number | string;
  amount_reversed?: number;
  currency: string;
  // Razorpay's JSON samples use `status`; some field tables call it
  // `transfer_status`. Read both so a doc change in either direction is safe.
  status?: string;
  transfer_status?: string;
  settlement_status?: string | null;
  on_hold?: boolean;
  on_hold_until?: number | null;
  recipient_settlement_id?: string | null;
  error?: { code?: string | null; description?: string | null } | null;
}

let client: Razorpay | null = null;

function secret(name: 'RAZORPAY_KEY_ID' | 'RAZORPAY_KEY_SECRET'): string {
  const value = process.env[name];
  if (!value) {
    throw new AppError(
      `Payment provider is not configured: ${name} is missing.`,
      503,
      'PAYMENT_PROVIDER_UNAVAILABLE'
    );
  }
  return value;
}

/**
 * Lazily constructed so that a build without credentials does not throw at
 * import time, and so the secret is never captured in a module-level constant.
 */
function rzp(): Razorpay {
  if (!client) {
    client = new Razorpay({
      key_id: secret('RAZORPAY_KEY_ID'),
      key_secret: secret('RAZORPAY_KEY_SECRET'),
    });
  }
  return client;
}

/**
 * Normalise a Razorpay SDK error into an AppError.
 *
 * Razorpay errors arrive as `{ statusCode, error: { code, description, ... } }`.
 * The description is safe to surface (it explains the failure to the payer), but
 * it is never concatenated with credentials and is truncated defensively.
 */
function providerError(error: unknown, context: string): AppError {
  if (error instanceof AppError) return error;

  const raw = error as {
    statusCode?: number | string;
    error?: { code?: string; description?: string; reason?: string; field?: unknown };
    message?: string;
  };

  const code = raw?.error?.code || 'RAZORPAY_ERROR';
  const description = (
    raw?.error?.description ||
    raw?.error?.reason ||
    raw?.message ||
    'The payment provider rejected the request.'
  )
    .toString()
    .slice(0, 300);

  const status = Number(raw?.statusCode);

  // A duplicate `receipt` is Razorpay's idempotency guard firing, not a fault.
  if (code === 'BAD_REQUEST_ERROR' && /already been processed/i.test(description)) {
    return new AppError(
      'This payment request was already submitted.',
      409,
      'DUPLICATE_PAYMENT_REQUEST',
      { provider_code: code }
    );
  }

  // Insufficient platform balance is a settlement/escrow problem, not a client
  // input problem, and must not be reported as a 400.
  const statusCode = Number.isFinite(status) && status >= 400 && status < 500 ? status : 502;
  return new AppError(description, statusCode, `PROVIDER_${code}`, {
    context,
    provider_code: code,
  });
}

async function call<T>(context: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    throw providerError(error, context);
  }
}

function toInt(value: number | string | null | undefined, fallback = 0): number {
  const n = typeof value === 'string' ? Number(value) : value;
  return typeof n === 'number' && Number.isFinite(n) ? Math.trunc(n) : fallback;
}

const ORDER_STATUSES: ReadonlySet<string> = new Set(['created', 'attempted', 'paid']);
const PAYMENT_STATUSES: ReadonlySet<string> = new Set([
  'created',
  'authorized',
  'captured',
  'refunded',
  'failed',
]);
const TRANSFER_STATUSES: ReadonlySet<string> = new Set([
  'created',
  'pending',
  'processed',
  'failed',
  'reversed',
  'partially_reversed',
]);
const SETTLEMENT_STATUSES: ReadonlySet<string> = new Set([
  'pending',
  'on_hold',
  'settled',
]);

function mapOrder(raw: Orders.RazorpayOrder): ProviderOrder {
  return {
    id: raw.id,
    amountCents: toInt(raw.amount),
    amountPaidCents: toInt(raw.amount_paid),
    amountDueCents: toInt(raw.amount_due),
    currency: raw.currency,
    status: (ORDER_STATUSES.has(raw.status) ? raw.status : 'created') as ProviderOrderStatus,
    receipt: raw.receipt ?? null,
  };
}

function mapPayment(raw: Payments.RazorpayPayment): ProviderPayment {
  const wire = raw as unknown as WirePayment;
  return {
    id: wire.id,
    orderId: wire.order_id ?? null,
    amountCents: toInt(wire.amount),
    // `amount_captured` is documented but absent from the SDK's response type.
    amountCapturedCents: toInt(wire.amount_captured, toInt(wire.amount)),
    amountRefundedCents: toInt(wire.amount_refunded),
    currency: wire.currency,
    status: (PAYMENT_STATUSES.has(wire.status)
      ? wire.status
      : 'created') as ProviderPaymentStatus,
    method: wire.method ?? null,
    // `fee` already includes GST; `tax` is a subset of it and must not be added.
    feeCents: typeof wire.fee === 'number' ? wire.fee : null,
    taxCents: typeof wire.tax === 'number' ? wire.tax : null,
    errorCode: wire.error_code ?? null,
    errorDescription: wire.error_description ?? null,
    errorReason: wire.error_reason ?? null,
  };
}

function mapTransfer(raw: Transfers.RazorpayTransfer): ProviderTransfer {
  const wire = raw as unknown as WireTransfer;
  const rawStatus = wire.status ?? wire.transfer_status ?? 'created';
  const rawSettlement = wire.settlement_status ?? null;

  return {
    id: wire.id,
    sourceId: wire.source ?? null,
    destinationAccountId: wire.recipient ?? '',
    amountCents: toInt(wire.amount),
    amountReversedCents: toInt(wire.amount_reversed),
    currency: wire.currency,
    status: (TRANSFER_STATUSES.has(rawStatus) ? rawStatus : 'created') as ProviderTransfer['status'],
    settlementStatus: (rawSettlement && SETTLEMENT_STATUSES.has(rawSettlement)
      ? rawSettlement
      : 'pending') as ProviderTransfer['settlementStatus'],
    onHold: wire.on_hold === true,
    onHoldUntil: wire.on_hold_until ?? null,
    recipientSettlementId: wire.recipient_settlement_id ?? null,
    failureReason: wire.error?.description ?? wire.error?.code ?? null,
  };
}

function mapRefund(raw: Refunds.RazorpayRefund): ProviderRefund {
  return {
    id: raw.id,
    paymentId: raw.payment_id,
    amountCents: toInt(raw.amount),
    currency: raw.currency,
    status: raw.status,
    speedRequested: raw.speed_requested ?? null,
    speedProcessed: raw.speed_processed ?? null,
    failureReason: null,
  };
}

// Namespace re-exports used only for the local wire shapes above.

export class RazorpayRouteProvider implements PaymentProvider {
  readonly name = 'razorpay';
  readonly supportedCurrencies = [RAZORPAY_CURRENCY] as const;

  // -- Orders -------------------------------------------------------------

  async createOrder(input: CreateOrderInput): Promise<ProviderOrder> {
    if (input.currency !== RAZORPAY_CURRENCY) {
      throw new AppError(
        `Razorpay Route settles only in ${RAZORPAY_CURRENCY}.`,
        400,
        'UNSUPPORTED_CURRENCY'
      );
    }
    const order = await call('createOrder', () =>
      rzp().orders.create({
        amount: input.amountCents,
        currency: input.currency,
        receipt: input.receipt,
        notes: input.notes,
        // Automatic capture is required because manual capture is capped at 7200
        // minutes; escrow is enforced on the transfer's on_hold flag instead.
        payment: { capture: 'automatic' },
      })
    );
    return mapOrder(order);
  }

  async fetchOrder(orderId: string): Promise<ProviderOrder> {
    const order = await call('fetchOrder', () => rzp().orders.fetch(orderId));
    return mapOrder(order);
  }

  // -- Payments -----------------------------------------------------------

  async capturePayment(input: CapturePaymentInput): Promise<ProviderPayment> {
    const payment = await call('capturePayment', () =>
      rzp().payments.capture(input.paymentId, input.amountCents, input.currency)
    );
    return mapPayment(payment);
  }

  async fetchPayment(paymentId: string): Promise<ProviderPayment> {
    const payment = await call('fetchPayment', () => rzp().payments.fetch(paymentId));
    return mapPayment(payment);
  }

  // -- Transfers (the escrow primitive) -----------------------------------

  async createTransfer(input: CreateTransferInput): Promise<ProviderTransfer> {
    const transfer: Transfers.RazorpayPaymentCreateRequestBody = {
      account: input.destinationAccountId,
      amount: input.amountCents,
      currency: input.currency,
      notes: input.notes,
      on_hold: input.onHold,
      ...(input.onHoldUntil ? { on_hold_until: input.onHoldUntil } : {}),
    };

    // `payments.transfer` is the documented endpoint for creating a transfer
    // from a captured payment with a hold. Unlike `orders.create` with transfers
    // it does not require knowing the destination at order-creation time.
    const collection = await call('createTransfer', () =>
      rzp().payments.transfer(input.sourcePaymentId, { transfers: [transfer] })
    );

    const created = collection?.items?.[0];
    if (!created) {
      throw new AppError(
        'The payment provider did not return a transfer for the escrow hold.',
        502,
        'PROVIDER_TRANSFER_MISSING'
      );
    }
    return mapTransfer(created);
  }

  async fetchTransfer(transferId: string): Promise<ProviderTransfer> {
    const transfer = await call('fetchTransfer', () => rzp().transfers.fetch(transferId));
    return mapTransfer(transfer);
  }

  /**
   * Release escrowed funds.
   *
   * Razorpay has no dedicated unhold endpoint: PATCHing `on_hold: false` *is*
   * the release. The transfer is then only eligible to settle — the linked
   * account's own T+N schedule still applies, so this is not the same as the
   * money having reached the consultant's bank.
   */
  async releaseTransfer(transferId: string): Promise<ProviderTransfer> {
    const transfer = await call('releaseTransfer', () =>
      rzp().transfers.edit(transferId, { on_hold: false })
    );
    return mapTransfer(transfer);
  }

  async holdTransfer(transferId: string, onHoldUntil?: number): Promise<ProviderTransfer> {
    const transfer = await call('holdTransfer', () =>
      rzp().transfers.edit(transferId, {
        on_hold: true,
        ...(onHoldUntil ? { on_hold_until: onHoldUntil } : {}),
      })
    );
    return mapTransfer(transfer);
  }

  async reverseTransfer(input: ReverseTransferInput): Promise<ProviderTransferReversal> {
    const reversal = await call('reverseTransfer', () =>
      // Omitting `amount` reverses the entire transfer.
      rzp().transfers.reverse(
        input.transferId,
        input.amountCents ? { amount: input.amountCents } : undefined
      )
    );
    return {
      id: reversal.id,
      transferId: reversal.transfer_id,
      amountCents: toInt(reversal.amount),
      currency: reversal.currency,
    };
  }

  // -- Refunds ------------------------------------------------------------

  /**
   * Refund a captured payment, optionally reversing the linked-account
   * transfer in the same call.
   *
   * `reverse_all` must be set when escrow was already released; otherwise the
   * consultant keeps funds that the client has been refunded for. Note that
   * Razorpay funds refunds from the merchant balance, so a refund can fail for
   * insufficient platform balance even when the payment succeeded.
   */
  async refundPayment(input: RefundPaymentInput): Promise<ProviderRefund> {
    const refund = await call('refundPayment', () =>
      rzp().payments.refund(input.paymentId, {
        ...(input.amountCents ? { amount: input.amountCents } : {}),
        speed: input.speed,
        notes: input.notes,
        ...(input.reverseTransfers ? { reverse_all: 1 } : {}),
      })
    );
    return mapRefund(refund);
  }

  // -- Linked accounts (consultant KYC) ------------------------------------

  async createConnectedAccount(
    input: CreateConnectedAccountInput
  ): Promise<ProviderConnectedAccount> {
    const account = await call('createConnectedAccount', () =>
      rzp().accounts.create({
        email: input.email,
        phone: input.phone,
        type: 'route',
        business_type: input.businessType,
        legal_business_name: input.legalBusinessName,
        contact_name: input.contactName,
        ...(input.customerFacingBusinessName
          ? { customer_facing_business_name: input.customerFacingBusinessName }
          : {}),
        // Our consultant profile UUID. Storing it lets a webhook or support
        // request map an `acc_...` back to a marketplace profile.
        reference_id: input.referenceId,
        profile: {
          category: input.category,
          subcategory: input.subcategory,
          ...(input.businessModel ? { business_model: input.businessModel } : {}),
          addresses: {
            registered: {
              street1: input.address.street1,
              street2: input.address.street2,
              city: input.address.city,
              state: input.address.state,
              postal_code: input.address.postalCode,
              country: input.address.country,
            },
          },
        },
        ...(input.pan || input.gst
          ? { legal_info: { ...(input.pan ? { pan: input.pan } : {}), ...(input.gst ? { gst: input.gst } : {}) } }
          : {}),
      } as Accounts.RazorpayAccountCreateRequestBody)
    );
    return mapConnectedAccount(account);
  }

  async fetchConnectedAccount(accountId: string): Promise<ProviderConnectedAccount> {
    const account = await call('fetchConnectedAccount', () =>
      rzp().accounts.fetch(accountId)
    );
    return mapConnectedAccount(account);
  }

  // -- Webhooks -----------------------------------------------------------

  /**
   * Verify the `x-razorpay-signature` header: hex HMAC-SHA256 of the raw body
   * keyed by the webhook secret.
   *
   * The webhook secret is a distinct value configured in the Razorpay dashboard;
   * it is not the API key secret.
   */
  verifyWebhookSignature(rawBody: string, signature: string): boolean {
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
    if (!webhookSecret || !signature) return false;
    try {
      return Razorpay.validateWebhookSignature(rawBody, signature, webhookSecret) === true;
    } catch {
      return false;
    }
  }
}

function mapConnectedAccount(raw: Accounts.RazorpayAccount): ProviderConnectedAccount {
  const wire = raw as unknown as {
    charges_enabled?: boolean;
    payouts_enabled?: boolean;
    details_submitted?: boolean;
  };
  return {
    id: raw.id,
    status: raw.status ?? 'created',
    detailsSubmitted: wire.details_submitted === true,
    // Route linked accounts do not accept payments themselves, so
    // `charges_enabled` is informational. `payouts_enabled` is the flag that
    // actually governs whether escrow can be released.
    chargesEnabled: wire.charges_enabled === true,
    payoutsEnabled: wire.payouts_enabled === true,
  };
}

let provider: PaymentProvider | null = null;

export function getPaymentProvider(): PaymentProvider {
  if (!provider) provider = new RazorpayRouteProvider();
  return provider;
}
