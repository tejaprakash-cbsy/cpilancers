'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Briefcase, Check, Eye, EyeOff, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert } from '@/components/ui/alert';
import { GoogleIcon } from '@/components/icons/google-icon';
import { cn } from '@/lib/utils';
import { getRegisterFieldErrors } from '@/lib/validations/auth.schemas';
import type { RegisterFormData } from '@/lib/validations/auth.schemas';

const INPUT_CLASS =
  'h-11 rounded-lg border-slate-200 focus-visible:border-[#365cf5] focus-visible:ring-2 focus-visible:ring-[#365cf5]/20';

export default function RegisterPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [formData, setFormData] = useState<RegisterFormData>({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    confirmPassword: '',
    role: 'consultant',
    agreeToTerms: false,
  });
  const [errors, setErrors] = useState<Partial<Record<keyof RegisterFormData, string>>>({});

  const handleChange = (field: keyof RegisterFormData, value: string | boolean) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: undefined }));
    }
  };

  const validateForm = (): boolean => {
    const newErrors = getRegisterFieldErrors(formData);
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!validateForm()) return;

    setIsLoading(true);

    try {
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error?.message || 'Registration failed');
      }

      setSuccess(true);
      setTimeout(() => {
        router.push('/verify-email');
      }, 3000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An error occurred during registration');
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleSignUp = () => {
    setIsGoogleLoading(true);
    setError('');
    const role = formData.role || 'consultant';
    const targetNext = role === 'client' ? '/dashboard/client' : '/dashboard/consultant';
    const params = new URLSearchParams();
    params.set('role', role);
    params.set('next', targetNext);
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- Full document navigation to follow server redirect to Google OAuth
    window.location.href = `/api/auth/oauth/google?${params.toString()}`;
  };

  if (success) {
    return (
      <div className="w-full max-w-[460px]">
        <Alert variant="success" title="Registration Successful!">
          Please check your email to verify your account. You&apos;ll be redirected shortly.
        </Alert>
      </div>
    );
  }

  return (
    <div className="w-full max-w-[460px]">
      <div className="mb-7">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          Create your account
        </h1>
        <p className="mt-1.5 text-sm text-slate-500">
          Join India&apos;s specialized SAP Integration platform
        </p>
      </div>

      {error && (
        <div className="mb-5">
          <Alert variant="error" title="Registration Failed">
            {error}
          </Alert>
        </div>
      )}

      {/* Role Selection */}
      <div className="mb-6 space-y-2.5">
        <label className="block text-sm font-medium text-slate-700">I want to</label>
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => handleChange('role', 'client')}
            className={cn(
              'relative rounded-xl p-4 text-left transition-all',
              formData.role === 'client'
                ? 'border-2 border-[#365cf5] bg-[#365cf5]/[0.04]'
                : 'border border-slate-200 bg-white hover:border-slate-300'
            )}
          >
            {formData.role === 'client' && (
              <span className="absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-full bg-[#365cf5] text-white">
                <Check className="h-3 w-3" strokeWidth={2.5} />
              </span>
            )}
            <Briefcase className="mb-2.5 h-5 w-5 text-[#365cf5]" />
            <div className="text-sm font-semibold text-slate-900">Hire Consultants</div>
            <div className="mt-0.5 text-xs text-slate-500">Post SAP projects</div>
          </button>

          <button
            type="button"
            onClick={() => handleChange('role', 'consultant')}
            className={cn(
              'relative rounded-xl p-4 text-left transition-all',
              formData.role === 'consultant'
                ? 'border-2 border-[#365cf5] bg-[#365cf5]/[0.04]'
                : 'border border-slate-200 bg-white hover:border-slate-300'
            )}
          >
            {formData.role === 'consultant' && (
              <span className="absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-full bg-[#365cf5] text-white">
                <Check className="h-3 w-3" strokeWidth={2.5} />
              </span>
            )}
            <Users className="mb-2.5 h-5 w-5 text-[#365cf5]" />
            <div className="text-sm font-semibold text-slate-900">Join as Consultant</div>
            <div className="mt-0.5 text-xs text-slate-500">Offer SAP CPI expertise</div>
          </button>
        </div>
      </div>

      {/* Google OAuth Button */}
      <Button
        type="button"
        variant="outline"
        onClick={handleGoogleSignUp}
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
          <span className="bg-white px-3 font-medium text-slate-400">Or register with email</span>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        {/* Name Fields */}
        <div className="grid grid-cols-2 gap-3">
          <Input
            label="First name"
            type="text"
            placeholder="Aarav"
            value={formData.firstName}
            onChange={(e) => handleChange('firstName', e.target.value)}
            error={errors.firstName}
            disabled={isLoading}
            className={INPUT_CLASS}
            required
          />
          <Input
            label="Last name"
            type="text"
            placeholder="Sharma"
            value={formData.lastName}
            onChange={(e) => handleChange('lastName', e.target.value)}
            error={errors.lastName}
            disabled={isLoading}
            className={INPUT_CLASS}
            required
          />
        </div>

        {/* Email */}
        <Input
          label="Email address"
          type="email"
          autoComplete="email"
          placeholder="name@company.com"
          value={formData.email}
          onChange={(e) => handleChange('email', e.target.value)}
          error={errors.email}
          disabled={isLoading}
          className={INPUT_CLASS}
          required
        />

        {/* Password */}
        <div className="space-y-1.5">
          <label htmlFor="register-password" className="block text-sm font-medium text-[#172033]">
            Password
          </label>
          <div className="relative flex items-center">
            <Input
              id="register-password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              placeholder="Create a strong password"
              value={formData.password}
              onChange={(e) => handleChange('password', e.target.value)}
              error={errors.password}
              helperText="Minimum 8 characters with uppercase, lowercase, and number"
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

        {/* Confirm Password */}
        <div className="space-y-1.5">
          <label
            htmlFor="register-confirm-password"
            className="block text-sm font-medium text-[#172033]"
          >
            Confirm password
          </label>
          <div className="relative flex items-center">
            <Input
              id="register-confirm-password"
              type={showConfirmPassword ? 'text' : 'password'}
              autoComplete="new-password"
              placeholder="Re-enter your password"
              value={formData.confirmPassword}
              onChange={(e) => handleChange('confirmPassword', e.target.value)}
              error={errors.confirmPassword}
              disabled={isLoading}
              className={cn(INPUT_CLASS, 'pr-10')}
              required
            />
            <button
              type="button"
              onClick={() => setShowConfirmPassword((prev) => !prev)}
              aria-label={showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'}
              className="absolute right-3 top-3 text-slate-400 transition-colors hover:text-slate-600 focus-visible:outline-none focus-visible:text-[#365cf5]"
            >
              {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {/* Terms Checkbox */}
        <div className="pt-1">
          <label htmlFor="terms" className="flex items-start gap-2.5 text-xs leading-5 text-slate-600">
            <input
              type="checkbox"
              id="terms"
              checked={formData.agreeToTerms}
              onChange={(e) => handleChange('agreeToTerms', e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 accent-[#365cf5]"
              disabled={isLoading}
            />
            <span>
              I agree to the{' '}
              <Link
                href="/terms"
                className="font-medium text-[#365cf5] hover:text-[#2445c7] hover:underline"
              >
                Terms of Service
              </Link>{' '}
              and{' '}
              <Link
                href="/privacy"
                className="font-medium text-[#365cf5] hover:text-[#2445c7] hover:underline"
              >
                Privacy Policy
              </Link>
              .
            </span>
          </label>
          {errors.agreeToTerms && (
            <p className="mt-1.5 text-xs text-[#b42318]">{errors.agreeToTerms}</p>
          )}
        </div>

        {/* Submit Button */}
        <Button
          type="submit"
          variant="primary"
          isLoading={isLoading}
          className="h-11 w-full rounded-lg bg-[#365cf5] font-medium hover:bg-[#2445c7]"
        >
          Create account
        </Button>

        {/* Login Link */}
        <p className="pt-2 text-center text-sm text-slate-500">
          Already have an account?{' '}
          <Link
            href="/login"
            className="font-medium text-[#365cf5] hover:text-[#2445c7] hover:underline"
          >
            Sign in
          </Link>
        </p>
      </form>
    </div>
  );
}
