'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert } from '@/components/ui/alert';
import { GoogleIcon } from '@/components/icons/google-icon';
import { cn } from '@/lib/utils';
import { resolvePostLoginPath } from '@/lib/auth/role-redirects';
import {
  emailOtpSendSchema,
  emailOtpVerifySchema,
  phoneOtpSendSchema,
  phoneOtpVerifySchema,
} from '@/lib/validations/auth.schemas';
import type { UserRole } from '@/types/database';
import type { LoginFormData } from '@/lib/validations/auth.schemas';

interface LoginResponse {
  success?: boolean;
  data?: { user?: { id?: string; email?: string; role?: UserRole | null } };
  error?: { message?: string };
}

type AuthMode = 'password' | 'email-otp' | 'phone-otp';

const INPUT_CLASS =
  'h-11 rounded-lg border-slate-200 focus-visible:border-[#365cf5] focus-visible:ring-2 focus-visible:ring-[#365cf5]/20';

function formatAuthError(err: unknown): string {
  if (!err) return 'An error occurred';
  const errorObj = err as { code?: string; status?: number; message?: string };
  const msg = errorObj.message || '';
  if (
    errorObj.code === 'over_email_send_rate_limit' ||
    errorObj.code === 'email_rate_limit_exceeded' ||
    errorObj.code === 'over_sms_send_rate_limit' ||
    errorObj.code === 'sms_rate_limit_exceeded' ||
    errorObj.status === 429 ||
    /rate limit|too many requests|once every \d+ seconds/i.test(msg)
  ) {
    return 'Too many verification requests. Please wait a few minutes before trying again.';
  }
  return msg || 'Authentication failed. Please try again.';
}

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const enablePhoneOtp = process.env.NEXT_PUBLIC_ENABLE_PHONE_OTP === 'true';

  const [authMode, setAuthMode] = useState<AuthMode>('password');
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  // Password Login State
  const [formData, setFormData] = useState<LoginFormData>({ email: '', password: '' });
  const [errors, setErrors] = useState<Partial<Record<keyof LoginFormData, string>>>({});

  // Email OTP State
  const [emailOtpStep, setEmailOtpStep] = useState<'input' | 'verify'>('input');
  const [emailOtpAddress, setEmailOtpAddress] = useState('');
  const [emailOtpCode, setEmailOtpCode] = useState('');
  const [emailCooldown, setEmailCooldown] = useState(0);

  // Phone OTP State
  const [phoneOtpStep, setPhoneOtpStep] = useState<'input' | 'verify'>('input');
  const [phoneOtpNumber, setPhoneOtpNumber] = useState('');
  const [phoneOtpCode, setPhoneOtpCode] = useState('');
  const [phoneCooldown, setPhoneCooldown] = useState(0);

  const nextPath = (() => {
    const raw = searchParams.get('next');
    return raw && raw.startsWith('/') && !raw.startsWith('//') ? raw : null;
  })();

  useEffect(() => {
    if (emailCooldown <= 0) return;
    const timer = setInterval(() => {
      setEmailCooldown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [emailCooldown]);

  useEffect(() => {
    if (phoneCooldown <= 0) return;
    const timer = setInterval(() => {
      setPhoneCooldown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [phoneCooldown]);

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
        // Leave the sign-in form in place
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [router, nextPath]);

  const handleGoogleSignIn = () => {
    setIsGoogleLoading(true);
    setError('');
    const targetNext = nextPath || '/dashboard';
    const params = new URLSearchParams();
    if (targetNext) params.set('next', targetNext);
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- Full document navigation to follow server redirect to Google OAuth
    window.location.href = `/api/auth/oauth/google?${params.toString()}`;
  };

  const handlePasswordChange = (field: keyof LoginFormData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: undefined }));
    }
  };

  const validatePasswordForm = (): boolean => {
    const newErrors: Partial<Record<keyof LoginFormData, string>> = {};
    if (!formData.email.trim()) newErrors.email = 'Email is required';
    else if (!formData.email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
      newErrors.email = 'Invalid email format';
    }
    if (!formData.password) newErrors.password = 'Password is required';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setNotice('');
    if (!validatePasswordForm()) return;

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

      router.push(resolvePostLoginPath(data.data?.user?.role, nextPath));
      router.refresh();
    } catch (err: unknown) {
      setError(formatAuthError(err));
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

      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: { message?: string } };
        throw new Error(data.error?.message || 'Unable to send the reset email right now.');
      }

      setNotice('If an account exists for that address, a password reset link is on its way.');
    } catch (err: unknown) {
      setError(formatAuthError(err));
    }
  };

  const handleSendEmailOtp = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setError('');
    setNotice('');

    const parseResult = emailOtpSendSchema.safeParse({ email: emailOtpAddress });
    if (!parseResult.success) {
      setError(parseResult.error.issues[0]?.message || 'Please enter a valid email address');
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch('/api/auth/otp/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel: 'email', email: parseResult.data.email }),
      });
      const data = (await response.json().catch(() => ({}))) as { error?: { message?: string } };
      if (!response.ok) {
        throw new Error(data.error?.message || 'Failed to send verification code');
      }

      setEmailOtpStep('verify');
      setEmailCooldown(60);
      setNotice(`A 6-digit verification code has been sent to ${parseResult.data.email}`);
    } catch (err: unknown) {
      setError(formatAuthError(err));
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyEmailOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const parseResult = emailOtpVerifySchema.safeParse({
      email: emailOtpAddress,
      token: emailOtpCode,
    });

    if (!parseResult.success) {
      setError(parseResult.error.issues[0]?.message || 'Please enter a valid 6-digit code');
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch('/api/auth/otp/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channel: 'email',
          identifier: parseResult.data.email,
          token: parseResult.data.token,
          role: 'consultant',
        }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        data?: { user?: { role?: UserRole } };
        error?: { message?: string };
      };

      if (!response.ok) {
        throw new Error(data.error?.message || 'Invalid or expired verification code');
      }

      const userRole = data.data?.user?.role || 'consultant';
      router.push(resolvePostLoginPath(userRole, nextPath));
      router.refresh();
    } catch (err: unknown) {
      setError(formatAuthError(err));
    } finally {
      setIsLoading(false);
    }
  };

  const handleSendPhoneOtp = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setError('');
    setNotice('');

    const parseResult = phoneOtpSendSchema.safeParse({ phone: phoneOtpNumber });
    if (!parseResult.success) {
      setError(
        parseResult.error.issues[0]?.message ||
          'Please enter a valid phone number with country code (e.g. +919876543210)'
      );
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch('/api/auth/otp/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel: 'phone', phone: parseResult.data.phone }),
      });
      const data = (await response.json().catch(() => ({}))) as { error?: { message?: string } };
      if (!response.ok) {
        throw new Error(data.error?.message || 'Failed to send verification SMS');
      }

      setPhoneOtpStep('verify');
      setPhoneCooldown(60);
      setNotice(`A 6-digit verification code has been sent to ${parseResult.data.phone}`);
    } catch (err: unknown) {
      setError(formatAuthError(err));
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyPhoneOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const parseResult = phoneOtpVerifySchema.safeParse({
      phone: phoneOtpNumber,
      token: phoneOtpCode,
    });

    if (!parseResult.success) {
      setError(parseResult.error.issues[0]?.message || 'Please enter a valid 6-digit code');
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch('/api/auth/otp/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channel: 'phone',
          identifier: parseResult.data.phone,
          token: parseResult.data.token,
          role: 'consultant',
        }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        data?: { user?: { role?: UserRole } };
        error?: { message?: string };
      };

      if (!response.ok) {
        throw new Error(data.error?.message || 'Invalid or expired verification code');
      }

      const userRole = data.data?.user?.role || 'consultant';
      router.push(resolvePostLoginPath(userRole, nextPath));
      router.refresh();
    } catch (err: unknown) {
      setError(formatAuthError(err));
    } finally {
      setIsLoading(false);
    }
  };

  const switchMode = (mode: AuthMode) => {
    setAuthMode(mode);
    setError('');
    setNotice('');
  };

  return (
    <div className="w-full max-w-[420px]">
      <div className="mb-7">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Welcome back</h1>
        <p className="mt-1.5 text-sm text-slate-500">Sign in to your CPI Lancers account</p>
      </div>

      {error && (
        <div className="mb-5">
          <Alert variant="error" title="Sign in failed">
            {error}
          </Alert>
        </div>
      )}
      {notice && (
        <div className="mb-5">
          <Alert variant="info" title="Verification code">
            {notice}
          </Alert>
        </div>
      )}

      {/* Continue with Google */}
      <Button
        type="button"
        variant="outline"
        onClick={handleGoogleSignIn}
        isLoading={isGoogleLoading}
        disabled={isLoading || isGoogleLoading}
        leftIcon={<GoogleIcon className="h-5 w-5" />}
        className="h-11 w-full rounded-lg border border-slate-200 bg-white font-medium text-slate-700 shadow-[0_1px_2px_rgba(15,23,42,0.04)] hover:bg-slate-50 hover:text-slate-900"
      >
        Continue with Google
      </Button>

      {/* Divider */}
      <div className="relative my-6">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-slate-200" />
        </div>
        <div className="relative flex justify-center text-xs uppercase tracking-wider">
          <span className="bg-white px-3 font-medium text-slate-400">Or sign in with</span>
        </div>
      </div>

      {/* Segmented Control */}
      <div
        role="tablist"
        aria-label="Sign in method"
        className={cn(
          'mb-6 grid rounded-lg bg-slate-100 p-1',
          enablePhoneOtp ? 'grid-cols-3' : 'grid-cols-2'
        )}
      >
        <button
          type="button"
          role="tab"
          aria-selected={authMode === 'password'}
          onClick={() => switchMode('password')}
          className={cn(
            'rounded-md py-1.5 text-sm font-medium transition-all',
            authMode === 'password'
              ? 'bg-white text-slate-900 shadow-sm'
              : 'text-slate-500 hover:text-slate-900'
          )}
        >
          Password
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={authMode === 'email-otp'}
          onClick={() => switchMode('email-otp')}
          className={cn(
            'rounded-md py-1.5 text-sm font-medium transition-all',
            authMode === 'email-otp'
              ? 'bg-white text-slate-900 shadow-sm'
              : 'text-slate-500 hover:text-slate-900'
          )}
        >
          Email Code
        </button>
        {enablePhoneOtp && (
          <button
            type="button"
            role="tab"
            aria-selected={authMode === 'phone-otp'}
            onClick={() => switchMode('phone-otp')}
            className={cn(
              'rounded-md py-1.5 text-sm font-medium transition-all',
              authMode === 'phone-otp'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-500 hover:text-slate-900'
            )}
          >
            Phone Code
          </button>
        )}
      </div>

      {/* Mode 1: Password Form */}
      {authMode === 'password' && (
        <form onSubmit={handlePasswordSubmit} className="space-y-4" noValidate>
          <Input
            id="login-email"
            label="Email address"
            type="email"
            autoComplete="email"
            placeholder="name@company.com"
            value={formData.email}
            onChange={(e) => handlePasswordChange('email', e.target.value)}
            error={errors.email}
            disabled={isLoading}
            className={INPUT_CLASS}
            required
          />

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label htmlFor="login-password" className="block text-sm font-medium text-[#172033]">
                Password
              </label>
              <button
                type="button"
                onClick={handleForgotPassword}
                disabled={isLoading}
                className="text-xs font-medium text-[#365cf5] hover:text-[#2445c7] hover:underline disabled:opacity-50"
              >
                Forgot password?
              </button>
            </div>
            <div className="relative flex items-center">
              <Input
                id="login-password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                placeholder="Enter your password"
                value={formData.password}
                onChange={(e) => handlePasswordChange('password', e.target.value)}
                error={errors.password}
                disabled={isLoading}
                className={cn(INPUT_CLASS, 'pr-10')}
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                className="absolute right-3 top-3 text-slate-400 transition-colors hover:text-slate-600 focus-visible:outline-none focus-visible:text-[#365cf5]"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <Button
            type="submit"
            variant="primary"
            isLoading={isLoading}
            className="mt-2 h-11 w-full rounded-lg bg-[#365cf5] font-medium hover:bg-[#2445c7]"
          >
            Sign in
          </Button>
        </form>
      )}

      {/* Mode 2: Email OTP Form */}
      {authMode === 'email-otp' && (
        <div className="space-y-4">
          {emailOtpStep === 'input' ? (
            <form onSubmit={handleSendEmailOtp} className="space-y-4" noValidate>
              <Input
                id="otp-email"
                label="Email address"
                type="email"
                autoComplete="email"
                placeholder="name@company.com"
                value={emailOtpAddress}
                onChange={(e) => setEmailOtpAddress(e.target.value)}
                disabled={isLoading}
                className={INPUT_CLASS}
                required
              />

              <Button
                type="submit"
                variant="primary"
                isLoading={isLoading}
                className="h-11 w-full rounded-lg bg-[#365cf5] font-medium hover:bg-[#2445c7]"
              >
                Send verification code
              </Button>
            </form>
          ) : (
            <form onSubmit={handleVerifyEmailOtp} className="space-y-4" noValidate>
              <div className="flex items-center justify-between rounded-lg bg-slate-50 px-3.5 py-2.5 text-xs text-slate-600">
                <span>
                  Sent to <strong className="font-medium text-slate-900">{emailOtpAddress}</strong>
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setEmailOtpStep('input');
                    setEmailOtpCode('');
                    setError('');
                    setNotice('');
                  }}
                  className="font-medium text-[#365cf5] hover:underline"
                >
                  Use a different email
                </button>
              </div>

              <Input
                id="otp-email-code"
                label="6-digit verification code"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={emailOtpCode}
                onChange={(e) => setEmailOtpCode(e.target.value.replace(/\D/g, ''))}
                disabled={isLoading}
                placeholder="000000"
                className="h-12 rounded-lg border-slate-200 text-center font-mono text-lg tracking-[0.35em] focus-visible:border-[#365cf5] focus-visible:ring-2 focus-visible:ring-[#365cf5]/20"
                required
              />

              <Button
                type="submit"
                variant="primary"
                isLoading={isLoading}
                className="h-11 w-full rounded-lg bg-[#365cf5] font-medium hover:bg-[#2445c7]"
              >
                Verify &amp; sign in
              </Button>

              <div className="pt-1 text-center text-xs text-slate-500">
                {emailCooldown > 0 ? (
                  <span>Resend code in {emailCooldown}s</span>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleSendEmailOtp()}
                    disabled={isLoading}
                    className="font-medium text-[#365cf5] hover:underline"
                  >
                    Resend code
                  </button>
                )}
              </div>
            </form>
          )}
        </div>
      )}

      {/* Mode 3: Phone OTP Form */}
      {authMode === 'phone-otp' && enablePhoneOtp && (
        <div className="space-y-4">
          {phoneOtpStep === 'input' ? (
            <form onSubmit={handleSendPhoneOtp} className="space-y-4" noValidate>
              <Input
                id="otp-phone"
                label="Mobile phone number"
                type="tel"
                autoComplete="tel"
                value={phoneOtpNumber}
                onChange={(e) => setPhoneOtpNumber(e.target.value)}
                disabled={isLoading}
                placeholder="+919876543210"
                helperText="Include country code (e.g. +91... or +1...)"
                className={INPUT_CLASS}
                required
              />

              <Button
                type="submit"
                variant="primary"
                isLoading={isLoading}
                className="h-11 w-full rounded-lg bg-[#365cf5] font-medium hover:bg-[#2445c7]"
              >
                Send SMS code
              </Button>
            </form>
          ) : (
            <form onSubmit={handleVerifyPhoneOtp} className="space-y-4" noValidate>
              <div className="flex items-center justify-between rounded-lg bg-slate-50 px-3.5 py-2.5 text-xs text-slate-600">
                <span>
                  Sent to <strong className="font-medium text-slate-900">{phoneOtpNumber}</strong>
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setPhoneOtpStep('input');
                    setPhoneOtpCode('');
                    setError('');
                    setNotice('');
                  }}
                  className="font-medium text-[#365cf5] hover:underline"
                >
                  Use a different number
                </button>
              </div>

              <Input
                id="otp-phone-code"
                label="6-digit SMS code"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={phoneOtpCode}
                onChange={(e) => setPhoneOtpCode(e.target.value.replace(/\D/g, ''))}
                disabled={isLoading}
                placeholder="000000"
                className="h-12 rounded-lg border-slate-200 text-center font-mono text-lg tracking-[0.35em] focus-visible:border-[#365cf5] focus-visible:ring-2 focus-visible:ring-[#365cf5]/20"
                required
              />

              <Button
                type="submit"
                variant="primary"
                isLoading={isLoading}
                className="h-11 w-full rounded-lg bg-[#365cf5] font-medium hover:bg-[#2445c7]"
              >
                Verify &amp; sign in
              </Button>

              <div className="pt-1 text-center text-xs text-slate-500">
                {phoneCooldown > 0 ? (
                  <span>Resend code in {phoneCooldown}s</span>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleSendPhoneOtp()}
                    disabled={isLoading}
                    className="font-medium text-[#365cf5] hover:underline"
                  >
                    Resend code
                  </button>
                )}
              </div>
            </form>
          )}
        </div>
      )}

      <p className="mt-7 text-center text-sm text-slate-500">
        Don&apos;t have an account?{' '}
        <Link
          href="/register"
          className="font-medium text-[#365cf5] hover:text-[#2445c7] hover:underline"
        >
          Create one
        </Link>
      </p>
    </div>
  );
}
