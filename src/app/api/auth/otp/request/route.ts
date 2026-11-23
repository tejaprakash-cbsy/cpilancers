import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { otpRequestSchema } from '@/lib/validations/auth.schemas';
import { getAppUrl } from '@/lib/auth/app-url';
import { isRateLimitError } from '@/services/auth.service';
import { AppError, ForbiddenError, RateLimitError, formatErrorResponse } from '@/lib/errors';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validated = otpRequestSchema.parse(body);

    if (validated.channel === 'phone') {
      const isPhoneEnabled = process.env.NEXT_PUBLIC_ENABLE_PHONE_OTP === 'true';
      if (!isPhoneEnabled) {
        throw new ForbiddenError('Phone authentication is currently disabled.');
      }
    }

    const supabase = await createClient();

    if (validated.channel === 'email') {
      const { error } = await supabase.auth.signInWithOtp({
        email: validated.email,
        options: {
          emailRedirectTo: `${getAppUrl()}/api/auth/callback`,
        },
      });

      if (error) {
        if (isRateLimitError(error)) {
          throw new RateLimitError('Too many verification requests. Please wait a few minutes before trying again.');
        }
        throw new AppError(error.message || 'Failed to send verification email', 400, 'OTP_REQUEST_FAILED');
      }
    } else {
      const { error } = await supabase.auth.signInWithOtp({
        phone: validated.phone,
      });

      if (error) {
        if (isRateLimitError(error)) {
          throw new RateLimitError('Too many verification requests. Please wait a few minutes before trying again.');
        }
        throw new AppError(error.message || 'Failed to send verification SMS', 400, 'OTP_REQUEST_FAILED');
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Verification code sent successfully',
    });
  } catch (error: unknown) {
    const errorResponse = formatErrorResponse(error);
    return NextResponse.json(errorResponse, { status: errorResponse.statusCode });
  }
}
