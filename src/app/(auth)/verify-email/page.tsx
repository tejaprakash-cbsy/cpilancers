import type { Metadata } from 'next';
import Link from 'next/link';
import { Mail, CheckCircle, ArrowRight, HelpCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Logo } from '@/components/brand/logo';

export const metadata: Metadata = {
  title: 'Verify Your Email | CPI Lancers',
  description: 'Please verify your email address to complete your CPI Lancers account registration.',
};

export default function VerifyEmailPage() {
  return (
    <div className="flex items-center justify-center min-h-[calc(100vh-144px)] p-4 sm:p-6 bg-slate-50">
      <Card className="max-w-md w-full shadow-md border-slate-200">
        <CardHeader className="text-center pb-2">
          <div className="mb-4 flex items-center justify-center">
            <Link href="/" className="inline-flex">
              <Logo size={42} />
            </Link>
          </div>
          <div className="mx-auto w-16 h-16 rounded-full bg-blue-50 flex items-center justify-center text-[#365cf5] mb-4">
            <Mail className="w-8 h-8" />
          </div>
          <CardTitle className="text-2xl font-bold text-slate-900">
            Check Your Email
          </CardTitle>
          <CardDescription className="text-slate-600 mt-2 text-sm leading-relaxed">
            We&apos;ve sent a verification link to your email address. Please check your inbox and click the link to activate your CPI Lancers account.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6 pt-4">
          <div className="bg-slate-50 rounded-xl p-4 border border-slate-200/80 text-xs text-slate-600 space-y-2">
            <div className="font-semibold text-slate-800 flex items-center gap-1.5">
              <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
              What happens next?
            </div>
            <ul className="list-disc list-inside space-y-1 pl-1 text-slate-600">
              <li>Click the activation button in the email.</li>
              <li>Use the link to complete the account verification flow.</li>
              <li>You can sign in and complete your enterprise profile.</li>
            </ul>
          </div>

          <div className="flex flex-col gap-3">
            <Link href="/login" className="w-full">
              <Button variant="primary" className="w-full justify-center" size="lg">
                Proceed to Sign In <ArrowRight className="w-4 h-4 ml-1.5" />
              </Button>
            </Link>
            <Link href="/" className="w-full">
              <Button variant="outline" className="w-full justify-center" size="md">
                Return to Homepage
              </Button>
            </Link>
          </div>

          <div className="pt-2 border-t border-slate-100 text-center text-xs text-slate-500 flex items-center justify-center gap-1">
            <HelpCircle className="w-3.5 h-3.5" />
            <span>Didn&apos;t receive it? Check your spam folder or contact support.</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
