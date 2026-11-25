import { describe, expect, it, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const mockSignInWithOAuth = vi.fn();
let lastSetAll: ((cookies: Array<{ name: string; value: string; options?: unknown }>) => void) | null = null;

vi.mock('next/headers', () => ({
  cookies: vi.fn().mockResolvedValue({
    getAll: vi.fn().mockReturnValue([]),
    set: vi.fn(),
  }),
}));

vi.mock('@supabase/ssr', () => ({
  createServerClient: vi.fn((_url, _key, options) => {
    lastSetAll = options?.cookies?.setAll || null;
    return {
      auth: {
        signInWithOAuth: (...args: unknown[]) => mockSignInWithOAuth(...args),
      },
    };
  }),
}));

import { GET } from '@/app/api/auth/oauth/google/route';

describe('GET /api/auth/oauth/google', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    lastSetAll = null;
    mockSignInWithOAuth.mockResolvedValue({
      data: {
        url: 'https://accounts.google.com/o/oauth2/v2/auth?client_id=google-client&redirect_uri=callback',
      },
      error: null,
    });
  });

  it('redirects to the OAuth URL returned by Supabase', async () => {
    const req = new NextRequest('http://localhost:3000/api/auth/oauth/google');
    const res = await GET(req);

    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toContain('accounts.google.com');
  });

  it('strictly enforces role allowlist and passes valid role=consultant', async () => {
    const req = new NextRequest('http://localhost:3000/api/auth/oauth/google?role=consultant');
    await GET(req);

    expect(mockSignInWithOAuth).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'google',
        options: expect.objectContaining({
          redirectTo: expect.stringContaining('role=consultant'),
          skipBrowserRedirect: true,
        }),
      })
    );
  });

  it('strictly enforces role allowlist and passes valid role=client', async () => {
    const req = new NextRequest('http://localhost:3000/api/auth/oauth/google?role=client');
    await GET(req);

    expect(mockSignInWithOAuth).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'google',
        options: expect.objectContaining({
          redirectTo: expect.stringContaining('role=client'),
        }),
      })
    );
  });

  it('rejects role=admin and defaults to role=client', async () => {
    const req = new NextRequest('http://localhost:3000/api/auth/oauth/google?role=admin');
    await GET(req);

    expect(mockSignInWithOAuth).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'google',
        options: expect.objectContaining({
          redirectTo: expect.stringContaining('role=client'),
        }),
      })
    );
    expect(mockSignInWithOAuth).not.toHaveBeenCalledWith(
      expect.objectContaining({
        options: expect.objectContaining({
          redirectTo: expect.stringContaining('role=admin'),
        }),
      })
    );
  });

  it('defaults to role=client when role is omitted', async () => {
    const req = new NextRequest('http://localhost:3000/api/auth/oauth/google');
    await GET(req);

    expect(mockSignInWithOAuth).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'google',
        options: expect.objectContaining({
          redirectTo: expect.stringContaining('role=client'),
        }),
      })
    );
  });

  it('preserves safe internal next destination in redirectTo', async () => {
    const req = new NextRequest(
      'http://localhost:3000/api/auth/oauth/google?role=consultant&next=/dashboard/consultant'
    );
    await GET(req);

    expect(mockSignInWithOAuth).toHaveBeenCalledWith(
      expect.objectContaining({
        options: expect.objectContaining({
          redirectTo: expect.stringContaining('next=%2Fdashboard%2Fconsultant'),
        }),
      })
    );
  });

  it('refuses external next destination and strips it from redirectTo', async () => {
    const req = new NextRequest(
      'http://localhost:3000/api/auth/oauth/google?role=client&next=https://evil.example.com'
    );
    await GET(req);

    expect(mockSignInWithOAuth).toHaveBeenCalledWith(
      expect.objectContaining({
        options: expect.objectContaining({
          redirectTo: expect.not.stringContaining('evil.example.com'),
        }),
      })
    );
  });

  it('attaches PKCE code-verifier cookies with HttpOnly, Secure, and SameSite=Lax to the response', async () => {
    mockSignInWithOAuth.mockImplementation(async () => {
      if (lastSetAll) {
        lastSetAll([
          {
            name: 'sb-test-auth-token-code-verifier',
            value: 'secret-verifier-12345',
            options: { path: '/', maxAge: 3600 },
          },
        ]);
      }
      return {
        data: { url: 'https://accounts.google.com/oauth' },
        error: null,
      };
    });

    const req = new NextRequest('http://localhost:3000/api/auth/oauth/google');
    const res = await GET(req);

    const setCookie = res.headers.get('set-cookie');
    expect(setCookie).toBeDefined();
    expect(setCookie).toContain('sb-test-auth-token-code-verifier=secret-verifier-12345');
    expect(setCookie?.toLowerCase()).toContain('httponly');
    expect(setCookie?.toLowerCase()).toContain('samesite=lax');
  });

  it('redirects to /auth-error if signInWithOAuth returns an error', async () => {
    mockSignInWithOAuth.mockResolvedValue({
      data: null,
      error: { message: 'OAuth provider configuration error' },
    });

    const req = new NextRequest('http://localhost:3000/api/auth/oauth/google');
    const res = await GET(req);

    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toContain('/auth-error?message=Unable+to+initiate+Google+sign-in');
  });
});
