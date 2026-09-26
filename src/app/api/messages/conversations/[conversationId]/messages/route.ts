/**
 * Conversation Messages API
 * GET    /api/messages/conversations/[conversationId]/messages — Get messages for conversation
 * POST   /api/messages/conversations/[conversationId]/messages — Send a message
 */

import { NextRequest, NextResponse } from 'next/server';
import { AuthService } from '@/services/auth.service';
import { MessagingService } from '@/services/messaging.service';
import { formatErrorResponse } from '@/lib/errors';

// Helper to get conversation ID from route params
function getConversationId(request: NextRequest): string | null {
  const match = request.nextUrl.pathname.match(/\/api\/messages\/conversations\/([^\/]+)\/messages/);
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

    // Get query parameters for pagination
    const url = new URL(request.url);
    const page = parseInt(url.searchParams.get('page') || '1');
    const limit = parseInt(url.searchParams.get('limit') || '50');

    const messages = await MessagingService.getMessages(conversationId, page, limit);

    return NextResponse.json({ success: true, data: messages }, { status: 200 });
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

    const conversationId = getConversationId(request);
    if (!conversationId) {
      return NextResponse.json(
        { success: false, error: { message: 'Conversation ID is required.', code: 'VALIDATION_ERROR' }, statusCode: 400 },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { content, attachments } = body;

    if (!content || content.trim().length === 0) {
      return NextResponse.json(
        { success: false, error: { message: 'Message content is required.', code: 'VALIDATION_ERROR' }, statusCode: 400 },
        { status: 400 }
      );
    }

    // Note: In a real implementation, we'd handle file uploads differently
    // For now, we'll assume attachments are processed client-side and passed as metadata
    // A proper implementation would use request.formData() to handle file uploads
    
    const message = await MessagingService.sendMessage(
      conversationId,
      content,
      attachments || []
    );

    return NextResponse.json({ success: true, data: message }, { status: 201 });
  } catch (error) {
    const formatted = formatErrorResponse(error);
    return NextResponse.json(
      { success: false, error: formatted.error, statusCode: formatted.statusCode },
      { status: formatted.statusCode }
    );
  }
}