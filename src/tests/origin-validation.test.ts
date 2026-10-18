import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { evaluateOrigin, isUnsafeMethod, trustedOrigin } from '@/lib/security/origin';

/**
 * F-04 regression guard for the Origin decision table.
 *
 * These assertions pin the two properties the finding depends on: an absent
 * Origin is allowed (so server-to-server callers keep working), and a present
 * Origin must match the configured application origin exactly.
 */
const ORIGINAL = process.env.NEXT_PUBLIC_APP_URL;

beforeEach(() => {
  process.env.NEXT_PUBLIC_APP_URL = 'https://cpilancers.com';
});
afterEach(() => {
  process.env.NEXT_PUBLIC_APP_URL = ORIGINAL;
});

describe('F-04 unsafe methods', () => {
  it('treats POST, PUT, PATCH and DELETE as state-changing', () => {
    expect(['POST', 'PUT', 'PATCH', 'DELETE'].every(isUnsafeMethod)).toBe(true);
  });

  it('leaves safe methods alone', () => {
    expect(['GET', 'HEAD', 'OPTIONS'].some(isUnsafeMethod)).toBe(false);
  });
});

describe('F-04 Origin absent', () => {
  it('allows every unsafe method when no Origin header is sent', () => {
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      expect(evaluateOrigin(method, '/api/profile', null)).toEqual({
        allow: true,
        reason: 'origin-absent',
      });
    }
  });
});

describe('F-04 Origin present', () => {
  it('accepts the exact configured origin', () => {
    expect(evaluateOrigin('POST', '/api/profile', 'https://cpilancers.com')).toEqual({
      allow: true,
      reason: 'origin-trusted',
    });
  });

  it('normalizes host case and a default port', () => {
    expect(evaluateOrigin('POST', '/api/profile', 'HTTPS://CPILANCERS.COM').allow).toBe(true);
    expect(evaluateOrigin('POST', '/api/profile', 'https://cpilancers.com:443').allow).toBe(true);
  });

  it('rejects the opaque origin "null"', () => {
    expect(evaluateOrigin('POST', '/api/profile', 'null').allow).toBe(false);
  });

  it('rejects a malformed origin', () => {
    expect(evaluateOrigin('POST', '/api/profile', 'not a url').allow).toBe(false);
  });

  it('rejects suffix and substring look-alikes', () => {
    // A substring or endsWith comparison would wrongly accept all of these.
    for (const hostile of [
      'https://evil.example',
      'https://cpilancers.com.evil.example',
      'https://evil-cpilancers.com',
      'https://cpilancers.com.attacker.net',
      'http://cpilancers.com',
    ]) {
      expect(evaluateOrigin('POST', '/api/profile', hostile).allow).toBe(false);
    }
  });

  it('rejects a different port', () => {
    expect(evaluateOrigin('POST', '/api/profile', 'https://cpilancers.com:8443').allow).toBe(false);
  });
});

describe('F-04 safe methods and exemptions', () => {
  it('never blocks GET, HEAD or OPTIONS regardless of Origin', () => {
    for (const method of ['GET', 'HEAD', 'OPTIONS']) {
      expect(evaluateOrigin(method, '/api/profile', 'https://evil.example').allow).toBe(true);
    }
  });

  it('exempts the payment webhook so signature verification stays authoritative', () => {
    expect(evaluateOrigin('POST', '/api/payments/webhook', 'https://razorpay.example').allow).toBe(true);
  });

  it('does not exempt a path that merely starts with the webhook prefix', () => {
    expect(evaluateOrigin('POST', '/api/payments/webhook-evil', 'https://evil.example').allow).toBe(
      false
    );
  });
});

describe('F-04 fail-closed behaviour', () => {
  it('refuses a state-changing request when no trusted origin is configured', () => {
    delete process.env.NEXT_PUBLIC_APP_URL;
    expect(trustedOrigin()).toBeNull();
    expect(evaluateOrigin('POST', '/api/profile', 'https://evil.example')).toEqual({
      allow: false,
      reason: 'origin-unconfigured',
    });
  });

  it('still allows an Origin-less request when nothing is configured', () => {
    delete process.env.NEXT_PUBLIC_APP_URL;
    expect(evaluateOrigin('POST', '/api/profile', null).allow).toBe(true);
  });
});

describe('Same-origin requests & Vercel deployment support', () => {
  it('accepts legitimate same-origin requests where Origin matches request destination', () => {
    expect(
      evaluateOrigin(
        'POST',
        '/api/auth/register',
        'https://sap-integration-marketplace.vercel.app',
        'https://sap-integration-marketplace.vercel.app'
      )
    ).toEqual({
      allow: true,
      reason: 'origin-trusted',
    });
  });

  it('rejects cross-origin requests even when requestOrigin is provided', () => {
    expect(
      evaluateOrigin(
        'POST',
        '/api/auth/register',
        'https://evil.example',
        'https://sap-integration-marketplace.vercel.app'
      )
    ).toEqual({
      allow: false,
      reason: 'origin-untrusted',
    });
  });

  it('accepts Vercel deployment URLs from platform environment variables', () => {
    const originalVercel = process.env.VERCEL_PROJECT_PRODUCTION_URL;
    try {
      process.env.VERCEL_PROJECT_PRODUCTION_URL = 'my-app.vercel.app';
      expect(
        evaluateOrigin('POST', '/api/auth/register', 'https://my-app.vercel.app')
      ).toEqual({
        allow: true,
        reason: 'origin-trusted',
      });
    } finally {
      if (originalVercel !== undefined) {
        process.env.VERCEL_PROJECT_PRODUCTION_URL = originalVercel;
      } else {
        delete process.env.VERCEL_PROJECT_PRODUCTION_URL;
      }
    }
  });

  it('supports comma-separated NEXT_PUBLIC_APP_URL origins', () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://cpilancers.com, https://preview.cpilancers.com';
    expect(
      evaluateOrigin('POST', '/api/profile', 'https://preview.cpilancers.com')
    ).toEqual({
      allow: true,
      reason: 'origin-trusted',
    });
  });

  it('supports ALLOWED_ORIGINS comma-separated configuration', () => {
    process.env.ALLOWED_ORIGINS = 'https://admin.cpilancers.com, https://partner.cpilancers.com';
    try {
      expect(
        evaluateOrigin('POST', '/api/profile', 'https://admin.cpilancers.com')
      ).toEqual({
        allow: true,
        reason: 'origin-trusted',
      });
    } finally {
      delete process.env.ALLOWED_ORIGINS;
    }
  });
});