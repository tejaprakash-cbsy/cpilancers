import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { AuthService } from '@/services/auth.service';
import { NotificationService } from '@/services/notification.service';
import { notificationTypeEnum } from '@/lib/notifications/types';
import { formatErrorResponse } from '@/lib/errors';

/**
 * Notification preferences for the authenticated user.
 *
 * GET returns the *effective* matrix — every registered channel and every event
 * type resolved to a boolean or `locked` — rather than the sparse list of stored
 * overrides, so a settings screen cannot present a channel as unset when it is
 * actually on by default.
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

    return NextResponse.json({ success: true, data: await NotificationService.getPreferences(user.id) });
  } catch (error) {
    const formatted = formatErrorResponse(error);
    return NextResponse.json(formatted, { status: formatted.statusCode });
  }
}

const updateSchema = z
  .object({
    type: notificationTypeEnum,
    channel: z.string().min(1).max(50),
    enabled: z.boolean(),
  })
  .strict();

/**
 * Set one preference.
 *
 * There is no user id in the body: the preference is always written against the
 * authenticated caller, so a body cannot be used to edit someone else's settings.
 */
export async function PATCH(request: NextRequest) {
  try {
    const user = await AuthService.getCurrentUser();
    if (!user) {
      return NextResponse.json(
        { success: false, error: { message: 'Authentication required.', code: 'UNAUTHORIZED' } },
        { status: 401 }
      );
    }

    const input = updateSchema.parse(await request.json());
    const preference = await NotificationService.setPreference(
      user.id,
      input.type,
      input.channel,
      input.enabled
    );

    return NextResponse.json({ success: true, data: preference });
  } catch (error) {
    const formatted = formatErrorResponse(error);
    return NextResponse.json(formatted, { status: formatted.statusCode });
  }
}
