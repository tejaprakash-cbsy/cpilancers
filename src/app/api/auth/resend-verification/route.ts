import { NextRequest, NextResponse } from 'next/server';
import { AuthService } from '@/services/auth.service';
import { formatErrorResponse } from '@/lib/errors';
import { z } from 'zod';

const resendVerificationSchema = z.object({
  email: z
    .string()
    .min(1, 'Email is required')
    .trim()
    .email('Please enter a valid email address'),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email } = resendVerificationSchema.parse(body);

    await AuthService.resendVerificationEmail(email);

    return NextResponse.json({
      success: true,
      message: 'If an account exists for that address, a verification email has been sent.',
    });
  } catch (error: unknown) {
    const errorResponse = formatErrorResponse(error);
    return NextResponse.json(errorResponse, { status: errorResponse.statusCode });
  }
}