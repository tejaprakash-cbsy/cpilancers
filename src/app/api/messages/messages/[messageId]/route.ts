/**
 * Message Actions API
 * POST   /api/messages/messages/[messageId]/read     — Mark message as read
 * POST   /api/messages/messages/[messageId]/edit    — Edit a message
 * POST   /api/messages/messages/[messageId]/delete  — Delete a message
 * POST   /api/messages/messages/[messageId]/report  — Report a message
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

// Helper to get action from route params
function getAction(request: NextRequest): string | null {
  const match = request.nextUrl.pathname.match(/\/api\/messages\/messages\/[^\/]+\/(\w+)/);
  return match ? match[1] : null;
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

    const messageId = getMessageId(request);
    if (!messageId) {
      return NextResponse.json(
        { success: false, error: { message: 'Message ID is required.', code: 'VALIDATION_ERROR' }, statusCode: 400 },
        { status: 400 }
      );
    }

    const action = getAction(request);
    if (!action) {
      return NextResponse.json(
        { success: false, error: { message: 'Action is required.', code: 'VALIDATION_ERROR' }, statusCode: 400 },
        { status: 400 }
      );
    }

    switch (action) {
      case 'read':
        await MessagingService.markMessageAsRead(messageId);
        return NextResponse.json({ success: true, data: { markedAsRead: true } }, { status: 200 });
        
      case 'edit': {
        const body = await request.json();
        const { newContent } = body;
        
        if (!newContent || newContent.trim().length === 0) {
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
        const body = await request.json();
        const { reason, description } = body;
        
        if (!reason) {
          return NextResponse.json(
            { success: false, error: { message: 'Report reason is required.', code: 'VALIDATION_ERROR' }, statusCode: 400 },
            { status: 400 }
          );
        }
        
        const report = await MessagingService.reportMessage(messageId, reason, description);
        return NextResponse.json({ success: true, data: report }, { status: 201 });
      }
      
      default:
        return NextResponse.json(
          { success: false, error: { message: 'Invalid action.', code: 'VALIDATION_ERROR' }, statusCode: 400 },
          { status: 400 }
        );
    }
  } catch (error) {
    const formatted = formatErrorResponse(error);
    return NextResponse.json(
      { success: false, error: formatted.error, statusCode: formatted.statusCode },
      { status: formatted.statusCode }
    );
  }
}