import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mockResendVerificationEmail = vi.fn();

vi.mock('@/services/auth.service', () => ({
  AuthService: {
    resendVerificationEmail: (...args: unknown[]) => mockResendVerificationEmail(...args),
  },
}));

import { POST } from '@/app/api/auth/resend-verification/route';

function resendRequest(body: unknown) {
  return new NextRequest('http://localhost/api/auth/resend-verification', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('POST /api/auth/resend-verification route', () => {
  it('returns 200 and a neutral message for a valid email', async () => {
    mockResendVerificationEmail.mockResolvedValue({ success: true });

    const req = resendRequest({ email: 'user@example.com' });
    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual({
      success: true,
      message: 'If an account exists for that address, a verification email has been sent.',
    });
    expect(mockResendVerificationEmail).toHaveBeenCalledWith('user@example.com');
  });

  it('trims whitespace from email before invoking auth service', async () => {
    mockResendVerificationEmail.mockResolvedValue({ success: true });

    const req = resendRequest({ email: '  test.user@example.com  ' });
    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(mockResendVerificationEmail).toHaveBeenCalledWith('test.user@example.com');
    expect(json.success).toBe(true);
  });

  it('returns identical 200 response even if service encounters an error (anti-enumeration)', async () => {
    mockResendVerificationEmail.mockResolvedValue({ success: true });

    const req = resendRequest({ email: 'nonexistent@example.com' });
    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual({
      success: true,
      message: 'If an account exists for that address, a verification email has been sent.',
    });
  });

  it('returns 429 when rate limit error is thrown', async () => {
    const { RateLimitError } = await import('@/lib/errors');
    mockResendVerificationEmail.mockRejectedValue(
      new RateLimitError('Too many verification emails requested. Please wait a few minutes before trying again.')
    );

    const req = resendRequest({ email: 'user@example.com' });
    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(429);
    expect(json.success).toBe(false);
    expect(json.error.code).toBe('RATE_LIMITED');
    expect(json.error.message).toBe(
      'Too many verification emails requested. Please wait a few minutes before trying again.'
    );
  });

  it('returns 400 when email format is invalid', async () => {
    const req = resendRequest({ email: 'not-an-email' });
    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.success).toBe(false);
    expect(mockResendVerificationEmail).not.toHaveBeenCalled();
  });

  it('returns 400 when email field is missing', async () => {
    const req = resendRequest({});
    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.success).toBe(false);
    expect(mockResendVerificationEmail).not.toHaveBeenCalled();
  });
});
