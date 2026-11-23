import { NextRequest } from 'next/server';
import { handleAuthCallback } from '@/lib/auth/callback-handler';

/**
 * Auth callback route for email verification, password reset, and OAuth PKCE exchange
 */
export async function GET(request: NextRequest) {
  return handleAuthCallback(request);
}
