'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert } from '@/components/ui/alert';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { UserPlus, Briefcase, Users } from 'lucide-react';
import { Logo } from '@/components/brand/logo';
import { getRegisterFieldErrors } from '@/lib/validations/auth.schemas';
import type { RegisterFormData } from '@/lib/validations/auth.schemas';

export default function RegisterPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
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
    // Clear field error when user starts typing
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
      // Redirect after 3 seconds
      setTimeout(() => {
        router.push('/verify-email');
      }, 3000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An error occurred during registration');
    } finally {
      setIsLoading(false);
    }
  };

  if (success) {
    return (
      <div className="flex items-center justify-center min-h-screen p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6">
            <Alert variant="success" title="Registration Successful!">
              Please check your email to verify your account. You&apos;ll be redirected shortly.
            </Alert>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-screen p-4">
      <Card className="max-w-2xl w-full">
        <CardHeader className="text-center">
          <Link href="/" className="mb-4 inline-flex justify-center">
            <Logo size={40} />
          </Link>
          <CardTitle>Create Your Account</CardTitle>
          <CardDescription>
            Join CPI Lancers, the premier SAP Integration marketplace
          </CardDescription>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            {error && (
              <Alert variant="error" title="Registration Failed">
                {error}
              </Alert>
            )}

            {/* Role Selection */}
            <div className="space-y-3">
              <label className="block text-sm font-medium text-slate-700">
                I want to:
              </label>
              <div className="grid grid-cols-2 gap-4">
                <button
                  type="button"
                  onClick={() => handleChange('role', 'client')}
                  className={`p-4 rounded-lg border-2 transition-all text-left ${
                    formData.role === 'client'
                      ? 'border-[#0a4d8c] bg-blue-50'
                      : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <Briefcase className="w-6 h-6 text-[#0a4d8c] mb-2" />
                  <div className="font-semibold text-slate-900">Hire Consultants</div>
                  <div className="text-xs text-slate-600">Post integration projects</div>
                </button>

                <button
                  type="button"
                  onClick={() => handleChange('role', 'consultant')}
                  className={`p-4 rounded-lg border-2 transition-all text-left ${
                    formData.role === 'consultant'
                      ? 'border-[#0a4d8c] bg-blue-50'
                      : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <Users className="w-6 h-6 text-[#0a4d8c] mb-2" />
                  <div className="font-semibold text-slate-900">Find Work</div>
                  <div className="text-xs text-slate-600">Offer SAP CPI expertise</div>
                </button>
              </div>
            </div>

            {/* Name Fields */}
            <div className="grid grid-cols-2 gap-4">
              <Input
                label="First Name"
                type="text"
                value={formData.firstName}
                onChange={(e) => handleChange('firstName', e.target.value)}
                error={errors.firstName}
                disabled={isLoading}
                required
              />
              <Input
                label="Last Name"
                type="text"
                value={formData.lastName}
                onChange={(e) => handleChange('lastName', e.target.value)}
                error={errors.lastName}
                disabled={isLoading}
                required
              />
            </div>

            {/* Email */}
            <Input
              label="Email Address"
              type="email"
              value={formData.email}
              onChange={(e) => handleChange('email', e.target.value)}
              error={errors.email}
              disabled={isLoading}
              required
            />

            {/* Password */}
            <Input
              label="Password"
              type="password"
              value={formData.password}
              onChange={(e) => handleChange('password', e.target.value)}
              error={errors.password}
              helperText="Minimum 8 characters with uppercase, lowercase, and number"
              disabled={isLoading}
              required
            />

            {/* Confirm Password */}
            <Input
              label="Confirm Password"
              type="password"
              value={formData.confirmPassword}
              onChange={(e) => handleChange('confirmPassword', e.target.value)}
              error={errors.confirmPassword}
              disabled={isLoading}
              required
            />

            {/* Terms Checkbox */}
            <div className="flex items-start gap-2">
              <input
                type="checkbox"
                id="terms"
                checked={formData.agreeToTerms}
                onChange={(e) => handleChange('agreeToTerms', e.target.checked)}
                className="mt-1"
                disabled={isLoading}
              />
              <label htmlFor="terms" className="text-sm text-slate-600">
                I agree to the{' '}
                <Link href="/terms" className="text-[#0a4d8c] hover:underline">
                  Terms of Service
                </Link>{' '}
                and{' '}
                <Link href="/privacy" className="text-[#0a4d8c] hover:underline">
                  Privacy Policy
                </Link>
              </label>
            </div>
            {errors.agreeToTerms && (
              <p className="text-xs text-red-600 -mt-4">{errors.agreeToTerms}</p>
            )}

            {/* Submit Button */}
            <Button
              type="submit"
              variant="primary"
              size="lg"
              isLoading={isLoading}
              leftIcon={<UserPlus className="w-5 h-5" />}
              className="w-full"
            >
              Create Account
            </Button>

            {/* Login Link */}
            <p className="text-center text-sm text-slate-600">
              Already have an account?{' '}
              <Link href="/login" className="text-[#0a4d8c] font-medium hover:underline">
                Sign in
              </Link>
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
