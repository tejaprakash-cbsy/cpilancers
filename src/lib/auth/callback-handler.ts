import { NextRequest, NextResponse } from 'next/server';
import type { EmailOtpType } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { AuthService } from '@/services/auth.service';
import { safeCallbackRedirect, DEFAULT_REDIRECT } from '@/lib/auth/callback-redirect';
import { resolvePostLoginPath } from '@/lib/auth/role-redirects';
import type { UserRole } from '@/types/database';

export function sanitizeCallbackErrorMessage(rawMessage?: string | null): string {
  if (!rawMessage) return 'Invalid or expired sign-in link or session';
  if (/code challenge|code verifier|pkce|invalid[_\s]grant/i.test(rawMessage)) {
    return 'Your sign-in session expired or was interrupted. Please try signing in again.';
  }
  if (/rate limit|too many requests/i.test(rawMessage)) {
    return 'Too many sign-in attempts. Please wait a few minutes before trying again.';
  }
  return rawMessage;
}

export function getCallbackRedirectBase(requestUrl: string): string {
  if (
    process.env.VERCEL_ENV === 'production' ||
    (process.env.NODE_ENV === 'production' && !process.env.VERCEL_ENV)
  ) {
    return 'https://www.cpilancers.com';
  }
  return requestUrl;
}

export async function handleAuthCallback(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const token_hash = searchParams.get('token_hash');
  const type = searchParams.get('type');
  const roleParam = searchParams.get('role');
  const next = safeCallbackRedirect(searchParams.get('next'), request.url);
  const redirectBase = getCallbackRedirectBase(request.url);

  // 1. PKCE Authorization Code Exchange (Google OAuth, magic link, email OTP links)
  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      console.error('[Auth Callback - PKCE Exchange Error]:', error.message || error);
      const errorUrl = new URL('/auth-error', redirectBase);
      errorUrl.searchParams.set('message', sanitizeCallbackErrorMessage(error.message));
      return NextResponse.redirect(errorUrl);
    }

    const user = data?.user;
    let userRole: UserRole = 'consultant';

    if (user) {
      try {
        const { user: ensuredUser } = await AuthService.ensureUserRecords(user, roleParam);
        userRole = ensuredUser.role;
        await AuthService.updateLastLogin(ensuredUser.id);
      } catch (provisionError) {
        console.error('[Auth Callback Provisioning Error]:', provisionError);
      }
    }

    const destination =
      next && next !== DEFAULT_REDIRECT
        ? next
        : resolvePostLoginPath(userRole, null);
    return NextResponse.redirect(new URL(destination, redirectBase));
  }

  // 2. Token hash + OTP type verification
  if (token_hash && type) {
    const supabase = await createClient();

    const { error } = await supabase.auth.verifyOtp({
      type: type as EmailOtpType,
      token_hash,
    });

    if (!error) {
      // Update email verification status in database
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user && type === 'email') {
        try {
          const adminSupabase = createAdminClient();
          await adminSupabase
            .from('users')
            .update({ is_email_verified: true })
            .eq('id', user.id);
        } catch {
          await supabase
            .from('users')
            .update({ is_email_verified: true })
            .eq('id', user.id);
        }
      }

      // Redirect based on type
      if (type === 'recovery' || type === 'email_change') {
        return NextResponse.redirect(new URL('/auth/reset-password', redirectBase));
      }

      // Email verification successful - redirect to dashboard or next URL
      return NextResponse.redirect(new URL(next, redirectBase));
    }
  }

  // 3. Fallback for invalid or expired tokens
  const errorUrl = new URL('/auth-error', redirectBase);
  errorUrl.searchParams.set('message', 'Invalid or expired link');
  if (type) {
    errorUrl.searchParams.set('type', type);
  }
  return NextResponse.redirect(errorUrl);
}
