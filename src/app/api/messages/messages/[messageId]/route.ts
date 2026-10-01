/**
 * Message Actions API
 * POST   /api/messages/messages/[messageId]              body: { action, ...payload }
 *   action = 'read' | 'edit' | 'delete' | 'report'
 *
 * The action is carried in the request body. It was previously read from the
 * URL path (`/api/messages/messages/<id>/edit`) by a `getAction()` helper, but
 * no `[messageId]/[action]` route segment exists, so that lookup could only ever
 * return null and every message action answered 400 "Action is required." The
 * path form is still accepted for compatibility.
 */

import { NextRequest, NextResponse } from 'next/server';
import { AuthService } from '@/services/auth.service';
import { MessagingService } from '@/services/messaging.service';
import { formatErrorResponse } from '@/lib/errors';

// Helper to get message ID from route params
function getMessageId(request: NextRequest): string | null {
  const match = request.nextUrl.pathname.match(/\/api\/messages\/messages\/([^\/]+)/);
  return match ? match[1] : null;
}

/** Action from a legacy path segment, e.g. `/api/messages/messages/<id>/edit`. */
function getActionFromPath(request: NextRequest): string | null {
  const match = request.nextUrl.pathname.match(/\/api\/messages\/messages\/[^\/]+\/(\w+)/);
  return match ? match[1] : null;
}

/** The four actions this endpoint dispatches. */
const ACTIONS = new Set(['read', 'edit', 'delete', 'report']);

export async function POST(request: NextRequest) {
  try {
    const user = await AuthService.getCurrentUser();
    if (!user) {
      return NextResponse.json(
        { success: false, error: { message: 'Authentication required.', code: 'UNAUTHORIZED' }, statusCode: 401 },
        { status: 401 }
      );
    }

    const messageId = getMessageId(request);
    if (!messageId) {
      return NextResponse.json(
        { success: false, error: { message: 'Message ID is required.', code: 'VALIDATION_ERROR' }, statusCode: 400 },
        { status: 400 }
      );
    }

    // Read the body once and tolerate an empty or absent one: the 'read' action
    // needs no payload at all, and `request.json()` on an empty body throws.
    let body: Record<string, unknown> = {};
    try {
      const parsed = await request.json();
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        body = parsed as Record<string, unknown>;
      }
    } catch {
      body = {};
    }

    const rawAction = typeof body.action === 'string' ? body.action : getActionFromPath(request);
    const action = rawAction && ACTIONS.has(rawAction) ? rawAction : null;
    if (!action) {
      return NextResponse.json(
        {
          success: false,
          error: {
            message: `Action is required. Expected one of: ${[...ACTIONS].join(', ')}.`,
            code: 'VALIDATION_ERROR',
          },
          statusCode: 400,
        },
        { status: 400 }
      );
    }

    switch (action) {
      case 'read':
        await MessagingService.markMessageAsRead(messageId);
        return NextResponse.json({ success: true, data: { markedAsRead: true } }, { status: 200 });
        
      case 'edit': {
        const newContent = body.newContent;
        
        if (typeof newContent !== 'string' || newContent.trim().length === 0) {
          return NextResponse.json(
            { success: false, error: { message: 'New content is required.', code: 'VALIDATION_ERROR' }, statusCode: 400 },
            { status: 400 }
          );
        }
        
        const updatedMessage = await MessagingService.editMessage(messageId, newContent);
        return NextResponse.json({ success: true, data: updatedMessage }, { status: 200 });
      }
      
      case 'delete':
        await MessagingService.deleteMessage(messageId);
        return NextResponse.json({ success: true, data: { deleted: true } }, { status: 200 });
        
      case 'report': {
        const { reason, description } = body;
        if (typeof reason !== 'string' || !reason) {
          return NextResponse.json(
            { success: false, error: { message: 'Report reason is required.', code: 'VALIDATION_ERROR' }, statusCode: 400 },
            { status: 400 }
          );
        }
        const report = await MessagingService.reportMessage(messageId, reason, typeof description === 'string' ? description : undefined);
        return NextResponse.json({ success: true, data: report }, { status: 201 });
      }
    }
  } catch (error) {
    const formatted = formatErrorResponse(error);
    return NextResponse.json(
      { success: false, error: formatted.error, statusCode: formatted.statusCode },
      { status: formatted.statusCode }
    );
  }
}