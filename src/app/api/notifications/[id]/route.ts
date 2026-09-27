import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { AuthService } from '@/services/auth.service';
import { NotificationService } from '@/services/notification.service';
import { formatErrorResponse, ValidationError } from '@/lib/errors';

/**
 * The notification id is the LEAF of this route, so it is the last non-empty path
 * component: `/api/notifications/<id>` -> `['api','notifications','<id>']`.
 *
 * `.pop()` is correct here. `.at(-2)` would be correct only if a literal segment
 * followed the id, as it does in `/api/contracts/<id>/review`. Getting that
 * backwards is what broke three Stage 11 endpoints, and it is the reason the
 * extraction is spelled out here rather than left as a one-liner.
 */
const notificationIdSchema = z.string().uuid('Invalid notification ID');

function id(request: NextRequest): string {
  const segment = request.nextUrl.pathname.split('/').filter(Boolean).pop();
  const parsed = notificationIdSchema.safeParse(segment);
  if (!parsed.success) throw new ValidationError('Invalid notification ID.');
  return parsed.data;
}

const bodySchema = z
  .object({
    is_read: z.boolean().default(true),
  })
  .strict();

/**
 * Set one notification's read state.
 *
 * The `is_read` field is honoured in both directions. It previously only
 * defaulted to `true` and was echoed straight back into the response while the
 * service always wrote `true`, so `PATCH {is_read: false}` reported success and
 * returned a state the database did not hold. The value in the response is now
 * read from the row that was actually written.
 *
 * The service scopes the update by the authenticated user as well as the id, so
 * substituting another user's notification id changes nothing: the update matches
 * no row and the caller gets a 404, which is also what a genuinely missing
 * notification returns. The distinction is deliberate — confirming that an id
 * exists would leak its existence.
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

    const body = bodySchema.parse(await request.json().catch(() => ({})));
    const notification = await NotificationService.setReadState(
      user.id,
      id(request),
      body.is_read
    );

    return NextResponse.json({
      success: true,
      data: {
        id: notification.id,
        is_read: notification.is_read,
        read_at: notification.read_at,
      },
    });
  } catch (error) {
    const formatted = formatErrorResponse(error);
    return NextResponse.json(formatted, { status: formatted.statusCode });
  }
}
