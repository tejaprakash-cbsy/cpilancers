/**
 * Authoritative platform fee calculation.
 *
 * Every rupee that moves through the marketplace is computed here, on the server,
 * from the amount already stored in the database. Nothing in this module accepts
 * an amount from a request body, and nothing in it is exported to a client
 * bundle: the client is told the resulting amounts only after the server has
 * decided them.
 *
 * Fee model (Stage 10 decision): a single platform fee is withheld from the
 * gross. The client pays the milestone amount exactly; the consultant is paid
 * the net. This satisfies the pre-existing database invariant
 *
 *   chk_payment_math: gross_amount_cents = platform_fee_cents + net_amount_cents
 *
 * which is re-asserted before any payment row is written.
 *
 * All arithmetic is integer paise. No floating point value is ever persisted.
 */

import { ValidationError } from '@/lib/errors';
import type { PlatformFeeConfig } from '@/types/database';

export const BASIS_POINTS_DIVISOR = 10_000;

export interface FeeConfigInput {
  basis_points: number;
  fixed_cents: number;
  min_fee_cents: number;
  max_fee_cents: number | null;
}

export interface FeeBreakdown {
  gross_amount_cents: number;
  platform_fee_cents: number;
  net_amount_cents: number;
  /** Which configuration row produced this, for audit. */
  config_id: string | null;
  scope: PlatformFeeConfig['scope'] | 'fallback_zero';
}

export const ZERO_FEE_CONFIG: FeeConfigInput = {
  basis_points: 0,
  fixed_cents: 0,
  min_fee_cents: 0,
  max_fee_cents: null,
};

/**
 * Compute the platform fee for a gross amount.
 *
 * fee = clamp(round(gross * basis_points / 10000) + fixed_cents, min, max)
 *
 * The clamp is applied last, so an explicit `fixed_cents` can still be bounded
 * by min/max. The fee is additionally capped at the gross itself, because a
 * consultant must never be asked to absorb a negative net.
 */
export function calculatePlatformFeeCents(
  grossAmountCents: number,
  config: FeeConfigInput
): number {
  assertPositiveInteger(grossAmountCents, 'gross amount');

  const percentage = Math.round(
    (grossAmountCents * config.basis_points) / BASIS_POINTS_DIVISOR
  );
  const uncapped = percentage + config.fixed_cents;

  let fee = uncapped;
  if (fee < config.min_fee_cents) fee = config.min_fee_cents;
  if (config.max_fee_cents !== null && fee > config.max_fee_cents) {
    fee = config.max_fee_cents;
  }
  // A fee equal to or greater than the gross would produce a zero or negative
  // net. Clamping here keeps `net_amount_cents >= 0` true by construction.
  if (fee > grossAmountCents) fee = grossAmountCents;

  return fee;
}

/**
 * Produce the full amount triple for a payment.
 *
 * The result is the only shape written to the payments table. Keeping the
 * computation in one function means the fee can never be derived two different
 * ways in two different code paths.
 */
export function calculateFeeBreakdown(
  grossAmountCents: number,
  config: FeeConfigInput & {
    id?: string | null;
    scope?: PlatformFeeConfig['scope'] | 'fallback_zero';
  }
): FeeBreakdown {
  const platformFeeCents = calculatePlatformFeeCents(grossAmountCents, config);
  const netAmountCents = grossAmountCents - platformFeeCents;

  const breakdown: FeeBreakdown = {
    gross_amount_cents: grossAmountCents,
    platform_fee_cents: platformFeeCents,
    net_amount_cents: netAmountCents,
    config_id: config.id ?? null,
    scope: config.scope ?? 'fallback_zero',
  };

  assertFeeMath(breakdown);
  return breakdown;
}

/**
 * Re-assert the database invariant `chk_payment_math` in the application.
 *
 * A CHECK constraint is the last line of defence; this throws first so a bug
 * surfaces as a clear error rather than an opaque PostgREST 409.
 */
export function assertFeeMath(breakdown: {
  gross_amount_cents: number;
  platform_fee_cents: number;
  net_amount_cents: number;
}): void {
  const { gross_amount_cents: gross, platform_fee_cents: fee, net_amount_cents: net } =
    breakdown;

  if (!Number.isInteger(gross) || gross <= 0) {
    throw new ValidationError('Gross amount must be a positive whole number of paise.');
  }
  if (!Number.isInteger(fee) || fee < 0) {
    throw new ValidationError('Platform fee must be a non-negative whole number of paise.');
  }
  if (!Number.isInteger(net) || net < 0) {
    throw new ValidationError('Net amount must be a non-negative whole number of paise.');
  }
  if (gross !== fee + net) {
    throw new ValidationError(
      'Fee breakdown is inconsistent: gross must equal platform fee plus net.'
    );
  }
}

function assertPositiveInteger(value: number, label: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new ValidationError(
      `Cannot compute a fee for a ${label} of ${value}; it must be a positive whole number of paise.`
    );
  }
}

/**
 * Resolve the fee configuration that applies to a payment.
 *
 * Precedence is most specific first: a milestone row beats a contract row beats
 * the global row. `platform_fee_config` carries a partial unique index per scope,
 * so at most one active row can ever match each level and resolution is
 * deterministic rather than dependent on row order.
 */
export function selectFeeConfig(
  configs: PlatformFeeConfig[],
  target: { contractId: string; milestoneId: string | null }
): PlatformFeeConfig | null {
  const active = configs.filter((c) => c.is_active);

  if (target.milestoneId) {
    const byMilestone = active.find((c) => c.milestone_id === target.milestoneId);
    if (byMilestone) return byMilestone;
  }
  const byContract = active.find((c) => c.contract_id === target.contractId);
  if (byContract) return byContract;

  return active.find((c) => c.scope === 'global') ?? null;
}
