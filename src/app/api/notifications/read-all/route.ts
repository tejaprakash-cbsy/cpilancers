import { NextResponse } from 'next/server';
import { AuthService } from '@/services/auth.service';
import { NotificationService } from '@/services/notification.service';
import { formatErrorResponse } from '@/lib/errors';

/**
 * Clear the unread badge in one call.
 *
 * Idempotent: a user with nothing unread succeeds with `updated: 0`. A client
 * that retries after a timeout must not be told the call failed.
 */
export async function POST() {
  try {
    const user = await AuthService.getCurrentUser();
    if (!user) {
      return NextResponse.json(
        { success: false, error: { message: 'Authentication required.', code: 'UNAUTHORIZED' } },
        { status: 401 }
      );
    }

    const result = await NotificationService.markAllAsRead(user.id);
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    const formatted = formatErrorResponse(error);
    return NextResponse.json(formatted, { status: formatted.statusCode });
  }
}
