import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { RateLimitError, formatErrorResponse } from '@/lib/errors';
import { GET as callbackGET } from '@/app/api/auth/callback/route';

const mockExchangeCodeForSession = vi.fn();
const mockVerifyOtp = vi.fn();
const mockGetUser = vi.fn();
const mockUpdate = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({
    auth: {
      exchangeCodeForSession: (...args: unknown[]) => mockExchangeCodeForSession(...args),
      verifyOtp: (...args: unknown[]) => mockVerifyOtp(...args),
      getUser: (...args: unknown[]) => mockGetUser(...args),
    },
    from: () => ({
      update: () => ({
        eq: (...args: unknown[]) => mockUpdate(...args),
      }),
    }),
  }),
}));

describe('RateLimitError and formatErrorResponse', () => {
  it('instantiates RateLimitError with code RATE_LIMITED and status 429', () => {
    const err = new RateLimitError();
    expect(err.statusCode).toBe(429);
    expect(err.code).toBe('RATE_LIMITED');
    expect(err.message).toBe(
      'Too many verification emails requested. Please wait a few minutes before trying again.'
    );
  });

  it('formats RateLimitError to HTTP 429 with user-friendly message', () => {
    const err = new RateLimitError();
    const formatted = formatErrorResponse(err);
    expect(formatted.statusCode).toBe(429);
    expect(formatted.success).toBe(false);
    expect(formatted.error.code).toBe('RATE_LIMITED');
    expect(formatted.error.message).toBe(
      'Too many verification emails requested. Please wait a few minutes before trying again.'
    );
  });
});

describe('GET /api/auth/callback enhancements', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockExchangeCodeForSession.mockResolvedValue({ error: null });
    mockVerifyOtp.mockResolvedValue({ error: null });
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u-1' } } });
    mockUpdate.mockResolvedValue({ error: null });
  });

  it('exchanges OAuth/PKCE authorization code for session and redirects to next', async () => {
    const req = new NextRequest('http://localhost:3000/api/auth/callback?code=oauth-auth-code&next=/dashboard');
    const res = await callbackGET(req);
    expect(mockExchangeCodeForSession).toHaveBeenCalledWith('oauth-auth-code');
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toBe('http://localhost:3000/dashboard');
  });

  it('redirects recovery token verification to /auth/reset-password', async () => {
    const req = new NextRequest(
      'http://localhost:3000/api/auth/callback?token_hash=good_hash&type=recovery'
    );
    const res = await callbackGET(req);
    expect(mockVerifyOtp).toHaveBeenCalledWith({
      type: 'recovery',
      token_hash: 'good_hash',
    });
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toBe('http://localhost:3000/auth/reset-password');
  });

  it('redirects strictly to https://www.cpilancers.com when VERCEL_ENV is production', async () => {
    const origVercelEnv = process.env.VERCEL_ENV;
    process.env.VERCEL_ENV = 'production';

    try {
      const req = new NextRequest(
        'https://preview-cpilancers.vercel.app/api/auth/callback?token_hash=good_hash&type=email&next=/dashboard/consultant'
      );
      const res = await callbackGET(req);
      expect(res.status).toBe(307);
      expect(res.headers.get('location')).toBe('https://www.cpilancers.com/dashboard/consultant');
    } finally {
      process.env.VERCEL_ENV = origVercelEnv;
    }
  });
});
