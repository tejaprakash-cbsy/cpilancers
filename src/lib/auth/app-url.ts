import { AppError } from '@/lib/errors';

export function getAppUrl(): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (configured) return configured.replace(/\/+$/, '');

  // Vercel sets NODE_ENV="production" for both production and preview deployments.
  // Use VERCEL_ENV to differentiate: only real production requires NEXT_PUBLIC_APP_URL to be set.
  // In Vercel preview (VERCEL_ENV === 'preview') or development, fall back to Vercel URLs or localhost.
  const isProduction =
    process.env.VERCEL_ENV === 'production' ||
    (process.env.NODE_ENV === 'production' && !process.env.VERCEL_ENV);

  if (isProduction) {
    throw new AppError(
      'NEXT_PUBLIC_APP_URL must be configured in production environment',
      500,
      'APP_URL_NOT_CONFIGURED'
    );
  }

  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }
  return 'http://localhost:3000';
}
