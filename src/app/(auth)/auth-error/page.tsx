import type { Metadata } from 'next';
import Link from 'next/link';
import { Mail, AlertCircle, ArrowRight, HelpCircle, RefreshCw } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Logo } from '@/components/brand/logo';

export const metadata: Metadata = {
  title: 'Authentication Error | CPI Lancers',
  description: 'An error occurred during authentication. Please try again or contact support.',
};

interface AuthErrorPageProps {
  searchParams: Promise<{ message?: string; type?: string }>;
}

export default async function AuthErrorPage({ searchParams }: AuthErrorPageProps) {
  const resolvedParams = await searchParams;
  const message = resolvedParams.message || 'An unknown authentication error occurred.';
  const type = resolvedParams.type || 'error';

  const isEmailConfirmationError = type === 'email' || message.toLowerCase().includes('email');
  const isPasswordResetError = type === 'recovery' || message.toLowerCase().includes('password reset');

  return (
    <div className="flex items-center justify-center min-h-[calc(100vh-144px)] p-4 sm:p-6 bg-slate-50">
      <Card className="max-w-md w-full shadow-md border-slate-200">
        <CardHeader className="text-center pb-2">
          <div className="mb-4 flex items-center justify-center">
            <Link href="/" className="inline-flex">
              <Logo size={42} />
            </Link>
          </div>
          <div className="mx-auto w-16 h-16 rounded-full bg-red-50 flex items-center justify-center text-red-600 mb-4">
            <AlertCircle className="w-8 h-8" />
          </div>
          <CardTitle className="text-2xl font-bold text-slate-900">
            Authentication Error
          </CardTitle>
          <CardDescription className="text-slate-600 mt-2 text-sm leading-relaxed">
            {message}
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6 pt-4">
          <div className="bg-slate-50 rounded-xl p-4 border border-slate-200/80 text-xs text-slate-600 space-y-2">
            <div className="font-semibold text-slate-800 flex items-center gap-1.5">
              <HelpCircle className="w-4 h-4 text-amber-600 shrink-0" />
              What happened?
            </div>
            <ul className="list-disc list-inside space-y-1 pl-1 text-slate-600">
              <li>The link you clicked may have expired or already been used.</li>
              <li>Email confirmation links are valid for a limited time.</li>
              <li>Password reset links expire after 1 hour.</li>
            </ul>
          </div>

          <div className="flex flex-col gap-3">
            {isEmailConfirmationError && (
              <Link href="/api/auth/resend-verification" className="w-full">
                <Button variant="primary" className="w-full justify-center" size="lg">
                  <Mail className="w-4 h-4 mr-1.5" />
                  Resend Verification Email
                </Button>
              </Link>
            )}
            {isPasswordResetError && (
              <Link href="/login" className="w-full">
                <Button variant="primary" className="w-full justify-center" size="lg">
                  <RefreshCw className="w-4 h-4 mr-1.5" />
                  Request New Password Reset
                </Button>
              </Link>
            )}
            <Link href="/login" className="w-full">
              <Button variant="outline" className="w-full justify-center" size="md">
                <ArrowRight className="w-4 h-4 mr-1.5" />
                Back to Sign In
              </Button>
            </Link>
            <Link href="/" className="w-full">
              <Button variant="ghost" className="w-full justify-center" size="md">
                Return to Homepage
              </Button>
            </Link>
          </div>

          <div className="pt-2 border-t border-slate-100 text-center text-xs text-slate-500 flex items-center justify-center gap-1">
            <HelpCircle className="w-3.5 h-3.5" />
            <span>Still having trouble? Contact support@cpilancers.com</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}