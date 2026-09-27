import { describe, expect, it } from 'vitest';
import {
  calculatePlatformFeeCents,
  calculateFeeBreakdown,
  assertFeeMath,
  selectFeeConfig,
  ZERO_FEE_CONFIG,
} from '@/lib/payments/fees';
import type { PlatformFeeConfig } from '@/types/database';

/**
 * Platform fee correctness.
 *
 * The invariant under test is the one the database also enforces:
 *   gross_amount_cents = platform_fee_cents + net_amount_cents
 * If this drifts, every payment row write fails and, worse, a consultant could
 * be paid the wrong amount.
 */

function config(overrides: Partial<Parameters<typeof calculatePlatformFeeCents>[1]> = {}) {
  return {
    basis_points: 0,
    fixed_cents: 0,
    min_fee_cents: 0,
    max_fee_cents: null,
    ...overrides,
  };
}

describe('platform fee calculation', () => {
  it('computes a percentage fee in basis points', () => {
    // 10% of 100_00 paise (₹1,000) is 10_00 paise.
    expect(calculatePlatformFeeCents(100_00, config({ basis_points: 1000 }))).toBe(10_00);
    // 2.5% of 250_00 paise (₹250) is 625 paise.
    expect(calculatePlatformFeeCents(250_00, config({ basis_points: 250 }))).toBe(625);
  });

  it('computes a zero fee when unconfigured', () => {
    expect(calculatePlatformFeeCents(500_00, ZERO_FEE_CONFIG)).toBe(0);
  });

  it('adds a fixed component on top of the percentage', () => {
    // 10% of 100_00 = 10_00, plus 2_50 fixed.
    expect(calculatePlatformFeeCents(100_00, config({ basis_points: 1000, fixed_cents: 2_50 }))).toBe(
      12_50
    );
  });

  it('applies the minimum floor when the gross can absorb it', () => {
    // 1% of 1_000 paise is 10, but the floor is 500.
    expect(calculatePlatformFeeCents(1_000, config({ basis_points: 100, min_fee_cents: 500 }))).toBe(
      500
    );
  });

  it('caps the fee at the gross when the floor would exceed it', () => {
    // A 500 paise minimum on a 100 paise gross cannot both be honoured and keep
    // the net non-negative. Net >= 0 wins, so the fee is clamped to the gross
    // and the consultant is paid nothing rather than a negative amount. This is
    // a misconfiguration the operator must fix, not a state the code can allow.
    const fee = calculatePlatformFeeCents(100, config({ basis_points: 100, min_fee_cents: 500 }));
    expect(fee).toBe(100);
    const breakdown = calculateFeeBreakdown(100, config({ basis_points: 100, min_fee_cents: 500 }));
    expect(breakdown.net_amount_cents).toBe(0);
    expect(() => assertFeeMath(breakdown)).not.toThrow();
  });

  it('applies the maximum ceiling', () => {
    expect(
      calculatePlatformFeeCents(1_000_00, config({ basis_points: 2000, max_fee_cents: 5_000 }))
    ).toBe(5_000);
  });

  it('never lets the fee reach the gross, so the net stays non-negative', () => {
    // A 100% fee plus a fixed component would otherwise produce a negative net.
    const fee = calculatePlatformFeeCents(
      1_000,
      config({ basis_points: 10_000, fixed_cents: 500 })
    );
    expect(fee).toBe(1_000);
    const breakdown = calculateFeeBreakdown(1_000, config({ basis_points: 10_000, fixed_cents: 500 }));
    expect(breakdown.net_amount_cents).toBe(0);
  });

  it('rounds to whole paise', () => {
    const fee = calculatePlatformFeeCents(333, config({ basis_points: 1000 }));
    expect(Number.isInteger(fee)).toBe(true);
    // 10% of 333 is 33.3, rounded half-up to 33.
    expect(fee).toBe(33);
  });

  it('satisfies gross = fee + net for a range of amounts and rates', () => {
    const rates = [0, 250, 1000, 1500, 3333];
    const amounts = [1, 99, 100, 12_345, 999_999, 10_000_000];
    for (const basis_points of rates) {
      for (const gross of amounts) {
        const breakdown = calculateFeeBreakdown(gross, config({ basis_points }));
        expect(breakdown.gross_amount_cents).toBe(
          breakdown.platform_fee_cents + breakdown.net_amount_cents
        );
        expect(breakdown.net_amount_cents).toBeGreaterThanOrEqual(0);
        expect(breakdown.platform_fee_cents).toBeGreaterThanOrEqual(0);
        // Re-assert through the same guard the service uses before writing.
        expect(() => assertFeeMath(breakdown)).not.toThrow();
      }
    }
  });

  it('rejects a non-integer or non-positive gross', () => {
    expect(() => calculatePlatformFeeCents(100.5, ZERO_FEE_CONFIG)).toThrow();
    expect(() => calculatePlatformFeeCents(0, ZERO_FEE_CONFIG)).toThrow();
    expect(() => calculatePlatformFeeCents(-100, ZERO_FEE_CONFIG)).toThrow();
  });

  it('rejects a breakdown that violates the database invariant', () => {
    expect(() =>
      assertFeeMath({ gross_amount_cents: 1000, platform_fee_cents: 100, net_amount_cents: 800 })
    ).toThrow(/gross must equal/i);
    expect(() =>
      assertFeeMath({ gross_amount_cents: 1000, platform_fee_cents: 100, net_amount_cents: -1 })
    ).toThrow();
  });
});

describe('fee configuration precedence', () => {
  const row = (over: Partial<PlatformFeeConfig>): PlatformFeeConfig => ({
    id: over.id ?? 'cfg',
    scope: over.scope ?? 'global',
    contract_id: over.contract_id ?? null,
    milestone_id: over.milestone_id ?? null,
    basis_points: over.basis_points ?? 0,
    fixed_cents: over.fixed_cents ?? 0,
    min_fee_cents: over.min_fee_cents ?? 0,
    max_fee_cents: over.max_fee_cents ?? null,
    currency: 'INR',
    is_active: over.is_active ?? true,
    created_at: '',
    updated_at: '',
  });

  it('prefers a milestone rule over a contract rule over the global rule', () => {
    const configs = [
      row({ id: 'g', scope: 'global', basis_points: 1000 }),
      row({ id: 'c', scope: 'contract', contract_id: 'contract-1', basis_points: 500 }),
      row({ id: 'm', scope: 'milestone', milestone_id: 'milestone-1', basis_points: 0 }),
    ];
    expect(selectFeeConfig(configs, { contractId: 'contract-1', milestoneId: 'milestone-1' })?.id).toBe(
      'm'
    );
    expect(selectFeeConfig(configs, { contractId: 'contract-1', milestoneId: 'milestone-2' })?.id).toBe(
      'c'
    );
    expect(selectFeeConfig(configs, { contractId: 'other', milestoneId: null })?.id).toBe('g');
  });

  it('ignores inactive rules', () => {
    const configs = [
      row({ id: 'g', scope: 'global', basis_points: 1000, is_active: false }),
      row({ id: 'c', scope: 'contract', contract_id: 'contract-1', basis_points: 500 }),
    ];
    expect(selectFeeConfig(configs, { contractId: 'contract-1', milestoneId: null })?.id).toBe('c');
  });

  it('returns null when nothing is configured, so the fee falls back to zero', () => {
    expect(selectFeeConfig([], { contractId: 'c', milestoneId: null })).toBeNull();
  });
});
