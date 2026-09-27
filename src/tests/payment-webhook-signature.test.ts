import { createHmac } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import Razorpay from 'razorpay';
import {
  RazorpayRouteProvider,
  RAZORPAY_CURRENCY,
} from '@/lib/payments/razorpay.provider';

/**
 * Webhook signature verification and provider mapping.
 *
 * The signature check is the only thing standing between a forged payload and
 * the escrow ledger, so it is tested directly against a real HMAC-SHA256
 * computed the way Razorpay documents it. No network call is involved.
 *
 * Documented scheme: hex HMAC-SHA256 of the raw request body, keyed by the
 * webhook secret, carried in `x-razorpay-signature`.
 */

const WEBHOOK_SECRET = 'whsec_test_secret_for_stage_10';

function sign(rawBody: string, secret = WEBHOOK_SECRET): string {
  return createHmac('sha256', secret).update(rawBody).digest('hex');
}

describe('webhook signature verification', () => {
  const provider = new RazorpayRouteProvider();
  const originalSecret = process.env.RAZORPAY_WEBHOOK_SECRET;

  beforeEach(() => {
    process.env.RAZORPAY_WEBHOOK_SECRET = WEBHOOK_SECRET;
  });

  afterEach(() => {
    if (originalSecret === undefined) delete process.env.RAZORPAY_WEBHOOK_SECRET;
    else process.env.RAZORPAY_WEBHOOK_SECRET = originalSecret;
  });

  it('accepts a correctly signed raw body', () => {
    const raw = JSON.stringify({ event: 'payment.captured', payload: { payment: { id: 'pay_1' } } });
    expect(provider.verifyWebhookSignature(raw, sign(raw))).toBe(true);
  });

  it('rejects a tampered body', () => {
    const raw = JSON.stringify({ event: 'payment.captured', payload: { payment: { id: 'pay_1' } } });
    const signature = sign(raw);
    // Swap the payment id without re-signing: a replay of a signature against
    // someone else's payment.
    const altered = raw.replace('"pay_1"', '"pay_2"');
    expect(altered).not.toBe(raw);
    expect(provider.verifyWebhookSignature(altered, signature)).toBe(false);
    expect(provider.verifyWebhookSignature(raw, signature)).toBe(true);
  });

  it('rejects a body signed with the wrong secret', () => {
    const raw = JSON.stringify({ event: 'payment.failed' });
    expect(provider.verifyWebhookSignature(raw, sign(raw, 'whsec_a_different_secret'))).toBe(false);
  });

  it('rejects an empty or missing signature rather than defaulting to true', () => {
    const raw = JSON.stringify({ event: 'payment.failed' });
    expect(provider.verifyWebhookSignature(raw, '')).toBe(false);
    expect(provider.verifyWebhookSignature(raw, '   ')).toBe(false);
    expect(provider.verifyWebhookSignature(raw, 'not-a-hex-digest')).toBe(false);
  });

  it('rejects everything when no webhook secret is configured', () => {
    // A missing secret must fail closed. Accepting unsigned events because the
    // deployment is misconfigured would be the worst possible outcome.
    delete process.env.RAZORPAY_WEBHOOK_SECRET;
    const raw = JSON.stringify({ event: 'payment.captured' });
    expect(provider.verifyWebhookSignature(raw, sign(raw))).toBe(false);
  });

  it('fails closed on a re-serialised body, which is why the route keeps the raw text', () => {
    // A pretty-printed body differs byte-for-byte from its compact
    // re-serialisation, so the digest differs too. This is exactly the mistake
    // that `await request.json()` followed by a re-stringify would introduce.
    const original = JSON.stringify(
      { event: 'payment.captured', payload: { payment: { id: 'pay_1' } } },
      null,
      2
    );
    const signature = sign(original);
    const reserialised = JSON.stringify(JSON.parse(original));
    expect(reserialised).not.toBe(original);
    expect(provider.verifyWebhookSignature(original, signature)).toBe(true);
    expect(provider.verifyWebhookSignature(reserialised, signature)).toBe(false);
  });

  it('agrees with the SDK helper the docs prescribe', () => {
    // Guards against the adapter and the documented algorithm diverging.
    const raw = JSON.stringify({ event: 'settlement.processed' });
    const signature = sign(raw);
    expect(Razorpay.validateWebhookSignature(raw, signature, WEBHOOK_SECRET)).toBe(true);
  });
});

describe('provider configuration surface', () => {
  it('is INR-only, matching Route', () => {
    const provider = new RazorpayRouteProvider();
    expect(provider.name).toBe('razorpay');
    expect(RAZORPAY_CURRENCY).toBe('INR');
    expect(provider.supportedCurrencies).toEqual(['INR']);
  });

  it('refuses to open an order in any other currency', async () => {
    const provider = new RazorpayRouteProvider();
    await expect(
      provider.createOrder({ amountCents: 1000, currency: 'USD', receipt: 'r1', notes: {} })
    ).rejects.toThrow(/only in INR/i);
  });

  it('does not construct the SDK client until a credential is actually needed', () => {
    // The client is lazy so a build without secrets does not throw at import.
    const original = process.env.RAZORPAY_KEY_ID;
    const secret = process.env.RAZORPAY_KEY_SECRET;
    delete process.env.RAZORPAY_KEY_ID;
    delete process.env.RAZORPAY_KEY_SECRET;
    expect(() => new RazorpayRouteProvider()).not.toThrow();
    if (original !== undefined) process.env.RAZORPAY_KEY_ID = original;
    if (secret !== undefined) process.env.RAZORPAY_KEY_SECRET = secret;
  });

  it('fails loudly when a call is attempted without credentials', async () => {
    const original = process.env.RAZORPAY_KEY_ID;
    delete process.env.RAZORPAY_KEY_ID;
    const provider = new RazorpayRouteProvider();
    await expect(
      provider.fetchOrder('order_1')
    ).rejects.toThrow(/RAZORPAY_KEY_ID is missing/);
    if (original !== undefined) process.env.RAZORPAY_KEY_ID = original;
  });
});
