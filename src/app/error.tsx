'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { AlertCircle, Home, RefreshCw } from 'lucide-react';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log the error to an error reporting service
    console.error('Application Error:', error);
  }, [error]);

  return (
    <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center p-4 bg-slate-50">
      <Card className="max-w-md w-full">
        <CardContent className="pt-6">
          <div className="flex flex-col items-center text-center space-y-6">
            <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center">
              <AlertCircle className="w-8 h-8 text-red-600" />
            </div>

            <div className="space-y-2">
              <h1 className="text-2xl font-bold text-slate-900">Something went wrong</h1>
              <p className="text-sm text-slate-600">
                We encountered an unexpected error while processing your request.
              </p>
              {error.message && (
                <p className="text-xs text-slate-500 font-mono bg-slate-50 p-2 rounded border border-slate-200">
                  {error.message}
                </p>
              )}
            </div>

            <div className="flex flex-col sm:flex-row gap-3 w-full">
              <Button
                onClick={reset}
                variant="primary"
                leftIcon={<RefreshCw className="w-4 h-4" />}
                className="flex-1"
              >
                Try Again
              </Button>
              <Link href="/" className="flex-1">
                <Button variant="outline" leftIcon={<Home className="w-4 h-4" />} className="w-full">
                  Go Home
                </Button>
              </Link>
            </div>

            {error.digest && (
              <p className="text-xs text-slate-400">
                Error ID: {error.digest}
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
