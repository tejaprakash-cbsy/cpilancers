import { NextResponse } from 'next/server';
import { AuthService } from '@/services/auth.service';
import { formatErrorResponse } from '@/lib/errors';

export async function POST() {
  try {
    await AuthService.logout();

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
