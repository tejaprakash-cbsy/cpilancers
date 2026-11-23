import { NextRequest } from 'next/server';
import { handleAuthCallback } from '@/lib/auth/callback-handler';

/**
 * Route handler for /auth/callback
 * Handles OAuth PKCE code exchange, email verification, and OTP callback redirects
 */
export async function GET(request: NextRequest) {
  return handleAuthCallback(request);
}
