/**
 * Notifications API
 * GET    /api/messages/notifications     — Get unread notifications for current user
 * POST   /api/messages/notifications/[id]/read — Mark notification as read
 */

import { NextRequest, NextResponse } from 'next/server';
import { AuthService } from '@/services/auth.service';
import { MessagingService } from '@/services/messaging.service';
import { formatErrorResponse } from '@/lib/errors';

// Helper to get notification ID from route params
function getNotificationId(request: NextRequest): string | null {
  const match = request.nextUrl.pathname.match(/\/api\/messages\/notifications\/([^\/]+)/);
  return match ? match[1] : null;
}

export async function GET() {
  try {
    const user = await AuthService.getCurrentUser();
    if (!user) {
      return NextResponse.json(
        { success: false, error: { message: 'Authentication required.', code: 'UNAUTHORIZED' }, statusCode: 401 },
        { status: 401 }
      );
    }

    const notifications = await MessagingService.getUnreadNotifications();

    return NextResponse.json({ success: true, data: notifications }, { status: 200 });
  } catch (error) {
    const formatted = formatErrorResponse(error);
    return NextResponse.json(
      { success: false, error: formatted.error, statusCode: formatted.statusCode },
      { status: formatted.statusCode }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await AuthService.getCurrentUser();
    if (!user) {
      return NextResponse.json(
        { success: false, error: { message: 'Authentication required.', code: 'UNAUTHORIZED' }, statusCode: 401 },
        { status: 401 }
      );
    }

    const notificationId = getNotificationId(request);
    if (!notificationId) {
      return NextResponse.json(
        { success: false, error: { message: 'Notification ID is required.', code: 'VALIDATION_ERROR' }, statusCode: 400 },
        { status: 400 }
      );
    }

    // For marking notification as read, we would typically update the notification
    // Since we don't have a specific method for this in the service yet,
    // we'll use the Supabase client directly for now
    const supabase = await createClient();

    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq('id', notificationId)
      .eq('user_id', user.id);

    if (error) {
      console.error('[DB Error - Mark Notification Read]:', error);
      throw new AppError('Failed to mark notification as read', 500);
    }

    return NextResponse.json({ success: true, data: { markedAsRead: true } }, { status: 200 });
  } catch (error) {
    const formatted = formatErrorResponse(error);
    return NextResponse.json(
      { success: false, error: formatted.error, statusCode: formatted.statusCode },
      { status: formatted.statusCode }
    );
  }
}

// We need to import createClient
import { createClient } from '@/lib/supabase/server';
import { AppError } from '@/lib/errors';