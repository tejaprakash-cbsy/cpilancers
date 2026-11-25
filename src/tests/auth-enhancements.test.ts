import { describe, expect, it, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import {
  emailOtpSendSchema,
  emailOtpVerifySchema,
  phoneOtpSendSchema,
  phoneOtpVerifySchema,
  otpRequestSchema,
  otpVerifySchema,
  phoneSchema,
  otpTokenSchema,
} from '@/lib/validations/auth.schemas';
import {
  handleAuthCallback,
  getCallbackRedirectBase,
  sanitizeCallbackErrorMessage,
} from '@/lib/auth/callback-handler';
import { AuthService, isRateLimitError } from '@/services/auth.service';
import { POST as handleOtpRequest } from '@/app/api/auth/otp/request/route';
import { POST as handleOtpVerify } from '@/app/api/auth/otp/verify/route';

// --- Mocks for Supabase Clients ---
const mockExchangeCodeForSession = vi.fn();
const mockGetUser = vi.fn();
const mockVerifyOtp = vi.fn();
const mockSignInWithOtp = vi.fn();
const mockFrom = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() => ({
    auth: {
      exchangeCodeForSession: (...args: unknown[]) => mockExchangeCodeForSession(...args),
      getUser: (...args: unknown[]) => mockGetUser(...args),
      verifyOtp: (...args: unknown[]) => mockVerifyOtp(...args),
      signInWithOtp: (...args: unknown[]) => mockSignInWithOtp(...args),
    },
    from: (...args: unknown[]) => mockFrom(...args),
  })),
}));

const mockAdminFrom = vi.fn();
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({
    from: (...args: unknown[]) => mockAdminFrom(...args),
  })),
}));

describe('Auth Enhancements — Zod Validation Schemas', () => {
  describe('OTP Token Schema', () => {
    it('accepts exact 6-digit numeric tokens', () => {
      expect(otpTokenSchema.safeParse('123456').success).toBe(true);
      expect(otpTokenSchema.safeParse('000000').success).toBe(true);
      expect(otpTokenSchema.safeParse('999999').success).toBe(true);
    });

    it('rejects tokens that are not 6 digits', () => {
      expect(otpTokenSchema.safeParse('12345').success).toBe(false);
      expect(otpTokenSchema.safeParse('1234567').success).toBe(false);
      expect(otpTokenSchema.safeParse('').success).toBe(false);
      expect(otpTokenSchema.safeParse('abcdef').success).toBe(false);
      expect(otpTokenSchema.safeParse('12 345').success).toBe(false);
    });
  });

  describe('Phone E.164 Schema', () => {
    it('accepts valid E.164 formatted international phone numbers', () => {
      expect(phoneSchema.safeParse('+14155552671').success).toBe(true);
      expect(phoneSchema.safeParse('+919876543210').success).toBe(true);
      expect(phoneSchema.safeParse('+442071838750').success).toBe(true);
      expect(phoneSchema.safeParse('+4930123456').success).toBe(true);
    });

    it('rejects numbers missing leading + or country code starting with 0', () => {
      expect(phoneSchema.safeParse('14155552671').success).toBe(false);
      expect(phoneSchema.safeParse('9876543210').success).toBe(false);
      expect(phoneSchema.safeParse('+0123456789').success).toBe(false);
      expect(phoneSchema.safeParse('').success).toBe(false);
      expect(phoneSchema.safeParse('not-a-phone').success).toBe(false);
    });
  });

  describe('Email OTP Schemas', () => {
    it('validates emailOtpSendSchema', () => {
      expect(emailOtpSendSchema.safeParse({ email: 'user@example.com' }).success).toBe(true);
      expect(emailOtpSendSchema.safeParse({ email: 'invalid-email' }).success).toBe(false);
      expect(emailOtpSendSchema.safeParse({ email: '' }).success).toBe(false);
    });

    it('validates emailOtpVerifySchema', () => {
      expect(
        emailOtpVerifySchema.safeParse({ email: 'user@example.com', token: '123456' }).success
      ).toBe(true);
      expect(
        emailOtpVerifySchema.safeParse({ email: 'user@example.com', token: '12345' }).success
      ).toBe(false);
      expect(
        emailOtpVerifySchema.safeParse({ email: 'invalid', token: '123456' }).success
      ).toBe(false);
    });
  });

  describe('Phone OTP Schemas', () => {
    it('validates phoneOtpSendSchema', () => {
      expect(phoneOtpSendSchema.safeParse({ phone: '+14155552671' }).success).toBe(true);
      expect(phoneOtpSendSchema.safeParse({ phone: '14155552671' }).success).toBe(false);
    });

    it('validates phoneOtpVerifySchema', () => {
      expect(
        phoneOtpVerifySchema.safeParse({ phone: '+14155552671', token: '654321' }).success
      ).toBe(true);
      expect(
        phoneOtpVerifySchema.safeParse({ phone: '+14155552671', token: '12' }).success
      ).toBe(false);
    });
  });

  describe('Server API OTP Schemas', () => {
    it('validates otpRequestSchema for email and phone', () => {
      expect(otpRequestSchema.safeParse({ channel: 'email', email: 'test@example.com' }).success).toBe(true);
      expect(otpRequestSchema.safeParse({ channel: 'phone', phone: '+14155552671' }).success).toBe(true);
      expect(otpRequestSchema.safeParse({ channel: 'phone', phone: '14155552671' }).success).toBe(false);
      expect(otpRequestSchema.safeParse({ channel: 'unknown' as 'email' }).success).toBe(false);
    });

    it('validates otpVerifySchema for email and phone channels', () => {
      expect(
        otpVerifySchema.safeParse({
          channel: 'email',
          identifier: 'test@example.com',
          token: '123456',
        }).success
      ).toBe(true);

      expect(
        otpVerifySchema.safeParse({
          channel: 'phone',
          identifier: '+14155552671',
          token: '123456',
        }).success
      ).toBe(true);

      // Invalid email identifier for email channel
      expect(
        otpVerifySchema.safeParse({
          channel: 'email',
          identifier: 'not-an-email',
          token: '123456',
        }).success
      ).toBe(false);

      // Invalid phone identifier for phone channel
      expect(
        otpVerifySchema.safeParse({
          channel: 'phone',
          identifier: '14155552671',
          token: '123456',
        }).success
      ).toBe(false);
    });
  });
});

describe('Auth Enhancements — AuthService.ensureUserRecords', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('idempotently returns existing user record without inserting a new user row', async () => {
    const existing = {
      id: 'existing-id',
      email: 'existing@example.com',
      role: 'consultant',
      status: 'active',
      is_email_verified: true,
    };

    const mockSelect = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        maybeSingle: vi.fn().mockResolvedValue({ data: existing, error: null }),
      }),
    });
    mockAdminFrom.mockReturnValue({ select: mockSelect });

    const result = await AuthService.ensureUserRecords({
      id: 'existing-id',
      email: 'existing@example.com',
    });

    expect(result.isNew).toBe(false);
    expect(result.user.id).toBe('existing-id');
    expect(result.user.role).toBe('consultant');
  });

  it('strictly enforces role allowlist and REJECTS assigning admin role, defaulting to client', async () => {
    const mockSelect = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      }),
    });
    const mockInsert = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: {
            id: 'admin-attacker-id',
            email: 'attacker@example.com',
            role: 'client', // Must be client, NOT admin!
            status: 'active',
          },
          error: null,
        }),
      }),
    });

    mockAdminFrom.mockImplementation((table: string) => {
      if (table === 'users') {
        return { select: mockSelect, insert: mockInsert };
      }
      return { insert: vi.fn().mockResolvedValue({ error: null }) };
    });

    // Attacker tries to pass requestedRole: 'admin'
    const result = await AuthService.ensureUserRecords(
      {
        id: 'admin-attacker-id',
        email: 'attacker@example.com',
        user_metadata: { role: 'admin' }, // Attacker also tries via metadata
      },
      'admin'
    );

    // Role MUST be client
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'admin-attacker-id',
        role: 'client',
      })
    );
    expect(result.user.role).toBe('client');
    expect(result.user.role).not.toBe('admin');
  });

  it('assigns consultant role when explicitly requested and valid', async () => {
    const mockSelect = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      }),
    });
    const mockInsert = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: {
            id: 'consultant-id',
            email: 'consultant@example.com',
            role: 'consultant',
            status: 'active',
          },
          error: null,
        }),
      }),
    });

    mockAdminFrom.mockImplementation((table: string) => {
      if (table === 'users') {
        return { select: mockSelect, insert: mockInsert };
      }
      return { insert: vi.fn().mockResolvedValue({ error: null }) };
    });

    const result = await AuthService.ensureUserRecords(
      {
        id: 'consultant-id',
        email: 'consultant@example.com',
      },
      'consultant'
    );

    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'consultant-id',
        role: 'consultant',
      })
    );
    expect(result.user.role).toBe('consultant');
  });
});

describe('Auth Enhancements — Server API Routes (/api/auth/otp/*)', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    vi.clearAllMocks();
  });

  it('POST /api/auth/otp/request sends email OTP successfully', async () => {
    mockSignInWithOtp.mockResolvedValue({ data: {}, error: null });

    const req = new NextRequest('http://localhost:3000/api/auth/otp/request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ channel: 'email', email: 'user@example.com' }),
    });

    const res = await handleOtpRequest(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(mockSignInWithOtp).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'user@example.com' })
    );
  });

  it('POST /api/auth/otp/request blocks phone OTP with 403 when feature flag is off', async () => {
    process.env.NEXT_PUBLIC_ENABLE_PHONE_OTP = 'false';

    const req = new NextRequest('http://localhost:3000/api/auth/otp/request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ channel: 'phone', phone: '+14155552671' }),
    });

    const res = await handleOtpRequest(req);
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error.message).toContain('Phone authentication is currently disabled');
    expect(mockSignInWithOtp).not.toHaveBeenCalled();
  });

  it('POST /api/auth/otp/request maps rate-limit errors to HTTP 429', async () => {
    mockSignInWithOtp.mockResolvedValue({
      data: null,
      error: { code: 'over_email_send_rate_limit', status: 429, message: 'Rate limit exceeded' },
    });

    const req = new NextRequest('http://localhost:3000/api/auth/otp/request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ channel: 'email', email: 'spam@example.com' }),
    });

    const res = await handleOtpRequest(req);
    expect(res.status).toBe(429);
    const json = await res.json();
    expect(json.error.message).toContain('Too many verification requests');
  });

  it('POST /api/auth/otp/verify verifies token, runs ensureUserRecords, and returns user data', async () => {
    mockVerifyOtp.mockResolvedValue({
      data: {
        user: {
          id: 'verified-user-1',
          email: 'verified@example.com',
          user_metadata: {},
        },
      },
      error: null,
    });

    const mockSelect = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        maybeSingle: vi.fn().mockResolvedValue({
          data: { id: 'verified-user-1', email: 'verified@example.com', role: 'consultant' },
          error: null,
        }),
      }),
    });
    const mockUpdate = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    });

    mockAdminFrom.mockReturnValue({ select: mockSelect, update: mockUpdate });

    const req = new NextRequest('http://localhost:3000/api/auth/otp/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        channel: 'email',
        identifier: 'verified@example.com',
        token: '123456',
        role: 'consultant',
      }),
    });

    const res = await handleOtpVerify(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.user.id).toBe('verified-user-1');
    expect(json.data.user.role).toBe('consultant');
  });

  it('POST /api/auth/otp/verify returns 400 when code is invalid or expired', async () => {
    mockVerifyOtp.mockResolvedValue({
      data: { user: null },
      error: { message: 'Token has expired or is invalid' },
    });

    const req = new NextRequest('http://localhost:3000/api/auth/otp/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        channel: 'email',
        identifier: 'expired@example.com',
        token: '123456',
      }),
    });

    const res = await handleOtpVerify(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error.message).toContain('Token has expired or is invalid');
  });
});

describe('Auth Enhancements — Callback Handler & OAuth PKCE', () => {
  const LOCAL_ORIGIN = 'http://localhost:3000';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('enforces canonical production redirect base when VERCEL_ENV is production', () => {
    const originalVercelEnv = process.env.VERCEL_ENV;
    process.env.VERCEL_ENV = 'production';
    expect(getCallbackRedirectBase('http://localhost:3000/api/auth/callback')).toBe(
      'https://www.cpilancers.com'
    );
    process.env.VERCEL_ENV = originalVercelEnv;
  });

  it('exchanges code for session and invokes ensureUserRecords', async () => {
    mockExchangeCodeForSession.mockResolvedValue({
      data: {
        user: {
          id: 'user-google-pkce',
          email: 'googleuser@example.com',
        },
      },
      error: null,
    });

    const mockSelect = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        maybeSingle: vi.fn().mockResolvedValue({
          data: { id: 'user-google-pkce', role: 'client' },
        }),
      }),
    });
    const mockUpdate = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    });
    mockAdminFrom.mockReturnValue({ select: mockSelect, update: mockUpdate });

    const req = new NextRequest(
      `${LOCAL_ORIGIN}/api/auth/callback?code=valid-pkce-code&next=/dashboard/client`
    );
    const res = await handleAuthCallback(req);

    expect(mockExchangeCodeForSession).toHaveBeenCalledWith('valid-pkce-code');
    expect(res.headers.get('location')).toBe(`${LOCAL_ORIGIN}/dashboard/client`);
  });

  it('refuses open-redirect in next param and sends user to their safe role dashboard', async () => {
    mockExchangeCodeForSession.mockResolvedValue({
      data: {
        user: {
          id: 'user-google-pkce',
          email: 'googleuser@example.com',
        },
      },
      error: null,
    });

    const mockSelect = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        maybeSingle: vi.fn().mockResolvedValue({
          data: { id: 'user-google-pkce', role: 'consultant' },
        }),
      }),
    });
    const mockUpdate = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    });
    mockAdminFrom.mockReturnValue({ select: mockSelect, update: mockUpdate });

    const req = new NextRequest(
      `${LOCAL_ORIGIN}/api/auth/callback?code=valid-pkce-code&next=https://evil.example.com`
    );
    const res = await handleAuthCallback(req);

    expect(res.headers.get('location')).not.toContain('evil.example.com');
    expect(res.headers.get('location')).toBe(`${LOCAL_ORIGIN}/dashboard/consultant`);
  });

  it('sanitizes PKCE code challenge mismatch and redirects to /auth-error with user-friendly message', async () => {
    mockExchangeCodeForSession.mockResolvedValue({
      data: null,
      error: { message: 'code challenge does not match previously saved code verifier' },
    });

    const req = new NextRequest(`${LOCAL_ORIGIN}/api/auth/callback?code=mismatched-pkce-code`);
    const res = await handleAuthCallback(req);

    expect(res.headers.get('location')).toContain('/auth-error');
    // Raw technical error must NOT be in the redirect location
    expect(res.headers.get('location')).not.toContain('code+challenge+does+not+match');
    expect(res.headers.get('location')).toContain('Your+sign-in+session+expired+or+was+interrupted');
  });
});

describe('Auth Enhancements — Callback Error Sanitization Helper', () => {
  it('sanitizes PKCE and code challenge error messages', () => {
    expect(
      sanitizeCallbackErrorMessage('code challenge does not match previously saved code verifier')
    ).toBe('Your sign-in session expired or was interrupted. Please try signing in again.');

    expect(sanitizeCallbackErrorMessage('pkce verification failed')).toBe(
      'Your sign-in session expired or was interrupted. Please try signing in again.'
    );

    expect(sanitizeCallbackErrorMessage('invalid_grant: code verifier mismatch')).toBe(
      'Your sign-in session expired or was interrupted. Please try signing in again.'
    );
  });

  it('sanitizes rate limit errors in callback', () => {
    expect(sanitizeCallbackErrorMessage('rate limit exceeded')).toBe(
      'Too many sign-in attempts. Please wait a few minutes before trying again.'
    );
  });

  it('falls back safely when error message is empty', () => {
    expect(sanitizeCallbackErrorMessage(null)).toBe('Invalid or expired sign-in link or session');
  });
});

describe('Auth Enhancements — Rate Limit Detection Helper', () => {
  it('correctly detects rate limit error codes and statuses', () => {
    expect(isRateLimitError({ code: 'over_email_send_rate_limit' })).toBe(true);
    expect(isRateLimitError({ code: 'email_rate_limit_exceeded' })).toBe(true);
    expect(isRateLimitError({ code: 'over_sms_send_rate_limit' })).toBe(true);
    expect(isRateLimitError({ code: 'sms_rate_limit_exceeded' })).toBe(true);
    expect(isRateLimitError({ status: 429 })).toBe(true);
    expect(isRateLimitError({ message: 'too many requests' })).toBe(true);
    expect(isRateLimitError({ message: 'For security purposes, you can only request this once every 60 seconds.' })).toBe(true);
    expect(isRateLimitError({ code: 'invalid_credentials', status: 400 })).toBe(false);
    expect(isRateLimitError(null)).toBe(false);
  });
});
