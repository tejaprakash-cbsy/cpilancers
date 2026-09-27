import { describe, expect, it } from 'vitest';
import {
  PAYMENT_TRANSITIONS,
  PAYOUT_TRANSITIONS,
  isValidPaymentTransition,
  isValidPayoutTransition,
  getPaymentTransitionActor,
  paymentCreateSchema,
  paymentReleaseSchema,
  paymentRefundSchema,
  connectOnboardingSchema,
  platformFeeConfigSchema,
  paymentStatusEnum,
  payoutStatusEnum,
  FORBIDDEN_PAYMENT_INPUT_KEYS,
} from '@/lib/validations/payment.schemas';

/**
 * Payment state machine and input validation.
 *
 * Two properties matter most here:
 *   - a terminal status can never be left (refunded, failed; completed payouts)
 *   - the create endpoint physically cannot be made to accept an amount
 */

describe('payment status enum', () => {
  it('mirrors the database payment_status enum exactly', () => {
    // Postgres: payment_status AS ENUM ('pending','held_in_escrow','released','refunded','failed')
    expect(paymentStatusEnum.options.slice().sort()).toEqual(
      ['failed', 'held_in_escrow', 'pending', 'refunded', 'released'].sort()
    );
  });

  it('mirrors the database payout_status enum exactly', () => {
    // Postgres: payout_status AS ENUM ('pending','processing','completed','failed')
    expect(payoutStatusEnum.options.slice().sort()).toEqual(
      ['completed', 'failed', 'pending', 'processing'].sort()
    );
  });
});

describe('payment state machine', () => {
  it('allows the escrow lifecycle', () => {
    expect(isValidPaymentTransition('pending', 'held_in_escrow')).toBe(true);
    expect(isValidPaymentTransition('held_in_escrow', 'released')).toBe(true);
    expect(isValidPaymentTransition('held_in_escrow', 'refunded')).toBe(true);
    expect(isValidPaymentTransition('released', 'refunded')).toBe(true);
    expect(isValidPaymentTransition('pending', 'failed')).toBe(true);
  });

  it('never releases a payment that was never funded', () => {
    // Releasing straight from pending would let funds move without a capture.
    expect(isValidPaymentTransition('pending', 'released')).toBe(false);
  });

  it('never moves a payment backwards', () => {
    expect(isValidPaymentTransition('held_in_escrow', 'pending')).toBe(false);
    expect(isValidPaymentTransition('released', 'held_in_escrow')).toBe(false);
    expect(isValidPaymentTransition('refunded', 'released')).toBe(false);
  });

  it('treats refunded and failed as terminal', () => {
    expect(PAYMENT_TRANSITIONS.refunded).toEqual([]);
    expect(PAYMENT_TRANSITIONS.failed).toEqual([]);
    for (const to of ['pending', 'held_in_escrow', 'released'] as const) {
      expect(isValidPaymentTransition('refunded', to)).toBe(false);
      expect(isValidPaymentTransition('failed', to)).toBe(false);
    }
  });

  it('only lets a client release funds, and reserves failure for the system', () => {
    expect(getPaymentTransitionActor('held_in_escrow', 'released')).toBe('client');
    expect(getPaymentTransitionActor('pending', 'held_in_escrow')).toBe('client');
    expect(getPaymentTransitionActor('pending', 'failed')).toBe('system');
    // A refund is never a client-driven transition.
    expect(getPaymentTransitionActor('held_in_escrow', 'refunded')).toBe('system');
  });

  it('is total: every status has a transition entry', () => {
    for (const status of paymentStatusEnum.options) {
      expect(PAYMENT_TRANSITIONS[status]).toBeDefined();
    }
  });
});

describe('payout state machine', () => {
  it('follows hold -> released -> settled', () => {
    expect(isValidPayoutTransition('pending', 'processing')).toBe(true);
    expect(isValidPayoutTransition('processing', 'completed')).toBe(true);
  });

  it('allows a same-day settlement to complete straight from pending', () => {
    // A linked account on a same-day schedule can settle before the release
    // webhook round-trips.
    expect(isValidPayoutTransition('pending', 'completed')).toBe(true);
  });

  it('treats completed as terminal', () => {
    expect(PAYOUT_TRANSITIONS.completed).toEqual([]);
    expect(isValidPayoutTransition('completed', 'processing')).toBe(false);
    expect(isValidPayoutTransition('completed', 'failed')).toBe(false);
  });

  it('allows a failed payout to be retried', () => {
    expect(isValidPayoutTransition('failed', 'processing')).toBe(true);
    expect(isValidPayoutTransition('failed', 'completed')).toBe(true);
  });

  it('is total: every status has a transition entry', () => {
    for (const status of payoutStatusEnum.options) {
      expect(PAYOUT_TRANSITIONS[status]).toBeDefined();
    }
  });
});

describe('payment create input', () => {
  it('accepts only a milestone id', () => {
    const parsed = paymentCreateSchema.parse({ milestone_id: 'c0ffee00-0000-4000-8000-000000000000' });
    expect(parsed).toEqual({ milestone_id: 'c0ffee00-0000-4000-8000-000000000000' });
  });

  it('rejects any attempt to supply a financial field', () => {
    const id = 'c0ffee00-0000-4000-8000-000000000000';
    for (const key of FORBIDDEN_PAYMENT_INPUT_KEYS) {
      const body: Record<string, unknown> = { milestone_id: id };
      // An amount of 1 paise: the tampering must fail even when trivially small.
      body[key] = 1;
      expect(() => paymentCreateSchema.parse(body)).toThrow();
    }
  });

  it('rejects a request with no milestone at all', () => {
    expect(() => paymentCreateSchema.parse({})).toThrow();
  });

  it('rejects a non-uuid milestone id', () => {
    expect(() => paymentCreateSchema.parse({ milestone_id: 'not-a-uuid' })).toThrow();
  });
});

describe('release and refund input', () => {
  it('rejects an amount on the release endpoint', () => {
    expect(() => paymentReleaseSchema.parse({ amount_cents: 1 })).toThrow();
    expect(() => paymentReleaseSchema.parse({ note: 'approved' })).not.toThrow();
  });

  it('rejects a fractional, zero or negative refund amount', () => {
    expect(() => paymentRefundSchema.parse({ amount_cents: 100.5, reason: 'dispute' })).toThrow();
    expect(() => paymentRefundSchema.parse({ amount_cents: 0, reason: 'dispute' })).toThrow();
    expect(() => paymentRefundSchema.parse({ amount_cents: -100, reason: 'dispute' })).toThrow();
  });

  it('allows a full refund by omitting the amount', () => {
    const parsed = paymentRefundSchema.parse({ reason: 'scope not delivered' });
    expect(parsed.amount_cents).toBeUndefined();
    expect(parsed.speed).toBe('normal');
  });

  it('requires a meaningful reason', () => {
    expect(() => paymentRefundSchema.parse({ reason: '' })).toThrow();
  });
});

describe('fee configuration input', () => {
  it('rejects a scope whose target id is missing or mismatched', () => {
    expect(() => platformFeeConfigSchema.parse({ scope: 'global', basis_points: 1000 })).not.toThrow();
    expect(() => platformFeeConfigSchema.parse({ scope: 'contract', basis_points: 1000 })).toThrow();
    expect(() =>
      platformFeeConfigSchema.parse({ scope: 'global', basis_points: 1000, contract_id: 'c' })
    ).toThrow();
  });

  it('rejects a max below the min', () => {
    expect(() =>
      platformFeeConfigSchema.parse({
        scope: 'global',
        basis_points: 1000,
        min_fee_cents: 500,
        max_fee_cents: 100,
      })
    ).toThrow();
  });

  it('rejects a basis point rate above 100%', () => {
    expect(() =>
      platformFeeConfigSchema.parse({ scope: 'global', basis_points: 10_001 })
    ).toThrow();
  });
});

describe('linked account onboarding input', () => {
  const valid = {
    legal_business_name: 'Acme Consulting LLP',
    business_type: 'llp' as const,
    contact_name: 'Gaurav Kumar',
    phone: '9000090000',
    category: 'it_services',
    subcategory: 'sap_consulting',
    address: {
      street1: '507, Koramangala 1st block',
      street2: 'MG Road',
      city: 'Bengaluru',
      state: 'KARNATAKA',
      postal_code: '560034',
      country: 'IN',
    },
  };

  it('accepts a complete Indian business profile', () => {
    expect(connectOnboardingSchema.parse(valid)).toMatchObject({ business_type: 'llp' });
  });

  it('defaults the country to India', () => {
    const addressWithoutCountry = {
      street1: valid.address.street1,
      street2: valid.address.street2,
      city: valid.address.city,
      state: valid.address.state,
      postal_code: valid.address.postal_code,
    };
    expect(
      connectOnboardingSchema.parse({ ...valid, address: addressWithoutCountry }).address.country
    ).toBe('IN');
  });

  it('rejects a malformed PIN code', () => {
    expect(() =>
      connectOnboardingSchema.parse({ ...valid, address: { ...valid.address, postal_code: '5600' } })
    ).toThrow();
  });

  it('rejects a malformed PAN when one is supplied', () => {
    // PAN is 5 letters + 4 digits + 1 letter.
    expect(() => connectOnboardingSchema.parse({ ...valid, pan: 'ABCDE1234F' })).not.toThrow();
    // Too short.
    expect(() => connectOnboardingSchema.parse({ ...valid, pan: 'ABC1234F' })).toThrow();
    // Digits where letters belong.
    expect(() => connectOnboardingSchema.parse({ ...valid, pan: '1BCDE1234F' })).toThrow();
    // Letters where the digits belong.
    expect(() => connectOnboardingSchema.parse({ ...valid, pan: 'ABCDEABCD1' })).toThrow();
  });

  it('rejects an unknown business type', () => {
    expect(() =>
      connectOnboardingSchema.parse({ ...valid, business_type: 'sovereign_agency' })
    ).toThrow();
  });
});
