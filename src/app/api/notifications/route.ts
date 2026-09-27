import { NextRequest, NextResponse } from 'next/server';
import { AuthService } from '@/services/auth.service';
import { NotificationService } from '@/services/notification.service';
import { notificationTypeEnum } from '@/lib/notifications/types';
import { formatErrorResponse } from '@/lib/errors';

/**
 * The caller's own notification feed, newest first.
 *
 * The user id comes from the validated session, never from a query parameter, so
 * there is no way to ask for someone else's notifications by changing the URL.
 */
export async function GET(request: NextRequest) {
  try {
    const user = await AuthService.getCurrentUser();
    if (!user) {
      return NextResponse.json(
        { success: false, error: { message: 'Authentication required.', code: 'UNAUTHORIZED' } },
        { status: 401 }
      );
    }

    const params = request.nextUrl.searchParams;
    const page = Number(params.get('page') ?? '1') || 1;
    const limit = Math.min(Number(params.get('limit') ?? '20') || 20, 100);
    const unreadOnly = params.get('unread') === 'true';
    const typeParam = params.get('type');

    let type: ReturnType<typeof notificationTypeEnum.parse> | undefined;
    if (typeParam) {
      const parsed = notificationTypeEnum.safeParse(typeParam);
      // An unknown type is a 400 rather than an empty list, so a client bug is
      // not mistaken for "you have no notifications".
      if (!parsed.success) {
        return NextResponse.json(
          { success: false, error: { message: 'Unknown notification type.', code: 'VALIDATION_ERROR' } },
          { status: 400 }
        );
      }
      type = parsed.data;
    }

    const { notifications, total } = await NotificationService.listNotifications(user.id, {
      unreadOnly,
      ...(type ? { type } : {}),
      page,
      limit,
    });

    const summary = await NotificationService.getUnreadCount(user.id);

    return NextResponse.json({
      success: true,
      data: {
        notifications,
        unread_count: summary,
        pagination: {
          total,
          page,
          limit,
          pages: Math.max(1, Math.ceil(total / limit)),
        },
      },
    });
  } catch (error) {
    const formatted = formatErrorResponse(error);
    return NextResponse.json(formatted, { status: formatted.statusCode });
  }
}
