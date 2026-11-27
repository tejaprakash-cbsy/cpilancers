import { NextResponse } from 'next/server';
import { AuthService } from '@/services/auth.service';
import { resetPasswordSchema } from '@/lib/validations/auth.schemas';
import { formatErrorResponse } from '@/lib/errors';

const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const RATE_LIMIT_MAX_ATTEMPTS = 5;
const passwordAttemptBuckets = new Map<string, { count: number; resetAt: number }>();

function isRateLimited(userId: string): boolean {
  const now = Date.now();
  const bucket = passwordAttemptBuckets.get(userId);
  if (!bucket || now >= bucket.resetAt) {
    passwordAttemptBuckets.set(userId, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }
  if (bucket.count >= RATE_LIMIT_MAX_ATTEMPTS) {
    return true;
  }
  bucket.count += 1;
  return false;
}

export async function POST(request: Request) {
  try {
    const user = await AuthService.getCurrentUser();
    if (!user) {
      return NextResponse.json(
        { success: false, error: { message: 'Authentication required.', code: 'UNAUTHORIZED' } },
        { status: 401 }
      );
    }

    if (isRateLimited(user.id)) {
      return NextResponse.json(
        {
          success: false,
          error: {
            message: 'Too many password update attempts. Please try again in 15 minutes.',
            code: 'RATE_LIMITED',
          },
        },
        { status: 429 }
      );
    }

    const body = await request.json();
    const validatedData = resetPasswordSchema.parse(body);

    await AuthService.updatePassword(validatedData.password);

    return NextResponse.json({
      success: true,
      data: {
        message: 'Password updated successfully.',
      },
    });
  } catch (error: unknown) {
    const formatted = formatErrorResponse(error);
    return NextResponse.json(formatted, { status: formatted.statusCode });
  }
}
