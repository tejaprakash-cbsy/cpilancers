import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import {
  getPaymentProvider,
  resetPaymentProvider,
  PaymentsUnavailableError,
} from '@/lib/payments/razorpay.provider';
import { MockPaymentProvider } from '@/lib/payments/mock.provider';

import { GET as getPayments, POST as postPayments } from '@/app/api/payments/route';
import { GET as getPaymentById } from '@/app/api/payments/[id]/route';
import { POST as postAttach } from '@/app/api/payments/[id]/attach/route';
import { POST as postConfirm } from '@/app/api/payments/[id]/confirm/route';
import { POST as postRefund } from '@/app/api/payments/[id]/refund/route';
import { POST as postRelease } from '@/app/api/payments/[id]/release/route';
import { GET as getConnect, POST as postConnect } from '@/app/api/payments/connect/route';
import { POST as postWebhook } from '@/app/api/payments/webhook/route';
import { GET as getPayouts } from '@/app/api/payouts/route';

describe('Payment provider availability and fail-closed security', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    resetPaymentProvider();
    delete process.env.RAZORPAY_KEY_ID;
    delete process.env.RAZORPAY_KEY_SECRET;
    delete process.env.RAZORPAY_WEBHOOK_SECRET;
    delete process.env.USE_MOCK_PAYMENT;
    delete process.env.VERCEL_ENV;
  });

  afterEach(() => {
    resetPaymentProvider();
    process.env = { ...originalEnv };
  });

  describe('getPaymentProvider() resolution rules', () => {
    it('throws PaymentsUnavailableError in production when credentials are missing', () => {
      process.env.NODE_ENV = 'production';
      delete process.env.RAZORPAY_KEY_ID;
      delete process.env.RAZORPAY_KEY_SECRET;

      expect(() => getPaymentProvider()).toThrow(PaymentsUnavailableError);
      expect(() => getPaymentProvider()).toThrow('Payments are not available yet.');
    });

    it('throws PaymentsUnavailableError in VERCEL_ENV=production even if USE_MOCK_PAYMENT is true', () => {
      process.env.VERCEL_ENV = 'production';
      process.env.USE_MOCK_PAYMENT = 'true';
      delete process.env.RAZORPAY_KEY_ID;
      delete process.env.RAZORPAY_KEY_SECRET;

      expect(() => getPaymentProvider()).toThrow(PaymentsUnavailableError);
    });

    it('throws PaymentsUnavailableError in development when USE_MOCK_PAYMENT is not true and credentials missing', () => {
      process.env.NODE_ENV = 'development';
      delete process.env.USE_MOCK_PAYMENT;
      delete process.env.RAZORPAY_KEY_ID;
      delete process.env.RAZORPAY_KEY_SECRET;

      expect(() => getPaymentProvider()).toThrow(PaymentsUnavailableError);
    });

    it('uses MockPaymentProvider in development when USE_MOCK_PAYMENT is true', () => {
      process.env.NODE_ENV = 'development';
      process.env.USE_MOCK_PAYMENT = 'true';

      const provider = getPaymentProvider();
      expect(provider).toBeInstanceOf(MockPaymentProvider);
      expect(provider.name).toBe('mock_provider');
    });
  });

  describe('Payment API routes fail closed in production without credentials', () => {
    beforeEach(() => {
      process.env.NODE_ENV = 'production';
      delete process.env.RAZORPAY_KEY_ID;
      delete process.env.RAZORPAY_KEY_SECRET;
      delete process.env.RAZORPAY_WEBHOOK_SECRET;
      delete process.env.USE_MOCK_PAYMENT;
    });

    const EXPECTED_ERROR_BODY = {
      error: {
        code: 'PAYMENTS_UNAVAILABLE',
        message: 'Payments are not available yet.',
      },
    };

    it('POST /api/payments returns 503 before any DB write', async () => {
      const req = new NextRequest('http://localhost/api/payments', {
        method: 'POST',
        body: JSON.stringify({ milestone_id: '11111111-1111-4111-8111-111111111111' }),
      });
      const res = await postPayments(req);
      expect(res.status).toBe(503);
      expect(await res.json()).toEqual(EXPECTED_ERROR_BODY);
    });

    it('GET /api/payments returns 503', async () => {
      const req = new NextRequest('http://localhost/api/payments');
      const res = await getPayments(req);
      expect(res.status).toBe(503);
      expect(await res.json()).toEqual(EXPECTED_ERROR_BODY);
    });

    it('GET /api/payments/[id] returns 503', async () => {
      const req = new NextRequest('http://localhost/api/payments/pay_123');
      const res = await getPaymentById(req);
      expect(res.status).toBe(503);
      expect(await res.json()).toEqual(EXPECTED_ERROR_BODY);
    });

    it('POST /api/payments/[id]/attach returns 503 before any DB write', async () => {
      const req = new NextRequest('http://localhost/api/payments/pay_123/attach', {
        method: 'POST',
        body: JSON.stringify({ razorpay_payment_id: 'pay_abc123' }),
      });
      const res = await postAttach(req);
      expect(res.status).toBe(503);
      expect(await res.json()).toEqual(EXPECTED_ERROR_BODY);
    });

    it('POST /api/payments/[id]/confirm returns 503 before any DB write', async () => {
      const req = new NextRequest('http://localhost/api/payments/pay_123/confirm', {
        method: 'POST',
      });
      const res = await postConfirm(req);
      expect(res.status).toBe(503);
      expect(await res.json()).toEqual(EXPECTED_ERROR_BODY);
    });

    it('POST /api/payments/[id]/refund returns 503 before any DB write', async () => {
      const req = new NextRequest('http://localhost/api/payments/pay_123/refund', {
        method: 'POST',
        body: JSON.stringify({ reason: 'testing refund', speed: 'normal' }),
      });
      const res = await postRefund(req);
      expect(res.status).toBe(503);
      expect(await res.json()).toEqual(EXPECTED_ERROR_BODY);
    });

    it('POST /api/payments/[id]/release returns 503 before any DB write', async () => {
      const req = new NextRequest('http://localhost/api/payments/pay_123/release', {
        method: 'POST',
      });
      const res = await postRelease(req);
      expect(res.status).toBe(503);
      expect(await res.json()).toEqual(EXPECTED_ERROR_BODY);
    });

    it('GET /api/payments/connect returns 503 before any DB write', async () => {
      const res = await getConnect();
      expect(res.status).toBe(503);
      expect(await res.json()).toEqual(EXPECTED_ERROR_BODY);
    });

    it('POST /api/payments/connect returns 503 before any DB write', async () => {
      const req = new NextRequest('http://localhost/api/payments/connect', {
        method: 'POST',
        body: JSON.stringify({}),
      });
      const res = await postConnect(req);
      expect(res.status).toBe(503);
      expect(await res.json()).toEqual(EXPECTED_ERROR_BODY);
    });

    it('POST /api/payments/webhook returns 503 when secret is missing', async () => {
      const req = new NextRequest('http://localhost/api/payments/webhook', {
        method: 'POST',
        body: JSON.stringify({ event: 'payment.captured' }),
        headers: { 'x-razorpay-signature': 'dummy' },
      });
      const res = await postWebhook(req);
      expect(res.status).toBe(503);
      expect(await res.json()).toEqual(EXPECTED_ERROR_BODY);
    });

    it('GET /api/payouts returns 503', async () => {
      const req = new NextRequest('http://localhost/api/payouts');
      const res = await getPayouts(req);
      expect(res.status).toBe(503);
      expect(await res.json()).toEqual(EXPECTED_ERROR_BODY);
    });
  });
});
