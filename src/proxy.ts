import { NextResponse, type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

export async function proxy(request: NextRequest) {
  const response = await updateSession(request);
  const { pathname } = request.nextUrl;

  const protectedPath =
    /^\/(profile|messages|proposals|contracts|jobs\/create|jobs\/[^/]+\/(edit|proposals))(\/|$)/.test(pathname);

  // Stage 13: the administrator surface. This is a REDIRECT for convenience
  // only. An unauthenticated visitor is turned away before a route handler ever
  // runs, but the real authorization is `AdminService.requireAdmin`, which
  // re-reads the role from the database on every admin request. Nothing here is
  // trusted for that purpose, and a signed-in non-administrator passes straight
  // through this check to be rejected by the service with a 403.
  const adminPath = /^\/admin(\/|$)/.test(pathname);
  const isSignedIn = Boolean(response.headers.get('x-user-id'));

  if (adminPath && !isSignedIn) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('next', pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (protectedPath && !isSignedIn) {
    const registerUrl = new URL('/register', request.url);
    registerUrl.searchParams.set('next', pathname);
    return NextResponse.redirect(registerUrl);
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
