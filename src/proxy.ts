import { NextResponse, type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

export async function proxy(request: NextRequest) {
  const response = await updateSession(request);
  const protectedPath = /^\/(profile|messages|proposals|contracts|jobs\/create|jobs\/[^/]+\/(edit|proposals))(\/|$)/.test(request.nextUrl.pathname);
  if (protectedPath && !response.headers.get('x-user-id')) {
    const registerUrl = new URL('/register', request.url);
    registerUrl.searchParams.set('next', request.nextUrl.pathname);
    return NextResponse.redirect(registerUrl);
  }
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
