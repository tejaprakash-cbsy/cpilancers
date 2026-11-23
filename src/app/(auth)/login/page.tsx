'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert } from '@/components/ui/alert';
import { Card, CardContent, CardHeader, CardDescription } from '@/components/ui/card';
import { LogIn, Mail, Phone, KeyRound } from 'lucide-react';
import { Logo } from '@/components/brand/logo';
import { GoogleIcon } from '@/components/icons/google-icon';
import { createClient } from '@/lib/supabase/client';
import { getAppUrl } from '@/lib/auth/app-url';
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

  // Cooldown timers
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

  // Session probe
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

  // Handle Google OAuth
  const handleGoogleSignIn = async () => {
    try {
      setIsGoogleLoading(true);
      setError('');
      const supabase = createClient();
      const targetNext = nextPath || '/dashboard';
      const redirectTo = `${getAppUrl()}/api/auth/callback?next=${encodeURIComponent(targetNext)}`;
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo,
        },
      });
      if (oauthError) throw oauthError;
    } catch (err: unknown) {
      setError(formatAuthError(err));
      setIsGoogleLoading(false);
    }
  };

  // Password handlers
  const handlePasswordChange = (field: keyof LoginFormData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: undefined }));
    }
  };

  const validatePasswordForm = (): boolean => {
    const newErrors: Partial<Record<keyof LoginFormData, string>> = {};
    if (!formData.email.trim()) newErrors.email = 'Email is required';
    else if (!formData.email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) newErrors.email = 'Invalid email format';
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

  // Email OTP handlers
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

  // Phone OTP handlers
  const handleSendPhoneOtp = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setError('');
    setNotice('');

    const parseResult = phoneOtpSendSchema.safeParse({ phone: phoneOtpNumber });
    if (!parseResult.success) {
      setError(parseResult.error.issues[0]?.message || 'Please enter a valid phone number with country code (e.g. +1234567890)');
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
    <div className="flex items-center justify-center min-h-screen p-4">
      <Card className="max-w-md w-full">
        <CardHeader className="text-center">
          <div className="mb-4 flex items-center justify-center">
            <Logo size={44} />
          </div>
          <h1 className="text-2xl font-medium leading-normal text-[#172033]">Welcome back</h1>
          <CardDescription>Sign in to your CPI Lancers account</CardDescription>
        </CardHeader>

        <CardContent>
          {error && (
            <div className="mb-4">
              <Alert variant="error" title="Sign in failed">
                {error}
              </Alert>
            </div>
          )}
          {notice && (
            <div className="mb-4">
              <Alert variant="info" title="Verification code">
                {notice}
              </Alert>
            </div>
          )}

          {/* Continue with Google */}
          <Button
            type="button"
            variant="outline"
            size="lg"
            onClick={handleGoogleSignIn}
            isLoading={isGoogleLoading}
            disabled={isLoading || isGoogleLoading}
            leftIcon={<GoogleIcon className="w-5 h-5" />}
            className="w-full border-slate-300 text-slate-700 hover:bg-slate-50 hover:text-slate-900 font-medium mb-4"
          >
            Continue with Google
          </Button>

          {/* Divider */}
          <div className="relative my-4">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-slate-200" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-white px-3 text-slate-500 font-medium">
                Or sign in with
              </span>
            </div>
          </div>

          {/* Mode Switcher Tabs */}
          <div className="flex border-b border-slate-200 mb-6">
            <button
              type="button"
              onClick={() => switchMode('password')}
              className={`flex-1 py-2 text-sm font-medium border-b-2 transition-colors ${
                authMode === 'password'
                  ? 'border-[#365cf5] text-[#365cf5]'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              Password
            </button>
            <button
              type="button"
              onClick={() => switchMode('email-otp')}
              className={`flex-1 py-2 text-sm font-medium border-b-2 transition-colors ${
                authMode === 'email-otp'
                  ? 'border-[#365cf5] text-[#365cf5]'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              Email Code
            </button>
            {enablePhoneOtp && (
              <button
                type="button"
                onClick={() => switchMode('phone-otp')}
                className={`flex-1 py-2 text-sm font-medium border-b-2 transition-colors ${
                  authMode === 'phone-otp'
                    ? 'border-[#365cf5] text-[#365cf5]'
                    : 'border-transparent text-slate-500 hover:text-slate-700'
                }`}
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
                label="Email Address"
                type="email"
                autoComplete="email"
                value={formData.email}
                onChange={(e) => handlePasswordChange('email', e.target.value)}
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
                onChange={(e) => handlePasswordChange('password', e.target.value)}
                error={errors.password}
                disabled={isLoading}
                required
              />

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={handleForgotPassword}
                  disabled={isLoading}
                  className="text-xs font-medium text-[#365cf5] hover:text-[#2445c7] hover:underline disabled:opacity-50"
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
            </form>
          )}

          {/* Mode 2: Email OTP Form */}
          {authMode === 'email-otp' && (
            <div className="space-y-4">
              {emailOtpStep === 'input' ? (
                <form onSubmit={handleSendEmailOtp} className="space-y-4" noValidate>
                  <Input
                    id="otp-email"
                    label="Email Address"
                    type="email"
                    autoComplete="email"
                    value={emailOtpAddress}
                    onChange={(e) => setEmailOtpAddress(e.target.value)}
                    disabled={isLoading}
                    leftIcon={<Mail className="w-4 h-4" aria-hidden="true" />}
                    placeholder="you@example.com"
                    required
                  />

                  <Button
                    type="submit"
                    variant="primary"
                    size="lg"
                    isLoading={isLoading}
                    leftIcon={<Mail className="w-5 h-5" aria-hidden="true" />}
                    className="w-full"
                  >
                    Send Verification Code
                  </Button>
                </form>
              ) : (
                <form onSubmit={handleVerifyEmailOtp} className="space-y-4" noValidate>
                  <div className="text-xs text-slate-600 flex justify-between items-center">
                    <span>
                      Code sent to <strong className="text-slate-800">{emailOtpAddress}</strong>
                    </span>
                    <button
                      type="button"
                      onClick={() => setEmailOtpStep('input')}
                      className="text-[#365cf5] hover:underline"
                    >
                      Change
                    </button>
                  </div>

                  <Input
                    id="otp-email-code"
                    label="6-Digit Verification Code"
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    value={emailOtpCode}
                    onChange={(e) => setEmailOtpCode(e.target.value.replace(/\D/g, ''))}
                    disabled={isLoading}
                    placeholder="123456"
                    leftIcon={<KeyRound className="w-4 h-4" aria-hidden="true" />}
                    required
                  />

                  <Button
                    type="submit"
                    variant="primary"
                    size="lg"
                    isLoading={isLoading}
                    leftIcon={<LogIn className="w-5 h-5" aria-hidden="true" />}
                    className="w-full"
                  >
                    Verify & Sign In
                  </Button>

                  <div className="text-center text-xs text-slate-500 pt-1">
                    {emailCooldown > 0 ? (
                      <span>Resend code in {emailCooldown}s</span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleSendEmailOtp()}
                        disabled={isLoading}
                        className="text-[#365cf5] hover:underline font-medium"
                      >
                        Resend Code
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
                    label="Mobile Phone Number"
                    type="tel"
                    autoComplete="tel"
                    value={phoneOtpNumber}
                    onChange={(e) => setPhoneOtpNumber(e.target.value)}
                    disabled={isLoading}
                    leftIcon={<Phone className="w-4 h-4" aria-hidden="true" />}
                    placeholder="+1234567890"
                    helperText="Include country code (e.g. +1... or +91...)"
                    required
                  />

                  <Button
                    type="submit"
                    variant="primary"
                    size="lg"
                    isLoading={isLoading}
                    leftIcon={<Phone className="w-5 h-5" aria-hidden="true" />}
                    className="w-full"
                  >
                    Send SMS Code
                  </Button>
                </form>
              ) : (
                <form onSubmit={handleVerifyPhoneOtp} className="space-y-4" noValidate>
                  <div className="text-xs text-slate-600 flex justify-between items-center">
                    <span>
                      Code sent to <strong className="text-slate-800">{phoneOtpNumber}</strong>
                    </span>
                    <button
                      type="button"
                      onClick={() => setPhoneOtpStep('input')}
                      className="text-[#365cf5] hover:underline"
                    >
                      Change
                    </button>
                  </div>

                  <Input
                    id="otp-phone-code"
                    label="6-Digit SMS Code"
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    value={phoneOtpCode}
                    onChange={(e) => setPhoneOtpCode(e.target.value.replace(/\D/g, ''))}
                    disabled={isLoading}
                    placeholder="123456"
                    leftIcon={<KeyRound className="w-4 h-4" aria-hidden="true" />}
                    required
                  />

                  <Button
                    type="submit"
                    variant="primary"
                    size="lg"
                    isLoading={isLoading}
                    leftIcon={<LogIn className="w-5 h-5" aria-hidden="true" />}
                    className="w-full"
                  >
                    Verify & Sign In
                  </Button>

                  <div className="text-center text-xs text-slate-500 pt-1">
                    {phoneCooldown > 0 ? (
                      <span>Resend code in {phoneCooldown}s</span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleSendPhoneOtp()}
                        disabled={isLoading}
                        className="text-[#365cf5] hover:underline font-medium"
                      >
                        Resend Code
                      </button>
                    )}
                  </div>
                </form>
              )}
            </div>
          )}

          <p className="mt-6 text-center text-sm text-slate-600">
            Don&apos;t have an account?{' '}
            <Link href="/register" className="text-[#365cf5] font-medium hover:text-[#2445c7] hover:underline">
              Create one
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
