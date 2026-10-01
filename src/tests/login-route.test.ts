import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { resolvePostLoginPath } from '@/lib/auth/role-redirects';
import type { UserRole } from '@/types/database';

/**
 * Route-level regression tests for `POST /api/auth/login`.
 *
 * The sign-in form hardcoded `/dashboard/client`, so a consultant who signed in
 * successfully was pushed onto the client dashboard. The form can only route on
 * the real role if the login response carries it, so these tests assert the
 * contract the form depends on: `data.user.role` must be the role read from
 * `public.users`, and it must degrade to `null` rather than failing the sign-in
 * when that lookup fails.
 */

const mockLogin = vi.fn();
const mockGetCurrentUser = vi.fn();

vi.mock('@/services/auth.service', () => ({
  AuthService: {
    login: (...args: unknown[]) => mockLogin(...args),
    getCurrentUser: (...args: unknown[]) => mockGetCurrentUser(...args),
  },
}));

import { POST } from '@/app/api/auth/login/route';

const USER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const EMAIL = 'consultant@example.com';

function loginRequest(body: unknown) {
  return new NextRequest('http://localhost/api/auth/login', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

const VALID_BODY = { email: EMAIL, password: 'correct horse battery staple' };

beforeEach(() => {
  vi.clearAllMocks();
  mockLogin.mockResolvedValue({
    user: { id: USER_ID, email: EMAIL },
    session: { access_token: 'token' },
  });
});

describe('POST /api/auth/login returns the role the form routes on', () => {
  it('returns role "consultant" for a consultant', async () => {
    mockGetCurrentUser.mockResolvedValue({ id: USER_ID, email: EMAIL, role: 'consultant' });

    const res = await POST(loginRequest(VALID_BODY));
    const body = (await res.json()) as {
      success: boolean;
      data: { user: { id: string; email: string; role: UserRole | null } };
    };

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.user.role).toBe('consultant');
    // The form's decision, driven by this payload.
    expect(resolvePostLoginPath(body.data.user.role)).toBe('/dashboard/consultant');
  });

  it('returns role "client" for a client', async () => {
    mockGetCurrentUser.mockResolvedValue({ id: USER_ID, email: EMAIL, role: 'client' });

    const res = await POST(loginRequest(VALID_BODY));
    const body = (await res.json()) as { data: { user: { role: UserRole | null } } };

    expect(res.status).toBe(200);
    expect(body.data.user.role).toBe('client');
    expect(resolvePostLoginPath(body.data.user.role)).toBe('/dashboard/client');
  });

  it('returns role "admin" for an admin', async () => {
    mockGetCurrentUser.mockResolvedValue({ id: USER_ID, email: EMAIL, role: 'admin' });

    const res = await POST(loginRequest(VALID_BODY));
    const body = (await res.json()) as { data: { user: { role: UserRole | null } } };

    expect(body.data.user.role).toBe('admin');
  });

  it('still returns id and email alongside the role', async () => {
    mockGetCurrentUser.mockResolvedValue({ id: USER_ID, email: EMAIL, role: 'consultant' });

    const res = await POST(loginRequest(VALID_BODY));
    const body = (await res.json()) as { data: { user: Record<string, unknown> } };

    expect(body.data.user).toMatchObject({ id: USER_ID, email: EMAIL });
  });

  it('does not leak the password back to the client', async () => {
    mockGetCurrentUser.mockResolvedValue({ id: USER_ID, email: EMAIL, role: 'consultant' });

    const res = await POST(loginRequest(VALID_BODY));
    const raw = JSON.stringify(await res.json());

    expect(raw).not.toContain('correct horse battery staple');
    expect(raw).not.toContain('session');
  });
});

describe('POST /api/auth/login degrades gracefully when the role lookup fails', () => {
  it('completes the sign-in with role null when getCurrentUser throws', async () => {
    mockGetCurrentUser.mockRejectedValue(new Error('users table unreachable'));

    const res = await POST(loginRequest(VALID_BODY));
    const body = (await res.json()) as {
      success: boolean;
      data: { user: { id: string; role: UserRole | null } };
    };

    // A failed profile lookup must not turn a valid sign-in into a 500.
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.user.role).toBeNull();
    expect(resolvePostLoginPath(body.data.user.role)).toBe('/dashboard/client');
  });

  it('completes the sign-in with role null when no profile row exists', async () => {
    mockGetCurrentUser.mockResolvedValue(null);

    const res = await POST(loginRequest(VALID_BODY));
    const body = (await res.json()) as { data: { user: { role: UserRole | null } } };

    expect(res.status).toBe(200);
    expect(body.data.user.role).toBeNull();
  });
});

describe('POST /api/auth/login rejects bad credentials', () => {
  it('returns 401 when AuthService reports invalid credentials', async () => {
    const { UnauthorizedError } = await import('@/lib/errors');
    mockLogin.mockRejectedValue(new UnauthorizedError('Invalid email or password.'));

    const res = await POST(loginRequest(VALID_BODY));
    const body = (await res.json()) as { success: boolean; error: { message: string } };

    expect(res.status).toBe(401);
    expect(body.success).toBe(false);
    expect(body.error.message).toBe('Invalid email or password.');
  });

  it('does not resolve a role when authentication itself failed', async () => {
    const { UnauthorizedError } = await import('@/lib/errors');
    mockLogin.mockRejectedValue(new UnauthorizedError('Invalid email or password.'));

    await POST(loginRequest(VALID_BODY));

    // No session exists, so the profile lookup must not be attempted.
    expect(mockGetCurrentUser).not.toHaveBeenCalled();
  });

  it('returns 400 for a malformed body before touching the auth service', async () => {
    const res = await POST(loginRequest({ email: 'not-an-email', password: '' }));
    const body = (await res.json()) as { success: boolean; error: { code: string } };

    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(mockLogin).not.toHaveBeenCalled();
  });
});