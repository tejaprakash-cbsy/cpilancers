import { NextResponse } from 'next/server';
import { AuthService } from '@/services/auth.service';
import { NotificationService } from '@/services/notification.service';
import { formatErrorResponse } from '@/lib/errors';

/**
 * Unread badge count.
 *
 * Separate from the feed so a poll for the badge is a single `count: 'exact'`
 * query that transfers no rows, rather than a page of notifications. The
 * per-type breakdown is intentionally omitted here: it requires the rows
 * themselves and belongs on the settings screen, not on a polled endpoint.
 */
export async function GET() {
  try {
    const user = await AuthService.getCurrentUser();
    if (!user) {
      return NextResponse.json(
        { success: false, error: { message: 'Authentication required.', code: 'UNAUTHORIZED' } },
        { status: 401 }
      );
    }

    return NextResponse.json({
      success: true,
      data: { unread_count: await NotificationService.getUnreadCount(user.id) },
    });
  } catch (error) {
    const formatted = formatErrorResponse(error);
    return NextResponse.json(formatted, { status: formatted.statusCode });
  }
}
