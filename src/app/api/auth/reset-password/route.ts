import { NextRequest, NextResponse } from 'next/server';
import { AuthService } from '@/services/auth.service';
import { forgotPasswordSchema, resetPasswordSchema } from '@/lib/validations/auth.schemas';
import { formatErrorResponse } from '@/lib/errors';

/**
 * Send password reset email
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');

    if (action === 'send') {
      // Validate email
      const validatedData = forgotPasswordSchema.parse(body);

      // Send reset email
      await AuthService.sendPasswordResetEmail(validatedData.email);

      return NextResponse.json({
        success: true,
        data: {
          message: 'If an account exists with this email, you will receive password reset instructions.',
        },
      });
    } else if (action === 'reset') {
      // Validate new password
      const validatedData = resetPasswordSchema.parse(body);

      // Update password
      await AuthService.updatePassword(validatedData.password);

      return NextResponse.json({
        success: true,
        data: {
          message: 'Password updated successfully. You can now log in with your new password.',
        },
      });
    } else {
      return NextResponse.json(
        {
          success: false,
          error: {
            message: 'Invalid action parameter',
            code: 'INVALID_ACTION',
          },
        },
        { status: 400 }
      );
    }
  } catch (error: unknown) {
    const errorResponse = formatErrorResponse(error);
    return NextResponse.json(errorResponse, { status: errorResponse.statusCode });
  }
}
