import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { hardenSessionCookieOptions } from '@/lib/supabase/cookie-options';
import { safeCallbackRedirect, DEFAULT_REDIRECT } from '@/lib/auth/callback-redirect';
import { getAppUrl } from '@/lib/auth/app-url';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const rawRole = searchParams.get('role');
  // Strict role allowlist: only 'client' or 'consultant'; default 'client'
  const role: 'client' | 'consultant' =
    rawRole === 'consultant' || rawRole === 'client' ? rawRole : 'client';
  const validatedNext = safeCallbackRedirect(searchParams.get('next'), request.url);

  const cookieStore = await cookies();

  const supabaseUrl =
    process.env.SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    'https://placeholder.supabase.co';
  const supabasePublishableKey =
    process.env.SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    'placeholder-anon-key';

  type CookieToSet = {
    name: string;
    value: string;
    options?: Parameters<typeof hardenSessionCookieOptions>[0];
  };
  const cookiesToSet: CookieToSet[] = [];

  const supabase = createServerClient(supabaseUrl, supabasePublishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookies) {
        cookies.forEach((c) => {
          cookiesToSet.push(c);
          try {
            cookieStore.set(c.name, c.value, hardenSessionCookieOptions(c.options));
          } catch {
            // Ignore if in read-only context
          }
        });
      },
    },
  });

  const callbackUrl = new URL('/api/auth/callback', getAppUrl());
  callbackUrl.searchParams.set('role', role);
  if (validatedNext && validatedNext !== DEFAULT_REDIRECT) {
    callbackUrl.searchParams.set('next', validatedNext);
  }

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: callbackUrl.toString(),
      skipBrowserRedirect: true,
    },
  });

  if (error || !data?.url) {
    console.error('[Google OAuth Initiation Error]:', error);
    const errorUrl = new URL('/auth-error', request.url);
    errorUrl.searchParams.set(
      'message',
      'Unable to initiate Google sign-in. Please try again.'
    );
    return NextResponse.redirect(errorUrl);
  }

  const response = NextResponse.redirect(new URL(data.url));
  cookiesToSet.forEach(({ name, value, options }) => {
    const hardened = hardenSessionCookieOptions(options || {});
    response.cookies.set(name, value, {
      path: hardened.path,
      domain: hardened.domain,
      maxAge: hardened.maxAge,
      expires: hardened.expires,
      httpOnly: hardened.httpOnly,
      secure: hardened.secure,
      sameSite: (hardened.sameSite as 'lax' | 'strict' | 'none') || 'lax',
    });
  });

  return response;
}
