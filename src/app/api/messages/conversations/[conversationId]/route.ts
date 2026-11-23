/**
 * Conversation Detail API
 * GET    /api/messages/conversations/[conversationId]     — Get conversation details
 * GET    /api/messages/conversations/[conversationId]/messages — Get messages for conversation
 * POST   /api/messages/conversations/[conversationId]/messages — Send a message
 */

import { NextRequest, NextResponse } from 'next/server';
import { AuthService } from '@/services/auth.service';
import { MessagingService } from '@/services/messaging.service';
import { formatErrorResponse } from '@/lib/errors';

// Helper to get conversation ID from route params
function getConversationId(request: NextRequest): string | null {
  const match = request.nextUrl.pathname.match(/\/api\/messages\/conversations\/([^/]+)/);
  return match ? match[1] : null;
}

export async function GET(request: NextRequest) {
  try {
    const user = await AuthService.getCurrentUser();
    if (!user) {
      return NextResponse.json(
        { success: false, error: { message: 'Authentication required.', code: 'UNAUTHORIZED' }, statusCode: 401 },
        { status: 401 }
      );
    }

    const conversationId = getConversationId(request);
    if (!conversationId) {
      return NextResponse.json(
        { success: false, error: { message: 'Conversation ID is required.', code: 'VALIDATION_ERROR' }, statusCode: 400 },
        { status: 400 }
      );
    }

    const conversation = await MessagingService.getConversationById(conversationId);

    if (!conversation) {
      return NextResponse.json(
        { success: false, error: { message: 'Conversation not found.', code: 'NOT_FOUND' }, statusCode: 404 },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: conversation }, { status: 200 });
  } catch (error) {
    const formatted = formatErrorResponse(error);
    return NextResponse.json(
      { success: false, error: formatted.error, statusCode: formatted.statusCode },
      { status: formatted.statusCode }
    );
  }
}
