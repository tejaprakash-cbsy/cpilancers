/**
 * Authentication regression tests.
 *
 * Covers the gaps left by `login-route.test.ts` (the login route's returned
 * role) and `auth-validation.test.ts` (Zod schemas):
 *
 *   - logout
 *   - protected-route enforcement in `proxy.ts`, including BOTH dashboards
 *   - the forgot-password flow
 *   - post-login redirect safety
 *
 * `proxy.ts` is the real gate: it decides whether a signed-out visitor is turned
 * away before any route handler runs. Both dashboards were once missing from its
 * protected list and were reachable while signed out, so they are pinned here.
 */

import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { NextResponse, NextRequest } from 'next/server';

const mockUpdateSession = vi.fn();
const mockLogout = vi.fn();
const mockSendPasswordResetEmail = vi.fn();
const mockUpdatePassword = vi.fn();

vi.mock('@/lib/supabase/middleware', () => ({
  updateSession: (...args: unknown[]) => mockUpdateSession(...args),
}));

vi.mock('@/services/auth.service', () => ({
  AuthService: {
    logout: (...args: unknown[]) => mockLogout(...args),
    getCurrentUser: () => Promise.resolve(null),
    sendPasswordResetEmail: (...args: unknown[]) => mockSendPasswordResetEmail(...args),
    updatePassword: (...args: unknown[]) => mockUpdatePassword(...args),
  },
}));

import { POST as LOGOUT_POST } from '@/app/api/auth/logout/route';
import { POST as RESET_POST } from '@/app/api/auth/reset-password/route';
import { proxy } from '@/proxy';
import { isSafeNextPath, resolvePostLoginPath, roleHomePath } from '@/lib/auth/role-redirects';

const ORIGIN = 'http://localhost:3000';
const USER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

function request(path: string): NextRequest {
  return new NextRequest(ORIGIN + path);
}

/** A response shaped like the one `updateSession` actually returns. */
function sessionResponse(signedIn: boolean): NextResponse {
  const res = NextResponse.next();
  if (signedIn) res.headers.set('x-user-id', USER_ID);
  return res;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockUpdateSession.mockResolvedValue(sessionResponse(false));
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
describe('logout', () => {
  it('calls AuthService.logout and answers 200', async () => {
    mockLogout.mockResolvedValue(undefined);

    const res = await LOGOUT_POST();

    expect(res.status).toBe(200);
    expect(mockLogout).toHaveBeenCalledTimes(1);
    expect(await res.json()).toEqual({ success: true, data: { message: 'Logout successful' } });
  });

  it('does not report success when logout fails', async () => {
    mockLogout.mockRejectedValue(new Error('sign-out failed'));

    const res = await LOGOUT_POST();

    const body = await res.json();
    expect(body.success).toBe(false);
    expect(res.ok).toBe(false);
  });

  it('takes no request argument -- logout is driven by the cookie, not a body', () => {
    expect(LOGOUT_POST.length).toBe(0);
  });
// ---------------------------------------------------------------------------
describe('protected routes in proxy.ts', () => {
  const PROTECTED = [
    '/dashboard/client',
    '/dashboard/consultant',
    '/profile',
    '/profile/edit',
    '/messages',
    '/proposals',
    '/contracts',
    '/jobs/create',
  ];

  for (const path of PROTECTED) {
    it('redirects a signed-out visitor away from ' + path, async () => {
      mockUpdateSession.mockResolvedValue(sessionResponse(false));

      const res = await proxy(request(path));

      expect(res.status).toBe(307);
      const location = res.headers.get('location') || '';
      expect(location).toContain('/login');
      // The deep link is preserved so sign-in can return the user to it.
      expect(new URL(location, ORIGIN).searchParams.get('next')).toBe(path);
    });

    it('lets a signed-in user through to ' + path, async () => {
      mockUpdateSession.mockResolvedValue(sessionResponse(true));

      const res = await proxy(request(path));

      expect(res.status).toBe(200);
      expect(res.headers.get('location')).toBeNull();
    });
  }

  it('redirects to /login, not /register, for a protected page', async () => {
    // Someone asking for a protected page already has an account. Bouncing them
    // to the sign-up form was a real regression.
    mockUpdateSession.mockResolvedValue(sessionResponse(false));

    const res = await proxy(request('/dashboard/client'));

    expect(res.headers.get('location')).toContain('/login');
    expect(res.headers.get('location')).not.toContain('/register');
  });

  it('does not redirect public pages while signed out', async () => {
    for (const path of ['/', '/jobs', '/consultants', '/login', '/register']) {
      mockUpdateSession.mockResolvedValue(sessionResponse(false));
      const res = await proxy(request(path));
      expect(res.status).toBe(200);
      expect(res.headers.get('location')).toBeNull();
    }
  });

  it('does not treat a public job detail page as protected', async () => {
    // `/jobs/<id>` is public; only `/jobs/create` and `/jobs/<id>/(edit|proposals)`
    // need a session. A too-broad pattern locks anonymous visitors out of the
    // whole marketplace.
    mockUpdateSession.mockResolvedValue(sessionResponse(false));
    const res = await proxy(request('/jobs/some-id'));
    expect(res.status).toBe(200);
  });

  it('protects the job edit and job proposals sub-paths', async () => {
    for (const path of ['/jobs/abc/edit', '/jobs/abc/proposals']) {
      mockUpdateSession.mockResolvedValue(sessionResponse(false));
      const res = await proxy(request(path));
      expect(res.status).toBe(307);
      expect(res.headers.get('location')).toContain('/login');
    }
  });

  it('turns away an unauthenticated /admin visitor', async () => {
    mockUpdateSession.mockResolvedValue(sessionResponse(false));
    const res = await proxy(request('/admin'));
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toContain('/login');
  });

  it('passes a signed-in non-admin through to be rejected by the service', async () => {
    // The proxy redirect is convenience only. Authorization is re-read from the
    // database on every admin request, so the proxy must NOT be the enforcement
    // point for admin access.
    mockUpdateSession.mockResolvedValue(sessionResponse(true));
    const res = await proxy(request('/admin'));
    expect(res.status).toBe(200);
  });
});
// ---------------------------------------------------------------------------
describe('forgot-password flow', () => {
  function resetRequest(body: unknown, action: string) {
    return new NextRequest(ORIGIN + '/api/auth/reset-password?action=' + action, {
      method: 'POST',
      body: JSON.stringify(body),
      headers: { 'content-type': 'application/json' },
    });
  }

  it('accepts a reset request for a valid email', async () => {
    mockSendPasswordResetEmail.mockResolvedValue(undefined);

    const res = await RESET_POST(resetRequest({ email: 'qa@example.test' }, 'send'));

    expect(res.status).toBe(200);
    expect(mockSendPasswordResetEmail).toHaveBeenCalledWith('qa@example.test');
  });

  it('answers with neutral copy that does not disclose account existence', async () => {
    mockSendPasswordResetEmail.mockResolvedValue(undefined);

    const body = await (await RESET_POST(resetRequest({ email: 'qa@example.test' }, 'send'))).json();

    const text = JSON.stringify(body).toLowerCase();
    expect(text).not.toContain('not found');
    expect(text).not.toContain('no account');
    expect(text).not.toContain('does not exist');
  });

  it('rejects a malformed email without calling the service', async () => {
    const bad: unknown[] = ['', 'not-an-email', 'a@', '@b.com', 42, null];
    for (const email of bad) {
      mockSendPasswordResetEmail.mockClear();
      const res = await RESET_POST(resetRequest({ email }, 'send'));
      expect(res.status).toBe(400);
      expect(mockSendPasswordResetEmail).not.toHaveBeenCalled();
    }
  });

  it('rejects an unknown action', async () => {
    const res = await RESET_POST(resetRequest({ email: 'qa@example.test' }, 'explode'));
    expect(res.status).toBe(400);
    expect(mockSendPasswordResetEmail).not.toHaveBeenCalled();
  });

  it('updates the password on action=reset', async () => {
    mockUpdatePassword.mockResolvedValue(undefined);

    // `resetPasswordSchema` requires BOTH `password` and a matching
    // `confirmPassword`. Omitting the confirmation is a 400, not a success.
    const res = await RESET_POST(
      resetRequest(
        { password: 'N3w-Strong-Passphrase!', confirmPassword: 'N3w-Strong-Passphrase!' },
        'reset'
      )
    );

    expect(res.status).toBe(200);
    expect(mockUpdatePassword).toHaveBeenCalledWith('N3w-Strong-Passphrase!');
  });

  it('rejects a mismatched password confirmation', async () => {
    mockUpdatePassword.mockClear();

    const res = await RESET_POST(
      resetRequest({ password: 'N3w-Strong-Passphrase!', confirmPassword: 'Something-Else!1' }, 'reset')
    );

    expect(res.status).toBe(400);
    expect(mockUpdatePassword).not.toHaveBeenCalled();
  });

  it('rejects a missing password confirmation', async () => {
    mockUpdatePassword.mockClear();

    const res = await RESET_POST(resetRequest({ password: 'N3w-Strong-Passphrase!' }, 'reset'));

    expect(res.status).toBe(400);
    expect(mockUpdatePassword).not.toHaveBeenCalled();
  });

  it('rejects a weak new password without calling the service', async () => {
    for (const password of ['', 'short', '12345678']) {
      mockUpdatePassword.mockClear();
      const res = await RESET_POST(
        resetRequest({ password: password, confirmPassword: password }, 'reset')
      );
      expect(res.status).toBe(400);
      expect(mockUpdatePassword).not.toHaveBeenCalled();
    }
  });
});

// ---------------------------------------------------------------------------
describe('post-login redirect safety', () => {
  it('routes each role to its own dashboard', () => {
    expect(roleHomePath('client')).toBe('/dashboard/client');
    expect(roleHomePath('consultant')).toBe('/dashboard/consultant');
  });

  it('falls back to the default home when the role is unknown or absent', () => {
    expect(roleHomePath(null)).toBe('/dashboard/client');
    expect(roleHomePath(undefined)).toBe('/dashboard/client');
  });

  it('honours a safe relative ?next=', () => {
    expect(resolvePostLoginPath('client', '/jobs/abc')).toBe('/jobs/abc');
  });

  it('rejects an absolute or protocol-relative ?next= (open redirect)', () => {
    const bad = ['https://evil.com', '//evil.com', 'http://evil.com', 'javascript:alert(1)'];
    for (const candidate of bad) {
      expect(isSafeNextPath(candidate)).toBe(false);
      expect(resolvePostLoginPath('client', candidate)).toBe('/dashboard/client');
    }
  });

  it('rejects a ?next= carrying control characters', () => {
    expect(isSafeNextPath('/jobs\nSet-Cookie: a=b')).toBe(false);
    expect(isSafeNextPath('/jobs ')).toBe(true);
  });
});
});