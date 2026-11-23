import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { AuthService } from '@/services/auth.service';
import { otpVerifySchema } from '@/lib/validations/auth.schemas';
import { isRateLimitError } from '@/services/auth.service';
import { AppError, ForbiddenError, RateLimitError, formatErrorResponse } from '@/lib/errors';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validated = otpVerifySchema.parse(body);

    if (validated.channel === 'phone') {
      const isPhoneEnabled = process.env.NEXT_PUBLIC_ENABLE_PHONE_OTP === 'true';
      if (!isPhoneEnabled) {
        throw new ForbiddenError('Phone authentication is currently disabled.');
      }
    }

    const supabase = await createClient();

    let verifyResult;
    if (validated.channel === 'email') {
      verifyResult = await supabase.auth.verifyOtp({
        email: validated.identifier,
        token: validated.token,
        type: 'email',
      });
    } else {
      verifyResult = await supabase.auth.verifyOtp({
        phone: validated.identifier,
        token: validated.token,
        type: 'sms',
      });
    }

    if (verifyResult.error) {
      if (isRateLimitError(verifyResult.error)) {
        throw new RateLimitError('Too many attempts. Please wait a few minutes before trying again.');
      }
      throw new AppError(
        verifyResult.error.message || 'Invalid or expired verification code',
        400,
        'OTP_VERIFY_FAILED'
      );
    }

    const authUser = verifyResult.data?.user;
    if (!authUser) {
      throw new AppError('Authentication failed. No user session returned.', 400, 'OTP_VERIFY_FAILED');
    }

    // Idempotent user & profile provisioning with strict role enforcement
    const { user } = await AuthService.ensureUserRecords(authUser, validated.role);

    // Update last login timestamp
    await AuthService.updateLastLogin(user.id);

    return NextResponse.json({
      success: true,
      data: {
        user: {
          id: user.id,
          email: user.email,
          role: user.role,
        },
        message: 'Authentication successful',
      },
    });
  } catch (error: unknown) {
    const errorResponse = formatErrorResponse(error);
    return NextResponse.json(errorResponse, { status: errorResponse.statusCode });
  }
}
