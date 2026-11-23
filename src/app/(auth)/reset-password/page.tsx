'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert } from '@/components/ui/alert';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Lock, CheckCircle2 } from 'lucide-react';
import { Logo } from '@/components/brand/logo';

export default function ResetPasswordPage() {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errors, setErrors] = useState<{ password?: string; confirmPassword?: string }>({});
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const validate = (): boolean => {
    const nextErrors: { password?: string; confirmPassword?: string } = {};
    if (!password) {
      nextErrors.password = 'Password is required';
    } else if (password.length < 8) {
      nextErrors.password = 'Password must be at least 8 characters';
    }
    if (!confirmPassword) {
      nextErrors.confirmPassword = 'Confirm your password';
    } else if (password !== confirmPassword) {
      nextErrors.confirmPassword = 'Passwords do not match';
    }
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!validate()) return;

    setIsLoading(true);
    try {
      const response = await fetch('/api/auth/reset-password?action=reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password, confirmPassword }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.error?.message || 'Password update failed.');
      }

      setSuccess(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to update password. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  if (success) {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-144px)] p-4 sm:p-6 bg-slate-50">
        <Card className="max-w-md w-full shadow-md border-slate-200">
          <CardHeader className="text-center pb-2">
            <div className="mb-4 flex items-center justify-center">
              <Link href="/" className="inline-flex">
                <Logo size={42} />
              </Link>
            </div>
            <div className="mx-auto w-16 h-16 rounded-full bg-emerald-50 flex items-center justify-center text-emerald-600 mb-4">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <CardTitle className="text-2xl font-bold text-slate-900">
              Password Updated
            </CardTitle>
            <CardDescription className="text-slate-600 mt-2 text-sm leading-relaxed">
              Your password has been successfully reset. You can now sign in with your new credentials.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-4">
            <Link href="/login" className="w-full">
              <Button variant="primary" className="w-full justify-center" size="lg">
                Proceed to Sign In
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-[calc(100vh-144px)] p-4 sm:p-6 bg-slate-50">
      <Card className="max-w-md w-full shadow-md border-slate-200">
        <CardHeader className="text-center pb-2">
          <div className="mb-4 flex items-center justify-center">
            <Link href="/" className="inline-flex">
              <Logo size={42} />
            </Link>
          </div>
          <CardTitle className="text-2xl font-bold text-slate-900">
            Set New Password
          </CardTitle>
          <CardDescription className="text-slate-600 mt-2 text-sm leading-relaxed">
            Enter your new password below to secure your account.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4 pt-4">
          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            {error && (
              <Alert variant="error" title="Reset Failed">
                {error}
              </Alert>
            )}

            <Input
              id="new-password"
              label="New Password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                if (errors.password) setErrors((prev) => ({ ...prev, password: undefined }));
              }}
              error={errors.password}
              disabled={isLoading}
              leftIcon={<Lock className="w-4 h-4" aria-hidden="true" />}
              required
            />

            <Input
              id="confirm-password"
              label="Confirm New Password"
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => {
                setConfirmPassword(e.target.value);
                if (errors.confirmPassword) setErrors((prev) => ({ ...prev, confirmPassword: undefined }));
              }}
              error={errors.confirmPassword}
              disabled={isLoading}
              leftIcon={<Lock className="w-4 h-4" aria-hidden="true" />}
              required
            />

            <Button
              type="submit"
              variant="primary"
              size="lg"
              isLoading={isLoading}
              className="w-full"
            >
              Update Password
            </Button>

            <p className="text-center text-sm text-slate-600">
              Remember your password?{' '}
              <Link href="/login" className="text-[#365cf5] font-medium hover:text-[#2445c7] hover:underline">
                Sign in
              </Link>
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
