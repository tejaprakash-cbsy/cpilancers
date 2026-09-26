import { NextRequest, NextResponse } from 'next/server';
import { AuthService } from '@/services/auth.service';
import { registerSchema } from '@/lib/validations/auth.schemas';
import { formatErrorResponse } from '@/lib/errors';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate input
    const validatedData = registerSchema.parse(body);

    // Register user
    const result = await AuthService.register({
      email: validatedData.email,
      password: validatedData.password,
      role: validatedData.role,
      firstName: validatedData.firstName,
      lastName: validatedData.lastName,
    });

    return NextResponse.json(
      {
        success: true,
        data: {
          user: {
            id: result.user.id,
            email: result.user.email,
          },
          emailSent: result.emailSent,
          message: 'Registration successful! Please check your email to verify your account.',
        },
      },
      { status: 201 }
    );
  } catch (error: unknown) {
    const errorResponse = formatErrorResponse(error);
    return NextResponse.json(errorResponse, { status: errorResponse.statusCode });
  }
}
