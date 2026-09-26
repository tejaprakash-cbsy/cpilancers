import { NextRequest, NextResponse } from 'next/server';
import type { EmailOtpType } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';

/**
 * Auth callback route for email verification and password reset
 * Handles the redirect after clicking email verification or password reset links
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const token_hash = searchParams.get('token_hash');
  const type = searchParams.get('type');
  const next = searchParams.get('next') ?? '/';

  if (token_hash && type) {
    const supabase = await createClient();

    const { error } = await supabase.auth.verifyOtp({
      type: type as EmailOtpType,
      token_hash,
    });

    if (!error) {
      // Update email verification status in database
      const { data: { user } } = await supabase.auth.getUser();

      if (user && type === 'email') {
        await supabase
          .from('users')
          .update({ is_email_verified: true })
          .eq('id', user.id);
      }

      // Redirect based on type
      if (type === 'recovery' || type === 'email_change') {
        return NextResponse.redirect(new URL('/auth/reset-password', request.url));
      }

      // Email verification successful - redirect to dashboard or next URL
      return NextResponse.redirect(new URL(next, request.url));
    }
  }

  // Redirect to error page or login if token is invalid
  return NextResponse.redirect(new URL('/auth/auth-error?message=Invalid or expired link', request.url));
}
