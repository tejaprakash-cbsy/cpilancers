import { NextRequest, NextResponse } from 'next/server';
import { AuthService } from '@/services/auth.service';
import { formatErrorResponse } from '@/lib/errors';

export async function POST(request: NextRequest) {
  try {
    await AuthService.logout();

    // Redirect back to home page instead of returning JSON
    return NextResponse.redirect(new URL('/', request.url));
  } catch (error: unknown) {
    const errorResponse = formatErrorResponse(error);
    return NextResponse.json(errorResponse, { status: errorResponse.statusCode });
  }
}
