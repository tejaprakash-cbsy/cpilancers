import { NextResponse } from 'next/server';
import { AuthService } from '@/services/auth.service';
import { formatErrorResponse } from '@/lib/errors';

export async function POST(...args: unknown[]) {
  try {
    await AuthService.logout();

    const request = args[0] as Request | undefined;
    // If browser form submission (HTML), redirect to home page
    const accept = request?.headers?.get('accept') || '';
    if (accept.includes('text/html') && request?.url) {
      return NextResponse.redirect(new URL('/', request.url));
    }

    return NextResponse.json({
      success: true,
      data: {
        message: 'Logout successful',
      },
    });
  } catch (error: unknown) {
    const errorResponse = formatErrorResponse(error);
    return NextResponse.json(errorResponse, { status: errorResponse.statusCode });
  }
}
