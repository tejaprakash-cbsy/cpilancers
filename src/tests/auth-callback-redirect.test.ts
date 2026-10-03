import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * RS-01 regression guard for the redirect destination used by
 * `GET /api/auth/callback`.
 *
 * Two layers are covered:
 *
 *  1. `safeCallbackRedirect` — the decision itself, exhaustively.
 *  2. The exported `GET` handler — driven end to end through the real Supabase
 *     code path, asserting on the `Location` header the browser would actually
 *     follow. The Supabase client is mocked so OTP verification can succeed
 *     deterministically; the redirect logic under test is NOT mocked away.
 *     Test 8 asserts that a FAILED verification still takes the error branch,
 *     which is the property proving the fix did not bypass or replace token
 *     verification.
 */

const ORIGIN = 'http://localhost:3000';
const CALLBACK = `${ORIGIN}/api/auth/callback`;

// --- Supabase test seam ------------------------------------------------------
const mockVerifyOtp = vi.fn();
const mockGetUser = vi.fn();
const mockUpdate = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({
    auth: {
      verifyOtp: (...a: unknown[]) => mockVerifyOtp(...a),
      getUser: (...a: unknown[]) => mockGetUser(...a),
    },
    from: () => ({ update: () => ({ eq: (...a: unknown[]) => mockUpdate(...a) }) }),
  }),
}));

import { GET, safeCallbackRedirect, DEFAULT_REDIRECT } from '@/app/api/auth/callback/route';

function request(params: Record<string, string>): NextRequest {
  const qs = new URLSearchParams(params).toString();
  return new NextRequest(`${CALLBACK}?${qs}`);
}

/** The absolute URL the response would send the browser to. */
function locationOf(res: Response): string {
  return res.headers.get('location') ?? '';
}

/** Origin the `Location` header points at, resolving relative locations. */
function originOf(res: Response): string | null {
  try {
    return new URL(locationOf(res), CALLBACK).origin;
  } catch {
    return null;
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  mockVerifyOtp.mockResolvedValue({ error: null });
  mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
  mockUpdate.mockResolvedValue({ error: null });
});

// ---------------------------------------------------------------------------
describe('RS-01 safeCallbackRedirect — legitimate internal paths', () => {
  it('keeps a normal internal path', () => {
    expect(safeCallbackRedirect('/dashboard', CALLBACK)).toBe('/dashboard');
  });

  it('preserves query and fragment on an internal path', () => {
    expect(safeCallbackRedirect('/jobs/42?tab=bids#top', CALLBACK)).toBe('/jobs/42?tab=bids#top');
  });

  it('keeps a nested internal path', () => {
    expect(safeCallbackRedirect('/dashboard/client', CALLBACK)).toBe('/dashboard/client');
  });

  it('falls back to "/" when next is missing or empty', () => {
    expect(safeCallbackRedirect(null, CALLBACK)).toBe('/');
    expect(safeCallbackRedirect(undefined, CALLBACK)).toBe('/');
    expect(safeCallbackRedirect('', CALLBACK)).toBe('/');
  });
});

describe('RS-01 safeCallbackRedirect — external destinations are refused', () => {
  const hostile = [
    'https://evil.example',
    'http://evil.example',
    '//evil.example',
    'https://cpilancers.com.evil.example',
    'https://evil-cpilancers.com',
    'javascript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'mailto:a@b.example',
  ];

  for (const value of hostile) {
    it(`refuses ${JSON.stringify(value)}`, () => {
      expect(safeCallbackRedirect(value, CALLBACK)).toBe(DEFAULT_REDIRECT);
    });
  }
});

describe('RS-01 safeCallbackRedirect — backslash and parser edge cases', () => {
  // These are the inputs a `startsWith('/') && !startsWith('//')` guard accepts
  // but which WHATWG URL parsing sends to the attacker's origin.
  const backslash = ['/\\evil.example', '/\\/evil.example', '/\\evil.example/path'];

  for (const value of backslash) {
    it(`refuses the backslash form ${JSON.stringify(value)}`, () => {
      expect(safeCallbackRedirect(value, CALLBACK)).toBe(DEFAULT_REDIRECT);
      // Prove the parser really does send this off-origin, so the test fails if
      // someone "simplifies" the implementation back to a prefix check.
      expect(new URL(value, CALLBACK).origin).not.toBe(new URL(CALLBACK).origin);
    });
  }

  it('normalises a same-origin absolute URL down to its path', () => {
    // Not an escape: the value genuinely resolves to our own origin. The helper
    // returns only the path component, so the emitted redirect can never be an
    // absolute URL supplied by the caller.
    expect(safeCallbackRedirect(`${ORIGIN}/dashboard`, CALLBACK)).toBe('/dashboard');
  });

  it('refuses a malformed value without throwing', () => {
    expect(safeCallbackRedirect('http://', CALLBACK)).toBe(DEFAULT_REDIRECT);
    expect(() => safeCallbackRedirect('::::', CALLBACK)).not.toThrow();
  });

  it('neutralises control characters rather than letting them reach a header', () => {
    // WHATWG URL parsing strips CR/LF/TAB, so the value cannot break out of the
    // Location header. It stays same-origin and loses its control bytes.
    const out = safeCallbackRedirect('/dashboard\r\nSet-Cookie: a=b', CALLBACK);
    expect(out).not.toContain('\r');
    expect(out).not.toContain('\n');
    expect(new URL(out, CALLBACK).origin).toBe(new URL(CALLBACK).origin);
  });

  it('does not treat a different port as same-origin', () => {
    expect(safeCallbackRedirect('//localhost:8443/x', CALLBACK)).toBe(DEFAULT_REDIRECT);
  });
});

// ---------------------------------------------------------------------------
describe('RS-01 GET /api/auth/callback — end-to-end redirect behaviour', () => {
  it('1. continues to an internal path after a successful verification', async () => {
    const res = await GET(request({ next: '/dashboard', type: 'email', token_hash: 'good' }));
    expect(locationOf(res)).toBe(`${ORIGIN}/dashboard`);
    expect(res.status).toBe(307);
  });

  it('2. defaults to "/" when next is absent', async () => {
    const res = await GET(request({ type: 'email', token_hash: 'good' }));
    expect(locationOf(res)).toBe(`${ORIGIN}/`);
  });

  it('3. never redirects to an https external origin', async () => {
    const res = await GET(
      request({ next: 'https://evil.example', type: 'email', token_hash: 'good' })
    );
    expect(locationOf(res)).not.toContain('evil.example');
    expect(originOf(res)).toBe(ORIGIN);
    expect(locationOf(res)).toBe(`${ORIGIN}/`);
  });

  it('4. never redirects to an http external origin', async () => {
    const res = await GET(
      request({ next: 'http://evil.example', type: 'email', token_hash: 'good' })
    );
    expect(originOf(res)).toBe(ORIGIN);
    expect(locationOf(res)).toBe(`${ORIGIN}/`);
  });

  it('5. never follows a protocol-relative destination', async () => {
    const res = await GET(request({ next: '//evil.example', type: 'email', token_hash: 'good' }));
    expect(originOf(res)).toBe(ORIGIN);
    expect(locationOf(res)).toBe(`${ORIGIN}/`);
  });

  it('6. never follows a backslash-obfuscated destination', async () => {
    const res = await GET(request({ next: '/\\evil.example', type: 'email', token_hash: 'good' }));
    expect(originOf(res)).toBe(ORIGIN);
    expect(locationOf(res)).toBe(`${ORIGIN}/`);
  });

  it('7. falls back safely on malformed input without throwing', async () => {
    await expect(
      GET(request({ next: 'http://', type: 'email', token_hash: 'good' }))
    ).resolves.toBeDefined();
    const res = await GET(request({ next: 'http://', type: 'email', token_hash: 'good' }));
    expect(originOf(res)).toBe(ORIGIN);
  });

  it('8. does NOT bypass token verification', async () => {
    // Verification fails => the error branch must run and `next` must be ignored
    // entirely. If the redirect fix had short-circuited the auth flow, this
    // would land on /dashboard instead of the error page.
    mockVerifyOtp.mockResolvedValue({ error: new Error('invalid token') });
    const res = await GET(request({ next: '/dashboard', type: 'email', token_hash: 'bad' }));
    expect(locationOf(res)).toContain('/auth/auth-error');
    expect(mockGetUser).not.toHaveBeenCalled();
  });

  it('9. verification still runs before any redirect decision is acted on', async () => {
    await GET(request({ next: '/dashboard', type: 'email', token_hash: 'good' }));
    expect(mockVerifyOtp).toHaveBeenCalledWith({
      type: 'email',
      token_hash: 'good',
    });
  });

  it('10. preserves the recovery redirect to /auth/reset-password', async () => {
    const res = await GET(
      request({ next: 'https://evil.example', type: 'recovery', token_hash: 'good' })
    );
    expect(locationOf(res)).toBe(`${ORIGIN}/auth/reset-password`);
  });

  it('11. still marks the email verified on the success path', async () => {
    await GET(request({ next: '/dashboard', type: 'email', token_hash: 'good' }));
    expect(mockUpdate).toHaveBeenCalledTimes(1);
  });
});