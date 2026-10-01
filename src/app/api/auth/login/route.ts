import { NextRequest, NextResponse } from 'next/server';
import { AuthService } from '@/services/auth.service';
import { loginSchema } from '@/lib/validations/auth.schemas';
import { formatErrorResponse } from '@/lib/errors';
import type { UserRole } from '@/types/database';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate input
    const validatedData = loginSchema.parse(body);

    // Login user
    const result = await AuthService.login({
      email: validatedData.email,
      password: validatedData.password,
    });

    // The sign-in form routes on the caller's real role, so the role has to
    // travel with the response. `AuthService.getCurrentUser` reads it from
    // `public.users.role` (via the service-role client, which bypasses the RLS
    // policies that would otherwise hide the row from the session client) --
    // the same lookup every other role-gated route already depends on.
    //
    // A lookup failure must not fail an otherwise successful sign-in, so the
    // role degrades to `null` and the client falls back to its default home.
    let role: UserRole | null = null;
    try {
      const profile = await AuthService.getCurrentUser();
      role = profile?.role ?? null;
    } catch (error) {
      console.error('[Auth Login - Role Lookup]:', error);
    }

    return NextResponse.json({
      success: true,
      data: {
        user: {
          id: result.user.id,
          email: result.user.email,
          role,
        },
        message: 'Login successful',
      },
    });
  } catch (error: unknown) {
    const errorResponse = formatErrorResponse(error);
    return NextResponse.json(errorResponse, { status: errorResponse.statusCode });
  }
}
