'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert } from '@/components/ui/alert';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { LogIn, Mail } from 'lucide-react';
import { Logo } from '@/components/brand/logo';
import { resolvePostLoginPath } from '@/lib/auth/role-redirects';
import type { UserRole } from '@/types/database';
import type { LoginFormData } from '@/lib/validations/auth.schemas';

/**
 * Shape of `POST /api/auth/login`. `user.role` is `null` when the role lookup
 * failed on the server, in which case the shared helper picks the default home.
 */
interface LoginResponse {
  success?: boolean;
  data?: { user?: { id?: string; email?: string; role?: UserRole | null } };
  error?: { message?: string };
}

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [formData, setFormData] = useState<LoginFormData>({ email: '', password: '' });
  const [errors, setErrors] = useState<Partial<Record<keyof LoginFormData, string>>>({});

  // Only same-origin relative paths are honoured, so a crafted `?next=` value
  // cannot turn this form into an open redirect that bounces a signed-in user
  // to an attacker's site. The validation itself lives in `role-redirects` so
  // the server-side and client-side rules cannot drift apart.
  const nextPath = (() => {
    const raw = searchParams.get('next');
    return raw && raw.startsWith('/') && !raw.startsWith('//') ? raw : null;
  })();

  const handleChange = (field: keyof LoginFormData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: undefined }));
    }
  };

  const validateForm = (): boolean => {
    const newErrors: Partial<Record<keyof LoginFormData, string>> = {};
    if (!formData.email.trim()) newErrors.email = 'Email is required';
    else if (!formData.email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) newErrors.email = 'Invalid email format';
    if (!formData.password) newErrors.password = 'Password is required';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // An already-authenticated visitor has no business on the sign-in form, and
  // after a refresh the session cookie is still valid while this client
  // component starts with empty state. Probe once on mount and bounce them to
  // their own dashboard.
  //
  // Fails open on purpose: a network error or a 401 must leave the form usable,
  // and a still-in-flight request must not fire a redirect once the user has
  // already started typing. The `cancelled` flag covers unmount and the
  // `started` ref covers React 19 StrictMode's double-invoked effects, so the
  // probe runs exactly once.
  const sessionCheckStarted = useRef(false);

  useEffect(() => {
    if (sessionCheckStarted.current) return;
    sessionCheckStarted.current = true;

    let cancelled = false;

    (async () => {
      try {
        const response = await fetch('/api/auth/me', { cache: 'no-store' });
        if (cancelled || !response.ok) return;
        const data = (await response.json().catch(() => null)) as
          | { success?: boolean; data?: { role?: UserRole } }
          | null;
        if (cancelled || !data?.success) return;
        router.replace(resolvePostLoginPath(data.data?.role, nextPath));
      } catch {
        // Leave the sign-in form in place; it must work regardless.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [router, nextPath]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setNotice('');
    if (!validateForm()) return;

    setIsLoading(true);
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      const data = (await response.json().catch(() => ({}))) as LoginResponse;
      if (!response.ok) {
        throw new Error(data.error?.message || 'Sign in failed');
      }

      // Route on the role the server resolved, not a hardcoded path. A safe
      // `?next=` still wins so the deep link the user was bounced from works.
      router.push(resolvePostLoginPath(data.data?.user?.role, nextPath));
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An error occurred during sign in');
    } finally {
      setIsLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    const email = formData.email.trim();
    if (!email || !email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
      setErrors((prev) => ({ ...prev, email: 'Enter your email address first' }));
      return;
    }
    setError('');
    try {
      const response = await fetch('/api/auth/reset-password?action=send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      // `fetch` only rejects on a network-level failure. A 4xx/5xx resolves
      // normally, so without this check the user was shown the reassuring
      // "reset link is on its way" message even when the request was rejected --
      // telling them an email was sent when it demonstrably was not.
      if (!response.ok) {
        throw new Error('Unable to send the reset email right now.');
      }

      // Deliberately neutral copy: the endpoint is written to avoid disclosing
      // whether an account exists, so the UI must not imply either outcome.
      setNotice('If an account exists for that address, a password reset link is on its way.');
    } catch {
      setError('Unable to send the reset email right now. Please try again.');
    }
  };

return (
    <div className="flex items-center justify-center min-h-screen p-4">
      <Card className="max-w-md w-full">
        <CardHeader className="text-center">
          <div className="mb-4 flex items-center justify-center">
            <Logo size={44} />
          </div>
          <CardTitle className="text-2xl">Welcome back</CardTitle>
          <CardDescription>Sign in to your Lancers account</CardDescription>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            {error && (
              <Alert variant="error" title="Sign in failed">
                {error}
              </Alert>
            )}
            {notice && (
              <Alert variant="info" title="Check your inbox">
                {notice}
              </Alert>
            )}

            <Input
              id="login-email"
              label="Email Address"
              type="email"
              autoComplete="email"
              value={formData.email}
              onChange={(e) => handleChange('email', e.target.value)}
              error={errors.email}
              disabled={isLoading}
              leftIcon={<Mail className="w-4 h-4" aria-hidden="true" />}
              required
            />

            <Input
              id="login-password"
              label="Password"
              type="password"
              autoComplete="current-password"
              value={formData.password}
              onChange={(e) => handleChange('password', e.target.value)}
              error={errors.password}
              disabled={isLoading}
              required
            />

            <div className="flex justify-end">
              <button
                type="button"
                onClick={handleForgotPassword}
                disabled={isLoading}
                className="text-xs font-medium text-[#0a4d8c] hover:underline disabled:opacity-50"
              >
                Forgot password?
              </button>
            </div>

            <Button
              type="submit"
              variant="primary"
              size="lg"
              isLoading={isLoading}
              leftIcon={<LogIn className="w-5 h-5" aria-hidden="true" />}
              className="w-full"
            >
              Sign In
            </Button>

            <p className="text-center text-sm text-slate-600">
              Don&apos;t have an account?{' '}
              <Link href="/register" className="text-[#0a4d8c] font-medium hover:underline">
                Create one
              </Link>
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}