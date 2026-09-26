import { NextRequest, NextResponse } from 'next/server';
import { AuthService } from '@/services/auth.service';
import { loginSchema } from '@/lib/validations/auth.schemas';
import { formatErrorResponse } from '@/lib/errors';

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

    return NextResponse.json({
      success: true,
      data: {
        user: {
          id: result.user.id,
          email: result.user.email,
        },
        message: 'Login successful',
      },
    });
  } catch (error: unknown) {
    const errorResponse = formatErrorResponse(error);
    return NextResponse.json(errorResponse, { status: errorResponse.statusCode });
  }
}
